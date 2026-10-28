import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { MeshId } from '../core/mobileHub';

/** [x%, y%, spread%, colour]. Soft colour fields stand in for artwork until real channel art exists. */
type Blob = readonly [number, number, number, string];
const MESH: Record<MeshId, readonly [string, readonly Blob[]]> = {
  dusk: ['#120f2e', [[16, 88, 62, '#ff8f5a'], [80, 74, 56, '#c04b7e'], [46, 10, 54, '#3d55c8'], [96, 12, 36, '#7b45b0']]],
  stadium: ['#04140f', [[28, 80, 58, '#1fa87a'], [78, 22, 44, '#0f6b57'], [60, 100, 46, '#a6ffd0'], [10, 15, 30, '#2fd6a0']]],
  court: ['#1a0d08', [[50, 92, 64, '#ff7a2f'], [14, 22, 42, '#ffb36b'], [88, 18, 36, '#8a2f1f']]],
  cinema: ['#140b24', [[72, 38, 50, '#ffc17a'], [22, 72, 58, '#6a2f9a'], [58, 100, 42, '#c24a6b']]],
  mountain: ['#0b1830', [[34, 24, 50, '#7fb4ff'], [78, 72, 58, '#e8b98a'], [18, 92, 48, '#2f5a8a']]],
  music: ['#170b22', [[28, 28, 52, '#ff5fa2'], [78, 76, 52, '#5f7bff'], [60, 20, 28, '#ffd27a']]],
  coast: ['#0a2538', [[50, 16, 58, '#ffd2a1'], [50, 92, 68, '#1f8aa6'], [10, 60, 34, '#2fb5c9']]],
  forest: ['#08170f', [[30, 26, 52, '#d4f08a'], [72, 82, 58, '#2f8a4f'], [92, 20, 30, '#8ad6a0']]],
  aurora: ['#050a1c', [[40, 42, 62, '#37ffb0'], [76, 22, 44, '#4aa8ff'], [16, 86, 50, '#7a3fff']]],
  nebula: ['#08060f', [[34, 50, 58, '#d65bd6'], [66, 56, 50, '#36c9d6'], [50, 38, 28, '#ff8a6b']]],
  fire: ['#120604', [[50, 96, 66, '#ff7a1f'], [50, 74, 36, '#ffc14a'], [10, 40, 34, '#a8321a'], [92, 40, 34, '#a8321a']]],
  ocean: ['#06182a', [[50, 30, 52, '#ffd0a0'], [50, 92, 72, '#1b6f9a'], [12, 62, 38, '#2f9ac0']]],
};

/** CSS gradients: native uses RN's experimental_backgroundImage, the web preview uses backgroundImage. */
export function gradient(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}
const blob = ([x, y, spread, colour]: Blob): ViewStyle => gradient(`radial-gradient(circle at ${x}% ${y}%, ${colour} 0%, ${colour}00 ${spread}%)`);

export function MeshArt({ id, style, children }: { id: MeshId; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [base, blobs] = MESH[id];
  return <View style={[{ backgroundColor: base, overflow: 'hidden' }, style]}>
    {blobs.map((b, i) => <View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, blob(b)]} />)}
    {children}
  </View>;
}

/** A vertical scrim for text legibility over artwork. */
export function Scrim({ from = 0, to = 0.94, start = 0.35, style }: { from?: number; to?: number; start?: number; style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, gradient(`linear-gradient(to bottom, rgba(8,11,23,${from}) ${Math.round(start * 100)}%, rgba(8,11,23,${to}) 100%)`), style]} />;
}
