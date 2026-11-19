import { useEffect, useState } from 'react';
import { useConvex } from 'convex/react';

/**
 * Whether the Convex connection is up. Reports "offline" only after a short
 * grace period so a brief reconnect never flashes a hint.
 * Only the connection flag is read here; no data goes through this hook.
 */
export function useOnline(graceMs = 1500): boolean {
  const convex = useConvex();
  const [online, setOnline] = useState(() => convex.connectionState().isWebSocketConnected);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = (up: boolean) => {
      if (timer) clearTimeout(timer);
      if (up) setOnline(true);
      else timer = setTimeout(() => setOnline(false), graceMs);
    };
    apply(convex.connectionState().isWebSocketConnected);
    const off = convex.subscribeToConnectionState((s) => apply(s.isWebSocketConnected));
    return () => {
      if (timer) clearTimeout(timer);
      off();
    };
  }, [convex, graceMs]);
  return online;
}
