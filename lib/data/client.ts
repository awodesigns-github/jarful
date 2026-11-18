import { ConvexReactClient } from "convex/react";
import * as SecureStore from "expo-secure-store";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set. Add it to .env.local.");
}

export const convex = new ConvexReactClient(url, {
  // React Native has no window.beforeunload.
  unsavedChangesWarning: false,
});

/** Auth tokens live in the device keychain / keystore, never in AsyncStorage. */
export const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
