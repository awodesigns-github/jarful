import { useCallback, useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { secureStorage } from "./client";
import { clearSavedDraft, outbox } from "./offline";
import { resetSettingsCache } from "./settings";
import { session, type PendingMerge } from "./session";

export type Account = {
  userId: string;
  kind: "anonymous" | "signedIn";
  method: "google" | "email" | null;
  email: string | null;
  name: string | null;
};

export type AuthErrorCode =
  | "offline" // no connection: ask them to connect first, nothing is lost
  | "unavailable" // that method is not set up on this deployment
  | "invalid-email"
  | "invalid-code" // wrong or expired code
  | "failed"; // anything else: a calm "something went wrong, try again"

export class AuthFlowError extends Error {
  constructor(public code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthFlowError";
  }
}

/** Matches the server: a merge token works for 30 minutes. */
const MERGE_TTL_MS = 30 * 60 * 1000;

/** Which optional methods this deployment has set up: { google, email }. Undefined while loading. */
export function useAuthMethods(): { google: boolean; email: boolean } | undefined {
  return useQuery(api.auth.getAuthMethods);
}

/** The current account: anonymous or signed in (with method, email, name). Undefined while loading. */
export function useAccount(): Account | null | undefined {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.account.getAccount, isAuthenticated ? {} : "skip");
}

function useGuards() {
  const convex = useConvex();
  const createToken = useMutation(api.account.createMergeToken);
  const account = useAccount();
  const accountRef = useRef(account);
  accountRef.current = account;
  const tokenRef = useRef(createToken);
  tokenRef.current = createToken;
  const requireOnline = useCallback(() => {
    if (!convex.connectionState().isWebSocketConnected) throw new AuthFlowError("offline");
  }, [convex]);
  /** While anonymous, mint a merge token and keep it on the device until the merge runs. */
  const prepareMerge = useCallback(async () => {
    const a = accountRef.current;
    if (!a || a.kind !== "anonymous") return false;
    const token = await tokenRef.current({});
    await session.writePendingMerge({ token, sourceUserId: a.userId, createdAt: Date.now() });
    return true;
  }, []);
  return { requireOnline, prepareMerge };
}

/**
 * Google sign-in. Opens a browser sheet. Resolves "signedIn" or "cancelled"
 * (cancelling is not an error: they stay anonymous, nothing changes).
 * Anonymous notes are merged in automatically afterwards (see `useMergeStatus`).
 */
export function useSignInWithGoogle(): () => Promise<"signedIn" | "cancelled"> {
  const { signIn } = useAuthActions();
  const { requireOnline, prepareMerge } = useGuards();
  return useCallback(async () => {
    requireOnline();
    let prepared = false;
    try {
      prepared = await prepareMerge();
      // Lazy: a build made before expo-web-browser was added has no native module.
      const WebBrowser = require("expo-web-browser") as typeof import("expo-web-browser");
      const redirectTo = Linking.createURL("auth-callback");
      const res = await signIn("google", { redirectTo });
      if (!res.redirect) throw new AuthFlowError("failed");
      const result = await WebBrowser.openAuthSessionAsync(res.redirect.toString(), redirectTo);
      if (result.type !== "success") {
        if (prepared) await session.clearPendingMerge();
        return "cancelled";
      }
      const code = new URL(result.url).searchParams.get("code");
      if (!code) throw new AuthFlowError("failed");
      await signIn("google", { code });
      return "signedIn";
    } catch (e) {
      if (prepared) await session.clearPendingMerge();
      throw toAuthError(e);
    }
  }, [signIn, requireOnline, prepareMerge]);
}

/**
 * Email sign-in with a one-time 6-digit code.
 * `sendCode(email)` emails the code; `verifyCode(email, code)` signs in. Anonymous notes merge afterwards.
 */
export function useEmailSignIn() {
  const { signIn } = useAuthActions();
  const { requireOnline, prepareMerge } = useGuards();
  const sendCode = useCallback(
    async (email: string) => {
      requireOnline();
      const clean = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new AuthFlowError("invalid-email");
      try {
        await signIn("resend-otp", { email: clean });
      } catch (e) {
        throw toAuthError(e);
      }
    },
    [signIn, requireOnline],
  );
  const verifyCode = useCallback(
    async (email: string, code: string) => {
      requireOnline();
      let prepared = false;
      try {
        prepared = await prepareMerge();
        const res = await signIn("resend-otp", { email: email.trim().toLowerCase(), code: code.trim() });
        if (!res.signingIn) throw new AuthFlowError("invalid-code");
        return "signedIn" as const;
      } catch (e) {
        if (prepared) await session.clearPendingMerge();
        const err = toAuthError(e);
        throw err.code === "failed" ? new AuthFlowError("invalid-code") : err;
      }
    },
    [signIn, requireOnline, prepareMerge],
  );
  return { sendCode, verifyCode };
}

