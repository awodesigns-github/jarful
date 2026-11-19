import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { useConvex, useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { MoodName } from "./notes";
import { optimisticAddNote } from "./notes";
import { createOutbox, draftStore, newClientId, type KeyValueStore } from "./outbox";

const secureKv: KeyValueStore = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export const outbox = createOutbox(secureKv);
const draft = draftStore(secureKv);

const DEBOUNCE_MS = 400;

/** Compose text, saved on the device (debounced) and restored after a kill. */
export function useDraft() {
  const [text, setTextState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    draft.read().then((saved) => {
      // Never overwrite what the user has already typed.
      if (saved && !edited.current) setTextState(saved);
    }, () => {});
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const setText = useCallback((next: string) => {
    edited.current = true;
    setTextState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void draft.write(next).catch(() => {}), DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    edited.current = true;
    setTextState("");
    void draft.clear().catch(() => {});
  }, []);

  return { text, setText, clear };
}

/** Notes written but not yet sent to Convex. Add to `noteCount` for the fill. */
export function usePendingNotes(): { pendingCount: number } {
  const pendingCount = useSyncExternalStore(
    outbox.subscribe,
    outbox.getPendingCount,
    outbox.getPendingCount,
  );
  return { pendingCount };
}

/**
 * Mount once near the root (DataProvider does). Loads the outbox and sends it
 * on app start and whenever the connection is back and the user is signed in.
 */
export function useOutboxSync() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const send = useMutation(api.notes.addNote).withOptimisticUpdate(optimisticAddNote);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [online, setOnline] = useState(() => convex.connectionState().isWebSocketConnected);

  useEffect(() => {
    setOnline(convex.connectionState().isWebSocketConnected);
    return convex.subscribeToConnectionState((s) => setOnline(s.isWebSocketConnected));
  }, [convex]);

  useEffect(() => {
    void outbox.load().catch(() => {});
    if (!online || !isAuthenticated) return;
    void outbox
      .flush((n) =>
        sendRef.current({
          text: n.text,
          colour: n.colour as MoodName | undefined,
          clientId: n.clientId,
          createdAt: n.createdAt,
        }),
      )
      .catch(() => {});
  }, [online, isAuthenticated]);
}

/**
 * `addNote({ text, colour? })` saves to the device outbox first, then sends.
 * Resolves with the client id as soon as the note is safe on the device, so
 * it works offline. Rejects only on empty text or a failed local save.
 */
export function useAddNote() {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const send = useMutation(api.notes.addNote).withOptimisticUpdate(optimisticAddNote);
  const sendRef = useRef(send);
  sendRef.current = send;
  const ready = useRef({ isAuthenticated });
  ready.current = { isAuthenticated };

  return useCallback(
    async (args: { text: string; colour?: MoodName }) => {
      const text = args.text.trim();
      if (text.length === 0) throw new Error("Note is empty");
      const clientId = newClientId();
      await outbox.enqueue({ clientId, text, colour: args.colour, createdAt: Date.now() });
      if (convex.connectionState().isWebSocketConnected && ready.current.isAuthenticated) {
        void outbox
          .flush((n) =>
            sendRef.current({
              text: n.text,
              colour: n.colour as MoodName | undefined,
              clientId: n.clientId,
              createdAt: n.createdAt,
            }),
          )
          .catch(() => {});
      }
      return clientId;
    },
    [convex],
  );
}
