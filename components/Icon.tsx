import Svg, { Path } from 'react-native-svg';

// Paths copied from jarful-build-assets/icons (24 px grid, 2 px round stroke).
const PATHS = {
  plus: ['M12 5V19M5 12H19'],
  close: ['M18 6L6 18M6 6L18 18'],
  settings: [
    'M4 7H13M17 7H20M4 17H7M11 17H20',
    'M15 9.20005C16.215 9.20005 17.2 8.21508 17.2 7.00005C17.2 5.78502 16.215 4.80005 15 4.80005C13.785 4.80005 12.8 5.78502 12.8 7.00005C12.8 8.21508 13.785 9.20005 15 9.20005Z',
    'M9 19.2C10.215 19.2 11.2 18.2151 11.2 17C11.2 15.785 10.215 14.8 9 14.8C7.78498 14.8 6.8 15.785 6.8 17C6.8 18.2151 7.78498 19.2 9 19.2Z',
  ],
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative: the Pressable that holds it carries the label. */
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false} importantForAccessibility="no">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