function toAuthError(e: unknown): AuthFlowError {
  if (e instanceof AuthFlowError) return e;
  const m = e instanceof Error ? e.message : String(e);
  if (/not configured/i.test(m)) return new AuthFlowError("unavailable");
  if (/network|fetch|connect/i.test(m)) return new AuthFlowError("offline");
  return new AuthFlowError("failed", m);
}

/**
 * Sign out, clear the settings cache and return to a fresh anonymous session. The account's notes stay in the
 * account; sign back in to see them.
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuthActions();
  return useCallback(async () => {
    // Waiting notes stay on the device (held for this account) and send when it signs back in.
    await signOut();
    resetSettingsCache();
    await session.forget();
  }, [signOut]);
}

const AUTH_KEYS = ["__convexAuthJWT", "__convexAuthRefreshToken", "__convexAuthServerStateFetchTime", "__convexAuthOAuthVerifier"];

/**
 * Permanently delete the account and all its data on the server, then clear
 * this device (outbox, draft, settings cache, seal markers, reminder, tokens).
 * The app then starts fresh as a new anonymous user. Throws AuthFlowError("offline")
 * and deletes nothing when there is no connection.
 */
export function useDeleteAccount(): () => Promise<void> {
  const del = useMutation(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const convex = useConvex();
  return useCallback(async () => {
    if (!convex.connectionState().isWebSocketConnected) throw new AuthFlowError("offline");
    try {
      await del({});
    } catch (e) {
      throw toAuthError(e);
    }
    // Server data is gone. From here on, clean up best-effort and never fail.
    await signOut().catch(() => {});
    await outbox.clear().catch(() => {});
    await clearSavedDraft();
    resetSettingsCache();
    await session.clearPendingMerge();
    await session.forget();
    await SecureStore.deleteItemAsync("jarful.sealsPlayed").catch(() => {});
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    const ns = (process.env.EXPO_PUBLIC_CONVEX_URL ?? "").replace(/[^a-zA-Z0-9]/g, "");
    for (const k of AUTH_KEYS) await secureStorage.removeItem(`${k}_${ns}`).catch(() => {});
    session.setMergeStatus({ state: "idle" });
  }, [del, signOut, convex]);
}

/**
 * Mounted once by DataProvider. Tells the outbox and session who is signed in
 * (NOTE-3), and finishes a pending merge once the account session is active.
 */
export function useSessionAndMergeSync() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const account = useAccount();
  const merge = useMutation(api.account.mergeAnonymousData);
  const mergeRef = useRef(merge);
  mergeRef.current = merge;
  const [online, setOnline] = useState(() => convex.connectionState().isWebSocketConnected);
  const running = useRef(false);

  useEffect(() => {
    setOnline(convex.connectionState().isWebSocketConnected);
    return convex.subscribeToConnectionState((s) => setOnline(s.isWebSocketConnected));
  }, [convex]);

  const userId = account?.userId;
  useEffect(() => {
    const id = isAuthenticated ? userId : undefined;
    session.setUser(id);
    outbox.setCurrentUser(id);
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (!account || !online || running.current) return;
    running.current = true;
    void (async () => {
      try {
        const pending: PendingMerge | null = await session.readPendingMerge();
        if (!pending) return;
        if (account.kind !== "signedIn") {
          // Still anonymous: a sign-in is in flight, or it was abandoned.
          if (Date.now() - pending.createdAt > MERGE_TTL_MS) await session.clearPendingMerge();
          return;
        }
        if (account.userId === pending.sourceUserId) {
          await session.clearPendingMerge();
          return;
        }
        session.setMergeStatus({ state: "merging" });
        try {
          const r = await mergeRef.current({ token: pending.token });
          await outbox.reassign(pending.sourceUserId, account.userId);
          await session.clearPendingMerge();
          session.setMergeStatus({ state: "merged", notes: r.notes });
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          if (/expired/i.test(m)) {
            await session.clearPendingMerge();
            session.setMergeStatus({ state: "failed", reason: "expired" });
          } else if (/Invalid merge token|already used|not anonymous|Sign in before/i.test(m)) {
            await session.clearPendingMerge();
            session.setMergeStatus({ state: "failed", reason: "invalid" });
          } else {
            // Probably the network: keep the token and try again on reconnect.
            session.setMergeStatus({ state: "idle" });
          }
        }
      } finally {
        running.current = false;
      }
    })();
  }, [account, online]);
}
