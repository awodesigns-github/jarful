import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Fit,
  RiveColor,
  RiveView,
  useRive,
  useViewModelInstance,
  type RiveFile,
} from '@rive-app/react-native';
import {
  RIVE_ARTBOARD,
  RIVE_DONE_MS,
  RIVE_LAND_MS,
  RIVE_READY_GIVE_UP_MS,
  RIVE_SETTLE_MS,
  type LandingSlot,
} from './riveNoteDrop';

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
 * nothing moves. The scene's `landed` and `finished` view model triggers drive the callbacks
 * (the Android runtime reports no Rive events); timers stand in if a trigger never arrives,
 * so a drop can never get stuck.
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
      num('faceOpacity', 1);
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

  // Once the view is ready: listen, then (once its first frame is on screen) hide the caller's
  // jar, play, and arm the fallback timers.
  useEffect(() => {
    if (riveViewRef === null) {
      cb.current.onFail();
      return;
    }
    if (!riveViewRef || !instance || !bound || fired.current.started) return;
    fired.current.started = true;
    const stops: (() => void)[] = [];
    try {
      const onLand = instance.triggerProperty('landed')?.addListener(landed);
      const onEnd = instance.triggerProperty('finished')?.addListener(done);
      if (onLand) stops.push(onLand);
      if (onEnd) stops.push(onEnd);
    } catch {
      // No listener: the timers below still land and finish the drop.
    }
    // The scene rests on the same jar, lid closed, so both can show for a moment. Android puts
    // the first frame on screen a frame or two after `awaitViewReady`, so wait a little more,
    // or the jar flashes blank at the hand-off. If the view never reports, start anyway.
    const timers: ReturnType<typeof setTimeout>[] = [];
    let live = true;
    let playing = false;
    const play = () => {
      if (!live || playing) return;
      playing = true;
      cb.current.onReady();
      instance.triggerProperty('drop')?.trigger();
      timers.push(setTimeout(landed, RIVE_LAND_MS + 400), setTimeout(done, RIVE_DONE_MS + 600));
    };
    riveViewRef
      .awaitViewReady()
      .catch(() => true)
      .then(() => live && timers.push(setTimeout(play, RIVE_SETTLE_MS)));
    timers.push(setTimeout(play, RIVE_READY_GIVE_UP_MS));
    return () => {
      live = false;
      timers.forEach(clearTimeout);
      stops.forEach((stop) => stop());
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
