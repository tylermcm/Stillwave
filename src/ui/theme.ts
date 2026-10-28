import { Platform } from 'react-native';

/**
 * StillWave v3 design tokens (docs/HUB_DESIGN.md). Content sits on flat tinted surfaces; navigation
 * and transport controls use the translucent "glass" layer above it. Colour comes from the artwork;
 * the interface itself is near-monochrome, with mint reserved for brand, progress and "selected".
 */
export const T = {
  ink: '#080b17',
  surface: '#171e3a',
  mat: 'rgba(255,255,255,0.07)',
  mat2: 'rgba(255,255,255,0.11)',
  /** Without a native blur, the glass layer is a deep, slightly translucent panel. */
  glass: 'rgba(22,28,56,0.88)',
  glassLight: 'rgba(255,255,255,0.14)',
  edge: 'rgba(255,255,255,0.16)',
  hairline: 'rgba(255,255,255,0.10)',
  text: '#f6f3ec',
  text2: 'rgba(246,243,236,0.68)',
  text3: 'rgba(246,243,236,0.44)',
  mint: '#8fd6c0',
  mintInk: '#062219',
  live: '#ff5a5f',
  warn: '#ffc46b',
  light: '#f6f3ec',
  lightInk: '#0b0f1d',
} as const;

export const R = { card: 16, tile: 12, pill: 999, sheet: 28 } as const;
export const FONT = Platform.OS === 'web' ? 'Figtree, "Segoe UI", system-ui, sans-serif' : undefined;
/** Phone type scale (dp). TV adds its own larger scale later. */
export const TYPE = {
  display: { fontSize: 40, lineHeight: 42, fontWeight: '800' as const, letterSpacing: -1.2 },
  title: { fontSize: 28, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.8 },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  caption: { fontSize: 12.5, lineHeight: 17, fontWeight: '500' as const },
  label: { fontSize: 11.5, lineHeight: 15, fontWeight: '800' as const, letterSpacing: 1.1 },
};
