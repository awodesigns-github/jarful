/// <reference types="jest" />
import { resolveReducedMotion } from '@/motion/reducedMotion';

describe('reduced motion resolver', () => {
  it.each([
    ['system', false, false],
    ['system', true, true],
    ['on', false, true],
    ['on', true, true],
    ['off', false, false],
    ['off', true, false],
  ] as const)('setting %s, OS %s -> %s', (setting, os, expected) => {
    expect(resolveReducedMotion(setting, os)).toBe(expected);
  });
});
