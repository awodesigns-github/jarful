/// <reference types="jest" />
import * as Haptics from 'expo-haptics';
import { creaseHaptic, landHaptic, revealHaptic, sealHaptic, selectHaptic, setHapticsEnabled } from '@/motion/haptics';

const all = [landHaptic, revealHaptic, selectHaptic, creaseHaptic, sealHaptic];
const calls = () =>
  (Haptics.impactAsync as jest.Mock).mock.calls.length +
  (Haptics.selectionAsync as jest.Mock).mock.calls.length +
  (Haptics.notificationAsync as jest.Mock).mock.calls.length;

describe('haptics setting', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => setHapticsEnabled(true));
  it('fires when on', () => {
    setHapticsEnabled(true);
    all.forEach((f) => f());
    expect(calls()).toBe(all.length);
  });
  it('is a no-op for every call when off', () => {
    setHapticsEnabled(false);
    all.forEach((f) => f());
    expect(calls()).toBe(0);
  });
});
