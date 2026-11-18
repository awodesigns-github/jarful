# Jarful · build assets (Phase 1)

Exported from the Jarful Figma file on 5 Nov 2026.

## app-icon/
- `icon-1024.png`: App Store icon. 1024 × 1024, RGB with no transparency, square corners (iOS applies the mask). Use it as `icon` in `app.json`.
- `preview-*.png`: downscaled copies for checking how the icon reads at small sizes. Don't ship these.

## icons/
12 UI icons on a 24 × 24 grid with a 2 px stroke. The stroke uses `currentColor`, so one file works in light and dark. With `react-native-svg-transformer`:

```tsx
import Heart from './icons/heart.svg';
<Heart width={24} height={24} color={theme.colors.textPrimary} />
```

## tokens/
- `theme.ts`: `lightTheme` and `darkTheme` built from the Figma variables (Primitives → Color with Light/Dark modes, Spacing, Radius) plus the 13 text styles. Type-checks under `tsc --strict`.
- `tokens.json`: the same values as W3C design-token JSON, in case you want Style Dictionary later.

## Fonts
Both fonts are free Google Fonts (SIL Open Font License), so install them instead of copying font files:

```
npx expo install @expo-google-fonts/dm-sans @expo-google-fonts/shantell-sans expo-font
```

Load DM Sans 400, 500, 600 and 700, plus Shantell Sans 800 ExtraBold. The `fontFamily` names in `theme.ts` match those packages.

## Known issue
`accent/muted` (clay, #c8755a) is used for the character counter from 120 characters on. As small text it only reaches 3.4:1 on white and 4.4:1 on dark, both under the WCAG AA minimum of 4.5:1. See the copy pass for the fix.
