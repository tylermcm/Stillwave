import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { programIndex, searchPrograms, type GuideView, type ProgramResult } from '../core/guides';
import type { Channel, ProgramReminder } from '../types';

type Props = { channels: Channel[]; view: GuideView; reminders: ProgramReminder[]; favorites: Set<string>; now: number; onWatch: (channel: Channel) => void; onReminder: (row: ProgramResult) => void; onChannels: () => void; sourceLabel: string; onChooseSource: () => void; initiallySaved?: boolean };
export function ProgramBrowser(props: Props) {
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<'now' | 'soon' | 'week' | 'saved'>(props.initiallySaved ? 'saved' : 'now');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const index = useMemo(() => programIndex(props.channels, props.view), [props.channels, props.view]);
  const rows = useMemo<ProgramResult[]>(() => {
    if (range !== 'saved') return searchPrograms(index, query, range, props.now, props.reminders, favoritesOnly ? props.favorites : undefined);
    const channels = new Map(props.channels.map(c => [c.id, c]));
    return props.reminders.flatMap(reminder => {
      const channel = channels.get(reminder.channelId);
      return channel && (!favoritesOnly || props.favorites.has(channel.id)) && `${reminder.title} ${channel.name}`.toLowerCase().includes(query.toLowerCase()) ? [{ channel, key: reminder.id, programme: { channelId: '', title: reminder.title, start: reminder.start, stop: reminder.stop } }] : [];
    }).sort((a, b) => a.programme.start - b.programme.start);
  }, [index, query, range, props.now, props.reminders, props.channels, favoritesOnly, props.favorites]);
  const saved = useMemo(() => new Map(props.reminders.map(r => [r.id, r])), [props.reminders]);
  const matched = useMemo(() => props.channels.filter(c => props.view.matcher(c)).length, [props.channels, props.view]);
  return <FlatList style={{ flex: 1 }} contentContainerStyle={s.list} data={rows.slice(0, 400)} keyExtractor={row => row.key} initialNumToRender={8} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={<View style={s.header}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to channel schedules" onPress={props.onChannels} style={s.link}><Text style={s.linkText}>← Channel schedules</Text></Pressable>
    <Text style={s.heading}>Find your next watch.</Text>
    <TextInput accessibilityLabel="Search programs" value={query} onChangeText={setQuery} placeholder="Shows, teams, topics, or channels" placeholderTextColor="#78928b" style={s.input} />
    <View style={s.row}>{([{ id: 'now', label: 'On now' }, { id: 'soon', label: 'Starting soon' }, { id: 'week', label: 'Next 7 days' }, { id: 'saved', label: `Saved (${props.reminders.length})` }] as const).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: range === item.id }} onPress={() => setRange(item.id)} style={[s.chip, range === item.id && s.active]}><Text style={s.chipText}>{item.label}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityLabel="Search favorite channels only" accessibilityState={{ selected: favoritesOnly }} onPress={() => setFavoritesOnly(v => !v)} style={[s.chip, favoritesOnly && s.active]}><Text style={s.chipText}>★ Favorites</Text></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose playlists" onPress={props.onChooseSource} style={s.link}><Text style={s.linkText}>{props.sourceLabel} ▾</Text></Pressable>
    <Text style={s.body}>{matched} of {props.channels.length} channels have guide matches. {props.channels.length - matched > 0 ? 'Unmatched channels have no searchable schedule.' : 'Results come from your imported guides.'}</Text>
    <Text style={s.body}>Reminders aim for five minutes before a program. Android battery settings may delay them. Saved programs without notification permission stay in this list.</Text>
    <Text style={s.count}>{rows.length.toLocaleString()} results{rows.length > 400 ? ' · showing the first 400; refine your search' : ''}</Text>
  </View>} renderItem={({ item }) => {
    const onNow = item.programme.start <= props.now && item.programme.stop > props.now;
    const ended = item.programme.stop <= props.now;
    const reminder = saved.get(item.key);
    return <View style={s.card}><Text style={s.eyebrow}>{onNow ? 'ON NOW' : ended ? 'ENDED' : new Date(item.programme.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</Text>
      <Text style={s.title}>{item.programme.title}</Text><Text style={s.body}>{item.channel.name} · {new Date(item.programme.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {new Date(item.programme.stop).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
      {!!item.programme.description && <Text numberOfLines={3} style={s.body}>{item.programme.description}</Text>}
      <View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel={`Watch ${item.channel.name}`} onPress={() => props.onWatch(item.channel)} style={s.chip}><Text style={s.chipText}>{onNow ? 'Watch now' : 'Watch channel'}</Text></Pressable>{(reminder || item.programme.start > props.now) && <Pressable accessibilityRole="button" accessibilityLabel={`${reminder ? 'Remove reminder for' : 'Remind me about'} ${item.programme.title} on ${item.channel.name}`} onPress={() => props.onReminder(item)} style={[s.chip, reminder && s.active]}><Text style={s.chipText}>{reminder ? reminder.notify ? '✓ Reminder set' : '✓ Saved only' : 'Remind me'}</Text></Pressable>}</View>
    </View>;
  }} ListEmptyComponent={<Text style={s.empty}>{range === 'saved' ? 'Save upcoming programs to find them here.' : !props.view.guide ? 'Import a guide in Sources to search programs.' : 'No programs match this search in your guide data.'}</Text>} />;
}
const s = StyleSheet.create({ list: { padding: 20, gap: 13, paddingBottom: 30 }, header: { gap: 12, marginBottom: 4 }, heading: { color: '#e9f5ee', fontSize: 26, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#294237', borderRadius: 12, padding: 14, color: '#e5f2eb', backgroundColor: '#12251d', fontSize: 13 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 12, minHeight: 42, justifyContent: 'center', borderRadius: 10, backgroundColor: '#20372c' }, active: { backgroundColor: '#315b40' }, chipText: { color: '#d8efdf', fontSize: 12, fontWeight: '600' }, link: { minHeight: 40, justifyContent: 'center' }, linkText: { color: '#a7eccb', fontSize: 12, fontWeight: '600' }, body: { color: '#a0b6aa', fontSize: 12, lineHeight: 20 }, count: { color: '#789a84', fontSize: 11 }, card: { padding: 16, backgroundColor: '#13261e', borderRadius: 15, gap: 10 }, eyebrow: { color: '#9ac9a8', fontSize: 9, fontWeight: '700', letterSpacing: 1 }, title: { color: '#e6f4eb', fontSize: 17, fontWeight: '600' }, empty: { color: '#93b29f', fontSize: 13, lineHeight: 22, paddingVertical: 30 } });
