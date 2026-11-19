import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { createSettingsStore } from "./settingsStore";
import { assertValidPatch, type Settings, type SettingsPatch } from "./settingsShape";

export const settingsStore = createSettingsStore({
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
  getItemSync: (k) => (typeof SecureStore.getItem === "function" ? SecureStore.getItem(k) : null),
});
void settingsStore.load();

/** Clear the device copy (call on sign-out and after deleteAccount). */
export const resetSettingsCache = () => settingsStore.reset();

/**
 * Settings with defaults, never undefined and never loading: the last cached
 * values (or defaults) on the first frame, then live values. Works offline.
 */
export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

/** `update(patch)`: shows at once, saved on the device, synced when online. Last write wins. */
export function useUpdateSettings() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const send = useMutation(api.settings.updateSettings);
  const sendRef = useRef(send);
  sendRef.current = send;
  const auth = useRef(isAuthenticated);
  auth.current = isAuthenticated;
  return useCallback(
    async (patch: SettingsPatch) => {
      assertValidPatch(patch);
      await settingsStore.update(patch);
      if (convex.connectionState().isWebSocketConnected && auth.current) {
        void settingsStore.flush((p) => sendRef.current(p)).catch(() => {});
      }
    },
    [convex],
  );
}

/** Mount once (DataProvider does): feeds live settings into the store and flushes pending edits on reconnect. */
export function useSettingsSync() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const live = useQuery(api.settings.getSettings, isAuthenticated ? {} : "skip");
  const send = useMutation(api.settings.updateSettings);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [online, setOnline] = useState(() => convex.connectionState().isWebSocketConnected);

  useEffect(() => {
    setOnline(convex.connectionState().isWebSocketConnected);
    return convex.subscribeToConnectionState((s) => setOnline(s.isWebSocketConnected));
  }, [convex]);

  useEffect(() => {
    if (live) void settingsStore.setServer(live);
  }, [live]);

  useEffect(() => {
    if (!online || !isAuthenticated) return;
    void settingsStore.flush((p) => sendRef.current(p)).catch(() => {});
  }, [online, isAuthenticated]);
}
