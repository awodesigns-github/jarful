# NoteDrop (Rive)

The "Drop it in" moment (Figma Flow 1 · 4 Drop in), played in the app over the home jar by
`components/jar/RiveNoteDrop.tsx`: the note folds twice, drops through the mouth and lands on the
next slip slot, the jar wobbles ±2° once, the lid closes.

- Jar art is converted from `jarful-jar/jar-layers.svg` (the Figma Jar component) with `rive svg`,
  then hand-edited. All 36 slips are there; the app says how many show and in which colours.
- The artboard is 360 x 580 and transparent. The jar sits exactly where `Jar.tsx` draws it,
  offset by (50, 260): jar point (x, y) is artboard (x + 50, y + 252). Don't move it, or the hand-off
  back to the app's jar will jump.
- Timing follows the Figma interaction notes: lid lifts and tilts (250 ms), two folds, soft curve in
  (550 ms), squash, ±2° wobble, lid closes. 130 frames at 60 fps.

## Preview

    rive .                    # click to drop, click again to reset
    rive . --android          # on the emulator
    rive . --data=slipCount=0 --data=labelOpacity=1 --data=landX=41.96 --data=landY=320.25 --data=landRot=0.2681

## Ship it to the app

    rive . --publish
    cp build/jarful-note-drop.riv ../../assets/rive/note-drop.riv

Then rebuild the dev client (the Rive runtime is a native module). A free Rive workspace stamps a
Rive splash screen on published files; publish from a paid workspace for the app.

## View model `NoteDrop` (set by the app)

| Property | Type | Use |
|---|---|---|
| noteColour | colour | mood colour: the card's back and the folded slip (neutral E9DFCC when none) |
| noteTint, noteBorder, noteInk | colour | the card as compose draws it: tint (surface + 18% mood), edge, text |
| noteText | string | the note (up to 140 characters; the text shrinks to fit) |
| drop | trigger | play |
| slipCount | number | slips already in the jar (0-36) |
| slip01..slip36 | colour | each slip's colour |
| landX, landY, landRot | number | centre (slips.ts coordinates) and angle (radians) of the next slip |
| jarGlass, jarLine, labelFill | colour | theme (light FFFFFF / 2E2A26 / FBF6EC, dark 2D2621 / F3EBDD / 221C18) |
| labelOpacity | number | 1 on an empty jar |
| faceOpacity | number | 1 shows the Figma face; 0 for now, since the home jar draws none |

Events: `noteLanded` (frame 95: haptic) and `dropFinished` (frame 128: unmount).
