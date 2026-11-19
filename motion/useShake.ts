import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { createShakeDetector } from './shake';

/** Calls `onShake` when the phone is shaken. Subscribes only while `active`, and not in the background. */
export function useShake(active: boolean, onShake: () => void) {
  const cb = useRef(onShake);
  cb.current = onShake;
  useEffect(() => {
    if (!active) return;
    const detector = createShakeDetector();
    let sub: { remove: () => void } | null = null;
    const start = () => {
      if (sub) return;
      detector.reset();
      Accelerometer.setUpdateInterval(60);
      sub = Accelerometer.addListener((s) => {
        if (detector.push(s, Date.now())) cb.current();
      });
    };
    const stop = () => {
      sub?.remove();
      sub = null;
    };
    if (AppState.currentState === 'active') start();
    const app = AppState.addEventListener('change', (st) => (st === 'active' ? start() : stop()));
    return () => {
      app.remove();
      stop();
    };
  }, [active]);
}
