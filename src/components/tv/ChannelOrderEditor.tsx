import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Channel } from '../../types';
import { moveChannel, orderedChannels } from '../../core/preferences';
import { tvNative, useTvKeys } from '../../data/tv';
import { TvButton } from './TvUi';

export function ChannelOrderEditor({ channels, order, initialId, onChange, onClose }: {
  channels: Channel[]; order: string[]; initialId?: string; onChange: (order: string[]) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(initialId || channels[0]?.id);
  const [query, setQuery] = useState(''), [typing, setTyping] = useState(false), [action, setAction] = useState<number>();
  const list = useRef<FlatList<Channel>>(null);
  const sorted = useMemo(() => orderedChannels(channels, order), [channels, order]);
  const shown = sorted.filter(c => `${c.name} ${c.number || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const index = sorted.findIndex(c => c.id === selected);
  const channel = sorted[index];
  const actions = [
    { label: 'Move up', run: () => move(index - 1), disabled: index <= 0 },
    { label: 'Move down', run: () => move(index + 1), disabled: index < 0 || index === sorted.length - 1 },
    { label: 'Move to top', run: () => move(0), disabled: index <= 0 },
    { label: 'Move to bottom', run: () => move(sorted.length - 1), disabled: index < 0 || index === sorted.length - 1 },
    { label: 'Reset order', run: () => onChange([]) }, { label: 'Done', run: onClose },
  ];
  function move(destination: number) { if (channel) onChange(moveChannel(channels, order, channel.id, destination)); }
  useEffect(() => { tvNative?.setRemoteEnabled(!typing); return () => tvNative?.setRemoteEnabled(true); }, [typing]);
  useEffect(() => { if (!shown.some(c => c.id === selected)) setSelected(shown[0]?.id); }, [query, channels]);
  useEffect(() => { const i = shown.findIndex(c => c.id === selected); if (i >= 0) list.current?.scrollToOffset({ offset: Math.max(0, i - 1) * 52, animated: false }); }, [selected, order]);
  useTvKeys(key => {
    if (key === 'back' || key === 'menu') onClose();
    else if (action != null) {
      if (key === 'left' || key === 'right') setAction(i => Math.max(0, Math.min(actions.length - 1, (i || 0) + (key === 'left' ? -1 : 1))));
      else if (key === 'down') setAction(undefined);
      else if (key === 'select' && !actions[action]?.disabled) actions[action]?.run();
    } else if (key === 'up' || key === 'down') {
      const i = shown.findIndex(c => c.id === selected);
      if (key === 'up' && i <= 0) setAction(0);
      else setSelected(shown[Math.max(0, Math.min(shown.length - 1, i + (key === 'up' ? -1 : 1)))]?.id);
    } else if (key === 'select' || key === 'left' || key === 'right') setAction(0);
  }, !typing);
  return <Modal transparent visible onRequestClose={onClose} supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
    <View style={[s.backdrop, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10, paddingLeft: insets.left + 10, paddingRight: insets.right + 10 }]}><View style={s.panel} accessibilityViewIsModal>
      <Text style={s.title}>Channel order</Text><Text style={s.hint}>Select a channel, then move it. Saved order survives playlist refreshes. Channel numbers stay the same.</Text>
      <TextInput value={query} onChangeText={setQuery} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} accessibilityLabel="Find channel to reorder" placeholder="Find a channel" placeholderTextColor="#7f8f90" style={s.input} />
      <Text style={s.hint}>{channel ? `${index + 1} of ${sorted.length} · ${channel.name}` : 'No matching channels'}</Text>
      <View style={s.actions}>{actions.map((item, i) => <TvButton key={item.label} label={item.label} focused={action === i} disabled={item.disabled} onPress={item.run} />)}</View>
      <FlatList ref={list} data={shown} keyExtractor={c => c.id} keyboardShouldPersistTaps="handled" getItemLayout={(_data, i) => ({ length: 52, offset: i * 52, index: i })} renderItem={({ item }) => <TvButton label={`${item.number || ''} ${item.name}`} selected={item.id === selected} focused={action == null && selected === item.id} onPress={() => { setSelected(item.id); setAction(undefined); }} style={{ height: 52 }} />} />
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({ backdrop: { flex: 1, backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center' }, panel: { width: '100%', maxWidth: 1000, height: '100%', backgroundColor: '#11171a', padding: 12, borderRadius: 10 }, title: { fontSize: 22, color: '#e1e8e8' }, hint: { color: '#a9b6b6', fontSize: 14, marginVertical: 5 }, input: { color: '#fff', borderColor: '#55646a', borderWidth: 1, padding: 8, fontSize: 16 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 } });
