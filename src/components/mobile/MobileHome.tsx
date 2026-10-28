import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Channel } from '../../types';
import { greeting, meshFor, monogram, timeRange, type HomeItem, type HomeModel } from '../../core/mobileHub';
import type { MobileInsets } from '../../core/mobileDashboard';
import { MeshArt, Scrim } from '../../ui/MeshArt';
import { FONT, R, T, TYPE } from '../../ui/theme';

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const title = (item: HomeItem) => item.now?.title || item.row.channel.name;

function Chip({ children }: { children: string }) {
  return <View style={s.mono}><Text style={s.monoText}>{children}</Text></View>;
}

function Tile({ item, onWatch }: { item: HomeItem; onWatch: (channel: Channel) => void }) {
  const channel = item.row.channel;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Watch ${title(item)} on ${channel.name}`} onPress={() => onWatch(channel)} style={({ pressed }) => [s.tile, pressed && { opacity: 0.75 }]}>
    <MeshArt id={meshFor(channel.name)} style={s.tileArt}>
      <View style={s.tileMono}><Chip>{monogram(channel.name)}</Chip></View>
      <View style={s.tileTrack}><View style={[s.tileFill, { width: `${item.progress * 100}%` }]} /></View>
    </MeshArt>
    <Text style={s.tileTitle} numberOfLines={1}>{title(item)}</Text>
    <Text style={s.tileSub} numberOfLines={1}>{channel.name}</Text>
  </Pressable>;
}

/** Live first: one featured item with a single clear action, then what else is on now. */
export function MobileHome({ model, now, insets, busy, favorites, onWatch, onFavorite, onSetup }: {
  model: HomeModel; now: number; insets: MobileInsets; busy: string; favorites: readonly string[];
  onWatch: (channel: Channel) => void; onFavorite: (channel: Channel) => void; onSetup: () => void;
}) {
  const { featured, shelf } = model;
  const pad = { paddingLeft: insets.left + 84, paddingRight: insets.right + 28, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 };
  if (!featured) {
    return <View style={[s.root, pad, { justifyContent: 'center' }]}>
      <MeshArt id="dusk" style={StyleSheet.absoluteFill} /><Scrim from={0.55} to={0.9} start={0} />
      <View style={s.empty}>
        <View style={s.emptyIcon}><Ionicons name="tv-outline" size={26} color={T.mint} /></View>
        <Text style={s.emptyTitle}>{busy ? 'Setting things up' : model.hasChannels ? 'Nothing to show yet' : 'Add your channels'}</Text>
        <Text style={s.emptyBody}>{busy || (model.hasChannels ? 'Your channels are loaded, but none are available right now.' : 'Load the US channel lineup to start watching. Your playlists, guide and favorites stay on this device.')}</Text>
        {!busy && !model.hasChannels && <Pressable accessibilityRole="button" accessibilityLabel="Load US channels" onPress={onSetup} style={({ pressed }) => [s.primary, pressed && { opacity: 0.8 }]}><Text style={s.primaryText}>Load US channels</Text></Pressable>}
      </View>
    </View>;
  }
  const channel = featured.row.channel;
  const favorite = favorites.includes(channel.id);
  return <View style={s.root}>
    <MeshArt id={meshFor(channel.name)} style={StyleSheet.absoluteFill} />
    <Scrim from={0.25} to={0.95} start={0.25} />
    <View style={[s.content, pad]}>
      <Text style={[s.when, { right: insets.right + 28, top: insets.top + 16 }]}>{greeting(now)} · {clock(now)}</Text>
      <View style={s.hero}>
        <View style={s.chipRow}>
          <Chip>{monogram(channel.name)}</Chip>
          <Text style={s.channelName} numberOfLines={1}>{channel.name}{featured.row.number ? ` · ch ${featured.row.number}` : ''}</Text>
          {featured.now && <View style={s.liveRow}><View style={s.liveDot} /><Text style={s.liveText}>LIVE</Text></View>}
        </View>
        <Text style={s.title} numberOfLines={1}>{title(featured)}</Text>
        <Text style={s.meta} numberOfLines={1}>{featured.now ? `${timeRange(featured.now)} · ${featured.minutesLeft} min left` : model.hasGuide ? 'Nothing listed right now' : 'No guide data for this channel'}</Text>
        {featured.now && <View style={s.track}><View style={[s.fill, { width: `${featured.progress * 100}%` }]} /></View>}
        <View style={s.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Watch ${channel.name} live`} onPress={() => onWatch(channel)} style={({ pressed }) => [s.primary, pressed && { opacity: 0.8 }]}>
            <Ionicons name="play" size={18} color={T.lightInk} /><Text style={s.primaryText}>Watch live</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`} accessibilityState={{ selected: favorite }} onPress={() => onFavorite(channel)} style={({ pressed }) => [s.round, pressed && { opacity: 0.7 }]}>
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={20} color={favorite ? T.mint : T.text} />
          </Pressable>
        </View>
      </View>
      {shelf.length > 0 && <View>
        <Text style={s.shelfLabel}>ON NOW</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shelf}>{shelf.map(item => <Tile key={item.row.channel.id} item={item} onWatch={onWatch} />)}</ScrollView>
      </View>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.ink },
  content: { flex: 1, justifyContent: 'space-between', gap: 14 },
  when: { fontFamily: FONT, color: T.text2, ...TYPE.caption, position: 'absolute', right: 28, top: 14 },
  hero: { gap: 6, alignItems: 'flex-start' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  mono: { minWidth: 30, height: 24, paddingHorizontal: 7, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,14,28,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  monoText: { fontFamily: FONT, color: T.text, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  channelName: { fontFamily: FONT, color: T.text2, ...TYPE.caption, flexShrink: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.live },
  liveText: { fontFamily: FONT, color: T.live, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontFamily: FONT, color: T.text, ...TYPE.display, maxWidth: '100%' },
  meta: { fontFamily: FONT, color: T.text2, ...TYPE.body },
  track: { width: 200, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 4 },
  fill: { height: 4, backgroundColor: T.mint },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  primary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, borderRadius: R.pill, backgroundColor: T.light },
  primaryText: { fontFamily: FONT, color: T.lightInk, fontSize: 16, fontWeight: '700' },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: T.glassLight },
  shelfLabel: { fontFamily: FONT, color: T.text2, ...TYPE.label, marginBottom: 8 },
  shelf: { gap: 14, paddingRight: 8 },
  tile: { width: 140 },
  tileArt: { width: 140, aspectRatio: 16 / 9, borderRadius: R.tile },
  tileMono: { position: 'absolute', left: 7, top: 7 },
  tileTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  tileFill: { height: 3, backgroundColor: T.mint },
  tileTitle: { fontFamily: FONT, color: T.text, fontSize: 13.5, fontWeight: '700', marginTop: 7 },
  tileSub: { fontFamily: FONT, color: T.text2, fontSize: 12 },
  empty: { alignSelf: 'center', maxWidth: 420, alignItems: 'flex-start', gap: 10 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: T.mat2 },
  emptyTitle: { fontFamily: FONT, color: T.text, ...TYPE.title },
  emptyBody: { fontFamily: FONT, color: T.text2, ...TYPE.body },
});
