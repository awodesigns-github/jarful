/// <reference types="jest" />
import { createShakeDetector } from '@/motion/shake';
import { toggleFavourite } from '@/components/reveal/favourite';
import { ageLabel } from '@/components/reveal/age';

const at = (mag: number) => ({ x: mag, y: 0, z: 0 });

describe('shake detector', () => {
  it('ignores walking-level motion', () => {
    const d = createShakeDetector();
    let hit = false;
    for (let t = 0; t < 5000; t += 60) hit = d.push(at(1 + 0.8 * Math.sin(t / 150)), t) || hit;
    expect(hit).toBe(false);
  });
  it('fires on three hard jolts in the window', () => {
    const d = createShakeDetector();
    expect([d.push(at(3.5), 0), d.push(at(-3.5), 120), d.push(at(3.5), 240)]).toEqual([false, false, true]);
  });
  it('fires on a normal hand shake (about 2.2 g peaks)', () => {
    const d = createShakeDetector();
    expect([d.push(at(2.2), 0), d.push(at(-2.2), 150), d.push(at(2.2), 300)]).toEqual([false, false, true]);
  });
  it('does not fire when the jolts are too slow', () => {
    const d = createShakeDetector();
    expect([d.push(at(3.5), 0), d.push(at(3.5), 500), d.push(at(3.5), 1200)]).toEqual([false, false, false]);
  });
  it('holds off during the cooldown, then works again', () => {
    const d = createShakeDetector();
    d.push(at(3.5), 0); d.push(at(3.5), 100);
    expect(d.push(at(3.5), 200)).toBe(true);
    expect([d.push(at(3.5), 300), d.push(at(3.5), 400), d.push(at(3.5), 500)]).toEqual([false, false, false]);
    d.push(at(3.5), 2000); d.push(at(3.5), 2100);
    expect(d.push(at(3.5), 2200)).toBe(true);
  });
});

describe('favourite toggle', () => {
  it('applies at once and keeps it when saved', async () => {
    const apply = jest.fn();
    expect(await toggleFavourite({ current: false, apply, save: async () => {} })).toBe(true);
    expect(apply.mock.calls).toEqual([[true]]);
  });
  it('reverts when the save is rejected', async () => {
    const apply = jest.fn();
    const end = await toggleFavourite({ current: true, apply, save: () => Promise.reject(new Error('no')) });
    expect(end).toBe(true);
    expect(apply.mock.calls).toEqual([[false], [true]]);
  });
});

describe('ageLabel', () => {
  const now = Date.UTC(2026, 5, 30);
  it('reads calmly', () => {
    expect(ageLabel(now - 3 * 86_400_000, now)).toBe('3 days ago');
    expect(ageLabel(now - 21 * 86_400_000, now)).toBe('3 weeks ago');
    expect(ageLabel(now - 70 * 86_400_000, now)).toBe('2 months ago');
  });
});
