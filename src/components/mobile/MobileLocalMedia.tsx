import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDuration, progressFraction, type LocalItem } from '../../core/localMedia';
import { meshFor } from '../../core/mobileHub';
import type { MobileInsets } from '../../core/mobileDashboard';
import { MeshArt } from '../../ui/MeshArt';
import { FONT, R, T, TYPE } from '../../ui/theme';

const confirmRemove = (item: LocalItem, remove: () => void) => {
  if (Platform.OS === 'web') { if (window.confirm(`Remove ${item.name} from recents? The file on your phone is not touched.`)) remove(); return; }
  Alert.alert('Remove from recents?', `${item.name} stays on your phone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
};

function Tile({ item, onOpen, onChoose, onRemove }: { item: LocalItem; onOpen: () => void; onChoose: () => void; onRemove: () => void }) {
  const fraction = progressFraction(item);
  const problem = item.problem;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.kind}${problem === 'moved' ? ', file moved, choose again' : problem === 'unsupported' ? ', format not supported' : ''}`} accessibilityHint="Hold to remove from recents" onPress={problem === 'moved' ? onChoose : onOpen} onLongPress={onRemove} style={({ pressed }) => [s.tile, pressed && { opacity: 0.75 }]}>
    <MeshArt id={meshFor(item.name)} style={s.art}>
      <View style={s.center}><Ionicons name={item.kind === 'video' ? 'play-circle-outline' : 'musical-notes-outline'} size={34} color="rgba(246,243,236,0.9)" /></View>
      {!!item.durationMs && <View style={s.duration}><Text style={s.durationText}>{formatDuration(item.durationMs)}</Text></View>}
      {fraction > 0 && <View style={s.track}><View style={[s.fill, { width: `${fraction * 100}%` }]} /></View>}
      {!!problem && <View style={s.problemShade}><Ionicons name="alert-circle-outline" size={28} color={T.warn} /></View>}
    </MeshArt>
    <Text style={s.name} numberOfLines={1}>{item.name}</Text>
    <Text style={[s.sub, !!problem && { color: T.warn }]} numberOfLines={1}>{problem === 'moved' ? 'File moved — choose again' : problem === 'unsupported' ? 'Format not supported here' : item.kind === 'video' ? 'Video' : 'Audio'}</Text>
  </Pressable>;
}

function EmptyArt() {
  return <View style={s.stack}>
    {(['dusk', 'aurora', 'coast'] as const).map((id, i) => <MeshArt key={id} id={id} style={[s.stackCard, { left: 18 + i * 14, top: i * 20, transform: [{ rotate: `${[-9, 5, -2][i]}deg` }] }]}>
      {i === 2 && <View style={s.center}><Ionicons name="play" size={30} color={T.text} /></View>}
    </MeshArt>)}
  </View>;
}

/** Local Media: only files the person chose, with honest states for files that moved or cannot play. */
export function MobileLocalMedia({ items, loaded, notice, insets, onBack, onChoose, onOpen, onRemove, onClear }: {
  items: LocalItem[]; loaded: boolean; notice: string; insets: MobileInsets;
  onBack: () => void; onChoose: () => void; onOpen: (item: LocalItem) => void; onRemove: (item: LocalItem) => void; onClear: () => void;
}) {
  const pad = { paddingLeft: insets.left + 84, paddingRight: insets.right + 28, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 };
  const empty = loaded && items.length === 0;
  return <View style={s.root}>
    <ScrollView contentContainerStyle={[s.scroll, pad, empty && { flexGrow: 1 }]} showsVerticalScrollIndicator={false}>
      <View style={s.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Discover" onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={22} color={T.text} /></Pressable>
        <Text style={s.title}>Local Media</Text>
        <View style={{ flex: 1 }} />
        {!empty && <Pressable accessibilityRole="button" accessibilityLabel="Choose files" onPress={onChoose} style={({ pressed }) => [s.choose, pressed && { opacity: 0.8 }]}><Ionicons name="add" size={20} color={T.lightInk} /><Text style={s.chooseText}>Choose files</Text></Pressable>}
      </View>
      {empty ? <View style={s.emptyRow}>
        <EmptyArt />
        <View style={s.emptyText}>
          <Text style={s.emptyTitle}>Play what’s on this phone</Text>
          <Text style={s.emptyBody}>Choose videos or audio and they’ll appear here. StillWave only sees the files you pick — nothing is scanned, copied or uploaded.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose files" onPress={onChoose} style={({ pressed }) => [s.choose, { alignSelf: 'flex-start', marginTop: 6 }, pressed && { opacity: 0.8 }]}><Ionicons name="add" size={20} color={T.lightInk} /><Text style={s.chooseText}>Choose files</Text></Pressable>
        </View>
      </View> : <>
        <View style={s.labelRow}><Text style={s.label}>RECENTLY OPENED</Text><Pressable accessibilityRole="button" accessibilityLabel="Clear recents" onPress={onClear} hitSlop={10}><Text style={s.clear}>Clear recents</Text></Pressable></View>
        <View style={s.grid}>{items.map(item => <Tile key={item.id} item={item} onOpen={() => onOpen(item)} onChoose={onChoose} onRemove={() => confirmRemove(item, () => onRemove(item))} />)}</View>
      </>}
    </ScrollView>
    {!!notice && <View pointerEvents="none" style={[s.notice, { bottom: insets.bottom + 16 }]}><Text style={s.noticeText}>{notice}</Text></View>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.ink },
  scroll: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  title: { fontFamily: FONT, color: T.text, ...TYPE.title },
  choose: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: T.light },
  chooseText: { fontFamily: FONT, color: T.lightInk, fontSize: 15, fontWeight: '700' },
  emptyRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 36, justifyContent: 'center', paddingBottom: 30 },
  stack: { width: 220, height: 170 },
  stackCard: { position: 'absolute', width: 150, aspectRatio: 16 / 10, borderRadius: 14, borderWidth: 1, borderColor: T.edge },
  emptyText: { maxWidth: 330, gap: 8 },
  emptyTitle: { fontFamily: FONT, color: T.text, ...TYPE.title, fontSize: 24, lineHeight: 28 },
  emptyBody: { fontFamily: FONT, color: T.text2, ...TYPE.body },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: FONT, color: T.text2, ...TYPE.label },
  clear: { fontFamily: FONT, color: T.text2, fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tile: { width: 156 },
  art: { width: 156, aspectRatio: 16 / 9, borderRadius: R.tile },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', right: 7, bottom: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(10,14,28,0.7)' },
  durationText: { fontFamily: FONT, color: T.text, fontSize: 11, fontWeight: '700' },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  fill: { height: 3, backgroundColor: T.mint },
  problemShade: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,23,0.62)' },
  name: { fontFamily: FONT, color: T.text, fontSize: 13, fontWeight: '700', marginTop: 7 },
  sub: { fontFamily: FONT, color: T.text2, fontSize: 12 },
  notice: { position: 'absolute', alignSelf: 'center', maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: R.pill, backgroundColor: T.light },
  noticeText: { fontFamily: FONT, color: T.lightInk, fontSize: 13, fontWeight: '700' },
});
