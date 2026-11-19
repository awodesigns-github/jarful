import { ConvexAuthProvider } from "@convex-dev/auth/react";
import type { ReactNode } from "react";
import { convex, secureStorage } from "./client";
import { useOutboxSync } from "./offline";

/** Wrap the app root once. Gives every screen Convex and auth. */
function OutboxSync() {
  useOutboxSync();
  return null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <OutboxSync />
      {children}
    </ConvexAuthProvider>
  );
}
