import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { secureStorage } from "./client";

/** Waits (ms) before each retry. After the last one fails, `error` is set. */
export const SIGN_IN_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

/** Kept for compatibility; no longer blocks Home. */
export const FIRST_LAUNCH_TIMEOUT_MS = 6000;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * "ready": signed in, or a session is stored on the device.
 * "background": no session yet; anonymous sign-in runs quietly.
 * "unrecoverable": no session and every retry failed or timed out (quiet hint only).
 * Home renders in every state; only the hint and the server-backed features differ.
 */
export type Readiness = "ready" | "background" | "unrecoverable";

/** Pure readiness rule. It never blocks Home: local features work in all three states. */
export function computeReadiness(s: {
  hasStoredSession: boolean | null; // null = still reading the keystore
  isAuthenticated: boolean;
  error: Error | null;
  timedOut: boolean;
}): Readiness {
  if (s.isAuthenticated || s.hasStoredSession === true) return "ready";
  if (s.hasStoredSession === null) return "background";
  return s.error ? "unrecoverable" : "background";
}

/** Convex Auth keeps its refresh token under this key (namespace = the deployment URL). */
function sessionKey(): string {
  const ns = (process.env.EXPO_PUBLIC_CONVEX_URL ?? "").replace(/[^a-zA-Z0-9]/g, "");
  return `__convexAuthRefreshToken_${ns}`;
}

/**
 * Signs in anonymously on first launch, with no prompt. A stored session is
 * reused on later launches. Call once, near the root (inside DataProvider).
 * `isReady` is true once the user is signed in; render screens then.
 *
 * A network blip is retried quietly with a short backoff and never surfaces.
 * Only when every retry fails is `error` set (ConnectGate shows it calmly).
 * The error clears and retrying restarts when the user is not signed in and
 * the effect re-runs (for example the app remounts).
 */
export function useEnsureAnonymousSignIn(): {
  isReady: boolean;
  error: Error | null;
  retry: () => void;
} {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [error, setError] = useState<Error | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState<boolean | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    secureStorage.getItem(sessionKey()).then(
      (t) => !cancelled && setHasStoredSession(!!t),
      () => !cancelled && setHasStoredSession(false),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated || hasStoredSession !== false) return;
    const t = setTimeout(() => setTimedOut(true), FIRST_LAUNCH_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isAuthenticated, hasStoredSession]);

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= SIGN_IN_BACKOFF_MS.length; attempt++) {
        if (cancelled) return;
        try {
          await signIn("anonymous");
          if (!cancelled) setError(null);
          return;
        } catch (e) {
          lastError = e;
          if (attempt < SIGN_IN_BACKOFF_MS.length) {
            await wait(SIGN_IN_BACKOFF_MS[attempt]);
          }
        }
      }
      if (!cancelled) {
        setError(lastError instanceof Error ? lastError : new Error(String(lastError)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, signIn, attempt]);

  const readiness = computeReadiness({ hasStoredSession, isAuthenticated, error, timedOut });
  const retry = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);
  return { isReady: readiness === "ready", error: readiness === "unrecoverable" ? error : null, retry };
}
