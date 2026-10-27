import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export const tvColors = { background: '#091315', surface: '#10231f', raised: '#183b2c', border: '#203c31', accent: '#a7eccb', text: '#ecf5f2', muted: '#a2b6b1', ink: '#09241b', error: '#edbd9b' };
export function TvButton({ label, focused, selected, disabled, onPress, onFocus, icon, children, style }: {
  label: string; focused: boolean; selected?: boolean; disabled?: boolean; onPress: () => void; onFocus?: () => void;
  icon?: keyof typeof Ionicons.glyphMap; children?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: focused, disabled: !!disabled }}
    disabled={disabled} onPress={onPress} onFocus={onFocus} style={[styles.button, selected && styles.selected, style, focused && styles.focused, disabled && { opacity: 0.4 }]}>
    {icon && <Ionicons name={icon} size={21} color={focused ? tvColors.ink : tvColors.accent} />}
    {children ?? <Text numberOfLines={2} style={[styles.label, focused && styles.focusedLabel]}>{label}</Text>}
  </Pressable>;
}
export const tvUi = StyleSheet.create({
  text: { color: tvColors.text, fontSize: 16 }, muted: { color: tvColors.muted, fontSize: 13, lineHeight: 19 },
  focusedText: { color: tvColors.ink }, heading: { color: tvColors.text, fontSize: 25, fontWeight: '700' },
});
const styles = StyleSheet.create({
  button: { minHeight: 44, borderWidth: 2, borderColor: 'transparent', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  selected: { backgroundColor: tvColors.raised },
  focused: { borderColor: '#ecf5f2', backgroundColor: tvColors.accent },
  label: { color: tvColors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }, focusedLabel: { color: tvColors.ink },
});
