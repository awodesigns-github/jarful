import Svg, { Path } from 'react-native-svg';

// Paths copied from jarful-build-assets/icons (24 px grid, 2 px round stroke).
const PATHS = {
  plus: ['M12 5V19M5 12H19'],
  chevronLeft: ['M15 6L9 12L15 18'],
  chevronRight: ['M9 6L15 12L9 18'],
  close: ['M18 6L6 18M6 6L18 18'],
  heart: [
    'M12 20.5L4.39999 13C2.29999 10.9 2.39999 7.6 4.59999 5.6C6.59999 3.8 9.59999 4.1 11.6 6.2L12 6.6L12.4 6.2C14.4 4.1 17.4 3.8 19.4 5.6C21.6 7.6 21.7 10.9 19.6 13L12 20.5Z',
  ],
  settings: [
    'M4 7H13M17 7H20M4 17H7M11 17H20',
    'M15 9.20005C16.215 9.20005 17.2 8.21508 17.2 7.00005C17.2 5.78502 16.215 4.80005 15 4.80005C13.785 4.80005 12.8 5.78502 12.8 7.00005C12.8 8.21508 13.785 9.20005 15 9.20005Z',
    'M9 19.2C10.215 19.2 11.2 18.2151 11.2 17C11.2 15.785 10.215 14.8 9 14.8C7.78498 14.8 6.8 15.785 6.8 17C6.8 18.2151 7.78498 19.2 9 19.2Z',
  ],
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative: the Pressable that holds it carries the label. */
export function Icon({ name, color, size = 24, fill }: { name: IconName; color: string; size?: number; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false} importantForAccessibility="no">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} fill={fill} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
