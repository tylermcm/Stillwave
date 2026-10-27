import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GuideSource, SavedPlaylist } from '../types';

type Props = {
  sources: GuideSource[]; playlists: SavedPlaylist[]; input: string; onInput: (value: string) => void;
  name: string; onName: (value: string) => void; scope: string; onScope: (value: string) => void; busy: boolean;
  onImport: (file?: boolean, id?: string) => void; onRemove: (id: string) => void;
  onAssign: (id: string, scope: string) => void; onMove: (id: string) => void; onRefreshHours: (id: string, hours: number) => void;
};
export function GuideSources(props: Props) {
  const [editing, setEditing] = useState('');
  const scopeButtons = (value: string, onChange: (value: string) => void) => <View style={s.row}>{[{ id: 'all', name: 'All playlists' }, ...props.playlists].map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Guide for ${p.name}`} accessibilityState={{ selected: value === p.id }} disabled={props.busy} onPress={() => onChange(p.id)} style={[s.chip, value === p.id && s.active]}><Text style={s.small}>{p.name}</Text></Pressable>)}</View>;
  return <View style={s.card}>
    <Text style={s.title}>Program guides · EPG</Text><Text style={s.body}>Give each playlist its own XMLTV guide, or share one across all playlists. Playlist guides take priority over shared guides.</Text>
    <TextInput accessibilityLabel="Guide name" value={props.name} onChangeText={props.onName} placeholder="Guide name (optional)" placeholderTextColor="#6c827d" style={s.input} />
    <TextInput accessibilityLabel="XMLTV guide URL" value={props.input} onChangeText={props.onInput} placeholder="https://your-guide/guide.xml" placeholderTextColor="#6c827d" style={s.input} autoCapitalize="none" autoCorrect={false} />
    <Text style={s.label}>USE THIS GUIDE FOR</Text>{scopeButtons(props.scope, props.onScope)}
    <View style={s.row}><Action text="Import guide" disabled={props.busy || !props.input.trim() || !props.playlists.length} onPress={() => props.onImport()} primary /><Action text="Choose guide file" disabled={props.busy || !props.playlists.length} onPress={() => props.onImport(true)} /></View>
    {props.sources.map((source, index) => <View key={source.id} style={s.source}>
      <Text style={s.title}>{source.name}</Text><Text style={s.body}>{source.playlistIds.length ? source.playlistIds.map(id => props.playlists.find(p => p.id === id)?.name || 'Removed playlist').join(', ') : 'Shared · all playlists'}</Text>
      <Text style={s.body}>Updated {new Date(source.guide.importedAt).toLocaleString()} · {Object.values(source.guide.programmes).reduce((sum, list) => sum + list.length, 0).toLocaleString()} programs</Text>
      {!!source.lastError && <Text style={s.error}>{source.lastError} Cached guide kept.</Text>}
      <View style={s.row}><Action text={source.url ? `Refresh ${source.name}` : `Replace ${source.name}`} disabled={props.busy} onPress={() => props.onImport(!source.url, source.id)} /><Action text={`Assign ${source.name}`} disabled={props.busy} onPress={() => setEditing(editing === source.id ? '' : source.id)} />{index > 0 && <Action text={`Move up ${source.name}`} disabled={props.busy} onPress={() => props.onMove(source.id)} />}<Action text={`Remove ${source.name}`} disabled={props.busy} onPress={() => props.onRemove(source.id)} /></View>
      {editing === source.id && scopeButtons(source.playlistIds[0] || 'all', value => { props.onAssign(source.id, value); setEditing(''); })}
      {source.url && <View><Text style={s.label}>AUTO REFRESH WHILE THE APP IS OPEN</Text><View style={s.row}>{[0, 6, 12, 24].map(hours => <Pressable key={hours} accessibilityRole="button" accessibilityLabel={`${source.name} refresh ${hours ? `every ${hours} hours` : 'off'}`} accessibilityState={{ selected: source.refreshHours === hours }} disabled={props.busy} onPress={() => props.onRefreshHours(source.id, hours)} style={[s.chip, source.refreshHours === hours && s.active]}><Text style={s.small}>{hours ? `${hours}h` : 'Off'}</Text></Pressable>)}</View></View>}
    </View>)}
    {!props.sources.length && <Text style={s.body}>Import generated XMLTV .xml or .xml.gz files, not a repository page or .channels.xml setup file.</Text>}
  </View>;
}
function Action({ text, onPress, disabled, primary }: { text: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={text} onPress={onPress} disabled={disabled} style={[s.chip, primary && s.active, disabled && { opacity: 0.4 }]}><Text style={s.small}>{text}</Text></Pressable>;
}
const s = StyleSheet.create({ card: { backgroundColor: '#11221e', borderColor: '#223a30', borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 }, title: { color: '#e6f3eb', fontSize: 17, fontWeight: '600' }, body: { color: '#a0b6ab', fontSize: 12, lineHeight: 20 }, label: { color: '#88ac98', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginVertical: 6 }, input: { borderWidth: 1, borderColor: '#2c4238', borderRadius: 11, padding: 13, color: '#e6f3eb', fontSize: 13 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 12, minHeight: 42, justifyContent: 'center', borderRadius: 10, backgroundColor: '#20382c', maxWidth: '100%' }, active: { backgroundColor: '#315d44', borderWidth: 1, borderColor: '#7ab28b' }, small: { color: '#d8ebde', fontSize: 12, fontWeight: '600' }, source: { borderTopWidth: 1, borderTopColor: '#284332', paddingTop: 16, gap: 10 }, error: { color: '#e1b68d', fontSize: 12, lineHeight: 19 } });
