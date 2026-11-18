// Shared by the app (compose counter) and the Convex server, so counts are identical.
// Pure code on purpose: Hermes (Android) has no Intl.Segmenter, and relying on it
// on one side only would make client and server disagree.
//
// Counts approximate Unicode grapheme clusters (UAX #29): combining marks, variation
// selectors, skin-tone modifiers, ZWJ sequences, flags (pairs of regional indicators),
// keycaps, tag sequences and CRLF each count as one. Hangul jamo and Indic conjuncts
// are not joined; that is a rare undercount of the limit, not a bug in emoji handling.

export const NOTE_MAX = 140;
/** Hard cap on raw UTF-16 length, a guard against pathological input. */
export const NOTE_RAW_MAX = 2000;

const isExtender = (cp: number) =>
  (cp >= 0x0300 && cp <= 0x036f) ||
  (cp >= 0x1ab0 && cp <= 0x1aff) ||
  (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x20d0 && cp <= 0x20ff) || // includes U+20E3 keycap
  (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
  (cp >= 0xfe20 && cp <= 0xfe2f) ||
  cp === 0x200c ||
  cp === 0x200d ||
  (cp >= 0x1f3fb && cp <= 0x1f3ff) || // skin tones
  (cp >= 0xe0020 && cp <= 0xe007f) || // tags (subdivision flags)
  (cp >= 0xe0100 && cp <= 0xe01ef);

const isPictographic = (cp: number) =>
  cp === 0xa9 ||
  cp === 0xae ||
  cp === 0x203c ||
  cp === 0x2049 ||
  cp === 0x2122 ||
  cp === 0x2139 ||
  (cp >= 0x2190 && cp <= 0x2bff) ||
  (cp >= 0x3030 && cp <= 0x303d) ||
  (cp >= 0x1f000 && cp <= 0x1faff);

const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

export function countNoteChars(text: string): number {
  let count = 0;
  let prev = -1;
  let riRun = 0; // regional indicators in the current run
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let joins = false;
    if (prev !== -1) {
      if (prev === 0x0d && cp === 0x0a) joins = true;
      else if (isExtender(cp)) joins = true;
      else if (prev === 0x200d && isPictographic(cp)) joins = true;
      else if (isRegionalIndicator(cp) && isRegionalIndicator(prev) && riRun % 2 === 1) joins = true;
    }
    riRun = isRegionalIndicator(cp) ? (joins || riRun % 2 === 0 ? riRun + 1 : 1) : 0;
    if (!joins) count++;
    prev = cp;
  }
  return count;
}

export function isNoteTooLong(text: string): boolean {
  return text.length > NOTE_RAW_MAX || countNoteChars(text) > NOTE_MAX;
}
