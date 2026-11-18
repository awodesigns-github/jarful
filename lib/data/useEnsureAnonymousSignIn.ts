import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, useState } from "react";

/**
 * Signs in anonymously on first launch, with no prompt. A stored session is
 * reused on later launches. Call once, near the root (inside DataProvider).
 * `isReady` is true once the user is signed in; render screens then.
 */
export function useEnsureAnonymousSignIn(): {
  isReady: boolean;
  error: Error | null;
} {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const attempted = useRef(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isLoading || isAuthenticated || attempted.current) return;
    attempted.current = true;
    signIn("anonymous").catch((e: unknown) => {
      attempted.current = false; // allow a retry on the next state change
      setError(e instanceof Error ? e : new Error(String(e)));
    });
  }, [isLoading, isAuthenticated, signIn]);

  return { isReady: isAuthenticated, error };
}
