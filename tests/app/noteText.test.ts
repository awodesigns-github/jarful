/// <reference types="jest" />
import { countNoteChars, isNoteTooLong, NOTE_MAX, NOTE_RAW_MAX } from '@/lib/data/noteText';

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
const reference = (s: string) => [...seg.segment(s)].length;

const samples: Record<string, string> = {
  empty: '',
  ascii: 'Sunny walk after work',
  crlf: 'a\r\nb',
  sun: '\u{1F31E}',
  family: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}',
  flag: '\u{1F1EC}\u{1F1E7}',
  twoFlags: '\u{1F1EC}\u{1F1E7}\u{1F1EB}\u{1F1F7}',
  threeRegional: '\u{1F1EC}\u{1F1E7}\u{1F1EB}',
  skinTone: '\u{1F44B}\u{1F3FD}',
  variation: '\u2764\uFE0F',
  keycap: '1\uFE0F\u20E3',
  combining: 'e\u0301',
  japanese: '今日はいい日',
  mixed: 'Good 🌞 day 👩‍👩‍👧 in 🇯🇵 ok',
  scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
};

describe('countNoteChars matches Intl.Segmenter', () => {
  it.each(Object.entries(samples))('%s', (_name, s) => {
    expect(countNoteChars(s)).toBe(reference(s));
  });

  it('known counts', () => {
    expect(countNoteChars(samples.family)).toBe(1);
    expect(countNoteChars(samples.flag)).toBe(1);
    expect(countNoteChars(samples.twoFlags)).toBe(2);
    expect(countNoteChars(samples.skinTone)).toBe(1);
  });
});

describe('isNoteTooLong', () => {
  it('140 graphemes ok, 141 too long', () => {
    expect(isNoteTooLong('a'.repeat(NOTE_MAX))).toBe(false);
    expect(isNoteTooLong('a'.repeat(NOTE_MAX + 1))).toBe(true);
    expect(isNoteTooLong('\u{1F31E}'.repeat(NOTE_MAX))).toBe(false);
  });
  it('raw cap of 2000 units applies regardless of grapheme count', () => {
    expect(isNoteTooLong('a' + '\u0301'.repeat(NOTE_RAW_MAX))).toBe(true);
    expect(isNoteTooLong('a' + '\u0301'.repeat(NOTE_RAW_MAX - 2))).toBe(false);
  });
});
