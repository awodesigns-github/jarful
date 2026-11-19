// Pure shake detection, so it can be tested without a sensor.
// The accelerometer reports g (about 1 at rest). A "jolt" is a sample whose pull departs from
// resting by more than `threshold`. A shake is `jolts` of them inside `windowMs`; after one,
// further shakes are ignored for `cooldownMs`. Walking peaks near 0.5 to 1 g, so it stays under.
export type Sample = { x: number; y: number; z: number };
export type ShakeOptions = { threshold?: number; jolts?: number; windowMs?: number; cooldownMs?: number; minGapMs?: number };

export function createShakeDetector(opts: ShakeOptions = {}) {
  const { threshold = 1.6, jolts = 3, windowMs = 900, cooldownMs = 1500, minGapMs = 80 } = opts;
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
