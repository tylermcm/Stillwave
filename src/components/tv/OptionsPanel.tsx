import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTvKeys } from '../../data/tv';
import { TvButton } from './TvUi';

export type PanelAction = { label: string; run: () => void; disabled?: boolean };
export function OptionsPanel({ title, description, actions, onClose }: {
  title: string; description?: string; actions: PanelAction[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<number[]>([]);
  const options = [...actions, { label: 'Done', run: onClose }];
  useEffect(() => { list.current?.scrollTo({ y: Math.max(0, (offsets.current[index] || 0) - 60), animated: false }); }, [index]);
  useTvKeys(key => {
    if (key === 'back' || key === 'menu') onClose();
    else if (key === 'up' || key === 'down') setIndex(i => Math.max(0, Math.min(options.length - 1, i + (key === 'up' ? -1 : 1))));
    else if (key === 'select') { const option = options[index]; if (option && !option.disabled) option.run(); }
  });
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
    <View style={[s.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
      <View style={s.panel} accessibilityViewIsModal testID="options-panel">
        <Text style={s.title}>{title}</Text>{!!description && <Text style={s.description}>{description}</Text>}
        <ScrollView ref={list} style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          {options.map((option, i) => <View key={i} onLayout={e => { offsets.current[i] = e.nativeEvent.layout.y; }}><TvButton label={option.label} disabled={option.disabled} focused={i === index} onPress={() => { setIndex(i); option.run(); }} /></View>)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: '#000c', justifyContent: 'center', alignItems: 'center' }, panel: { width: '100%', maxWidth: 900, maxHeight: '100%', backgroundColor: '#11171a', borderWidth: 1, borderColor: '#55646a', padding: 14, borderRadius: 10 }, title: { color: '#e1e8e8', fontSize: 22, fontWeight: '600', marginBottom: 6 }, description: { color: '#a9b6b6', fontSize: 15, lineHeight: 21, marginBottom: 8 } });
