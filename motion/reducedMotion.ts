import type { ReducedMotionSetting } from '@/lib/data/settingsShape';

/** Combine the in-app setting with the OS flag. "on" and "off" win; "system" follows the OS. */
export function resolveReducedMotion(setting: ReducedMotionSetting, osReduced: boolean): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return osReduced;
}
