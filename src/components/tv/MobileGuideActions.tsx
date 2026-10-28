import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type MobileGuideAction = { id: string; label: string; run: () => void; disabled?: boolean };

export function MobileGuideActions({ title, subtitle, description, actions, onClose }: {
  title: string; subtitle: string; description?: string; actions: MobileGuideAction[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={[s.overlay, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12, paddingTop: insets.top + 12 }]}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss guide actions" onPress={onClose} />
      <View accessibilityViewIsModal testID="mobile-guide-actions" style={[s.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={s.heading}><View style={{ flex: 1 }}><Text numberOfLines={2} style={s.title}>{title}</Text><Text numberOfLines={2} style={s.subtitle}>{subtitle}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close guide actions" onPress={onClose} style={s.close}><Text style={s.title}>×</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          {!!description && <Text style={s.description}>{description}</Text>}
          {actions.map(action => <Pressable key={action.id} accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ disabled: !!action.disabled }} disabled={action.disabled} onPress={() => { onClose(); action.run(); }} style={[s.action, action.disabled && { opacity: .4 }]}><Text style={s.actionText}>{action.label}</Text></Pressable>)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '90%', backgroundColor: '#11171a', borderWidth: 1, borderColor: '#1f2b2e', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  title: { fontSize: 20, lineHeight: 26, color: '#e1e8e8', fontWeight: '600' },
  subtitle: { color: '#7f8f90', fontSize: 14, lineHeight: 20, marginTop: 4 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 8 }, description: { color: '#a9b6b6', fontSize: 15, lineHeight: 22, paddingBottom: 8 },
  action: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#151d20', borderRadius: 6 },
  actionText: { color: '#e1e8e8', fontSize: 16, lineHeight: 22 },
});
