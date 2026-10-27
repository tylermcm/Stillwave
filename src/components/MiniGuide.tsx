import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Channel, Library } from '../types';
import type { GuideView } from '../core/guides';
import { nowAndNext } from '../core/xmltv';

export function MiniGuide({ library, view, selectedId, fullscreen, previous, onSelect, onClose }: {
  library: Library; view: GuideView; selectedId: string; fullscreen: boolean; previous?: Channel; onSelect: (channel: Channel) => Promise<boolean>; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'recent'>('all');
  const [selecting, setSelecting] = useState(false);
  const favorites = useMemo(() => new Set(library.favorites), [library.favorites]);
  const now = Date.now();
  const rows = useMemo(() => {
    const recent = new Map(library.recents.map((r, index) => [r.channelId, index]));
    const text = query.toLowerCase();
    return library.channels.filter(c => (filter !== 'favorites' || favorites.has(c.id)) && (filter !== 'recent' || recent.has(c.id)) && `${c.name} ${c.group}`.toLowerCase().includes(text))
      .sort((a, b) => filter === 'recent' ? recent.get(a.id)! - recent.get(b.id)! : 0);
  }, [library.channels, library.recents, query, filter, favorites]);
  const choose = async (channel: Channel) => {
    if (selecting) return;
    setSelecting(true);
    try { if (channel.id === selectedId || await onSelect(channel)) onClose(); }
    finally { setSelecting(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View style={s.shade}><SafeAreaView style={[s.sheet, !fullscreen && { height: '60%', maxHeight: '60%' }]}>
    <View style={s.header}><Text style={s.title}>Mini guide</Text>{previous && <Pressable accessibilityRole="button" accessibilityLabel={`Previous channel ${previous.name}`} disabled={selecting} onPress={() => void choose(previous)} style={s.action}><Ionicons name="swap-horizontal" size={20} color="#a7eccb" /><Text numberOfLines={1} style={s.small}>Previous</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Close mini guide" onPress={onClose} style={s.action}><Ionicons name="close" size={25} color="#d5e8dd" /></Pressable></View>
    <TextInput accessibilityLabel="Search mini guide" value={query} onChangeText={setQuery} placeholder="Find a channel" placeholderTextColor="#739680" style={s.input} />
    <View style={s.filters}>{(['all', 'favorites', 'recent'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Mini guide ${value}`} accessibilityState={{ selected: value === filter }} onPress={() => setFilter(value)} style={[s.filter, value === filter && s.active]}><Text style={s.small}>{value === 'all' ? 'All channels' : value === 'favorites' ? 'Favorites' : 'Recent'}</Text></Pressable>)}</View>
    <FlatList data={rows} keyExtractor={c => c.id} keyboardShouldPersistTaps="handled" initialNumToRender={7} renderItem={({ item }) => {
      const id = view.matcher(item);
      const schedule = nowAndNext(id ? view.guide?.programmes[id] : undefined, now);
      return <Pressable accessibilityRole="button" accessibilityLabel={`Mini guide watch ${item.name}`} disabled={selecting} onPress={() => void choose(item)} style={[s.channel, item.id === selectedId && s.selected]}><View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={s.name}>{item.name}</Text><Text numberOfLines={1} style={s.body}>{schedule.now?.title || (id ? 'No program on now' : 'No guide match')}</Text>{schedule.next && <Text numberOfLines={1} style={s.body}>Next · {schedule.next.title}</Text>}</View>{item.id === selectedId && <Ionicons name="volume-high" color="#a7eccb" size={20} />}</Pressable>;
    }} ListEmptyComponent={<Text style={[s.body, { padding: 20 }]}>No channels match this view.</Text>} />
  </SafeAreaView></View></Modal>;
}
const s = StyleSheet.create({ shade: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end', alignItems: 'flex-end' }, sheet: { width: '100%', maxWidth: 480, maxHeight: '85%', height: '85%', backgroundColor: '#0c2018f7', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }, header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 8, minHeight: 54 }, title: { flex: 1, color: '#e6f3eb', fontSize: 18, fontWeight: '700' }, action: { minHeight: 44, minWidth: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingHorizontal: 8 }, small: { color: '#c8e6d0', fontSize: 12, fontWeight: '600' }, input: { marginHorizontal: 16, padding: 12, borderWidth: 1, borderColor: '#2e4c39', borderRadius: 10, color: '#e6f3eb', fontSize: 13 }, filters: { flexDirection: 'row', padding: 12, gap: 8 }, filter: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#193326', borderRadius: 9 }, active: { backgroundColor: '#30593e' }, channel: { minHeight: 76, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1e3828', flexDirection: 'row', alignItems: 'center', gap: 10 }, selected: { backgroundColor: '#244b33' }, name: { color: '#e3f2e9', fontWeight: '600', fontSize: 14 }, body: { color: '#95b9a1', fontSize: 11, lineHeight: 18 } });
