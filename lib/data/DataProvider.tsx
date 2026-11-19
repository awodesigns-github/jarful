import { ConvexAuthProvider } from "@convex-dev/auth/react";
import type { ReactNode } from "react";
import { convex, secureStorage } from "./client";
import { useOutboxSync } from "./offline";
import { useSettingsSync } from "./settings";
import { useSessionAndMergeSync } from "./account";

/** Wrap the app root once. Gives every screen Convex and auth. */
function OutboxSync() {
  useOutboxSync();
  useSettingsSync();
  useSessionAndMergeSync();
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
