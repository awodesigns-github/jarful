import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";

/** Waits (ms) before each retry. After the last one fails, `error` is set. */
export const SIGN_IN_BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
} {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [error, setError] = useState<Error | null>(null);

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
  }, [isLoading, isAuthenticated, signIn]);

  return { isReady: isAuthenticated, error };
}
