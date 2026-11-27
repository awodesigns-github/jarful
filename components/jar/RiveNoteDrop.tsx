import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Fit,
  RiveColor,
  RiveView,
  useRive,
  useViewModelInstance,
  type RiveEvent,
  type RiveFile,
} from '@rive-app/react-native';
import { RIVE_ARTBOARD, RIVE_DONE_MS, RIVE_LAND_MS, type LandingSlot } from './riveNoteDrop';

/** Rive's view model takes colours as ARGB integers. */
const argb = (hex: string) => RiveColor.fromHexString(hex).toInt();

export type RiveDropNote = { text: string; colour: string; tint: string; border: string; ink: string };

type Props = {
  file: RiveFile;
  /** The home jar's width on screen; the scene is laid over it at the same scale. */
  width: number;
  note: RiveDropNote;
  /** Slips the jar showed before this note, and where the note lands. */
  slots: number;
  landing: LandingSlot;
  slipColours: string[];
  theme: { glass: string; line: string; label: string };
  /** The scene is on screen and playing: the caller can hide its own jar. */
  onReady: () => void;
  /** The note touched down (haptic, show the new slip). Fires once. */
  onLanded: () => void;
  /** The scene has finished: unmount it. Fires once. */
  onDone: () => void;
  /** The scene could not start: the caller plays its fallback. */
  onFail: () => void;
};

/**
 * The drop-in moment from rive/note-drop (Figma Flow 1, 4 Drop in): the note folds, drops
 * through the mouth and lands on the next slip slot, the jar wobbles, the lid closes.
 * Drawn over the home jar at the same scale, so when it ends the caller's jar takes over and
 * nothing moves. Rive's `noteLanded` and `dropFinished` events drive the callbacks; timers
 * stand in if an event never arrives, so a drop can never get stuck.
 */
export function RiveNoteDrop({ file, width, note, slots, landing, slipColours, theme, onReady, onLanded, onDone, onFail }: Props) {
  const { riveViewRef, setHybridRef } = useRive();
  const { instance, error } = useViewModelInstance(file, { async: true });
  const [bound, setBound] = useState(false);
  const fired = useRef({ started: false, landed: false, done: false });
  const cb = useRef({ onReady, onLanded, onDone, onFail });
  cb.current = { onReady, onLanded, onDone, onFail };

  const landed = () => {
    if (fired.current.landed) return;
    fired.current.landed = true;
    cb.current.onLanded();
  };
  const done = () => {
    landed();
    if (fired.current.done) return;
    fired.current.done = true;
    cb.current.onDone();
  };

  // Set every value before the view binds, so the first frame is already right.
  useEffect(() => {
    if (error) {
      cb.current.onFail();
      return;
    }
    if (!instance) return;
    try {
      const color = (name: string, hex: string) => instance.colorProperty(name)?.set(argb(hex));
      const num = (name: string, v: number) => instance.numberProperty(name)?.set(v);
      color('noteColour', note.colour);
      color('noteTint', note.tint);
      color('noteBorder', note.border);
      color('noteInk', note.ink);
      instance.stringProperty('noteText')?.set(note.text);
      num('slipCount', slots);
      num('landX', landing.x);
      num('landY', landing.y);
      num('landRot', landing.rot);
      num('labelOpacity', slots === 0 ? 1 : 0);
      num('faceOpacity', 0);
      color('jarGlass', theme.glass);
      color('jarLine', theme.line);
      color('labelFill', theme.label);
      slipColours.forEach((hex, i) => color(`slip${String(i + 1).padStart(2, '0')}`, hex));
      setBound(true);
    } catch {
      cb.current.onFail();
    }
    // Values are read once per drop; the scene unmounts when it ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, error]);

  // Once the view is ready: listen, play, and arm the fallback timers.
  useEffect(() => {
    if (riveViewRef === null) {
      cb.current.onFail();
      return;
    }
    if (!riveViewRef || !instance || !bound || fired.current.started) return;
    fired.current.started = true;
    riveViewRef.onEventListener((e: RiveEvent) => {
      if (e.name === 'noteLanded') landed();
      if (e.name === 'dropFinished') done();
    });
    instance.triggerProperty('drop')?.trigger();
    cb.current.onReady();
    const t1 = setTimeout(landed, RIVE_LAND_MS + 400);
    const t2 = setTimeout(done, RIVE_DONE_MS + 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      riveViewRef.removeEventListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riveViewRef, instance, bound]);

  if (!instance || !bound) return null;
  const scale = width / RIVE_ARTBOARD.jarWidth;
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.stage,
        {
          left: -RIVE_ARTBOARD.jarX * scale,
          top: -RIVE_ARTBOARD.jarY * scale,
          width: RIVE_ARTBOARD.width * scale,
          height: RIVE_ARTBOARD.height * scale,
        },
      ]}
    >
      <RiveView
        file={file}
        dataBind={instance}
        autoPlay
        fit={Fit.Contain}
        hybridRef={setHybridRef}
        onError={() => cb.current.onFail()}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute' },
});
