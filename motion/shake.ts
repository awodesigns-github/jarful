// Pure shake detection, so it can be tested without a sensor.
// The accelerometer reports g (about 1 at rest). A "jolt" is a sample whose pull departs from
// resting by more than `threshold`. A shake is `jolts` of them inside `windowMs`; after one,
// further shakes are ignored for `cooldownMs`. A normal hand shake peaks around 1.5 to 2.5 g total
// (0.5 to 1.5 g departure); walking stays near 0.3 to 0.6 g departure and rarely repeats 3 times in 1 s.
export type Sample = { x: number; y: number; z: number };
export type ShakeOptions = { threshold?: number; jolts?: number; windowMs?: number; cooldownMs?: number; minGapMs?: number };

export function createShakeDetector(opts: ShakeOptions = {}) {
  const { threshold = 0.9, jolts = 3, windowMs = 1000, cooldownMs = 1500, minGapMs = 60 } = opts;
  let times: number[] = [];
  let lastShake = -Infinity;
  return {
    /** Feed one sample. Returns true when a shake completes. */
    push(s: Sample, now: number): boolean {
      if (now - lastShake < cooldownMs) return false;
      const dev = Math.abs(Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z) - 1);
      if (dev < threshold) return false;
      const last = times[times.length - 1];
      if (last !== undefined && now - last < minGapMs) return false; // one jolt, many samples
      times = times.filter((t) => now - t <= windowMs);
      times.push(now);
      if (times.length >= jolts) {
        times = [];
        lastShake = now;
        return true;
      }
      return false;
    },
    reset() {
      times = [];
      lastShake = -Infinity;
    },
  };
}
