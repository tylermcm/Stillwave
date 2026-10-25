import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EMPTY_LIBRARY, type BufferProfile, type Channel, type Library, type Programme } from './src/types';
import { MAX_PLAYLIST_BYTES } from './src/core/feedBytes';
import { normalizeFeedUrl, parseM3u } from './src/core/m3u';
import { createGuideMatcher, nowAndNext, parseXmltv } from './src/core/xmltv';
import { downloadFeed, pickFeed } from './src/data/feeds';
import { cacheGuideSource, loadGuideSource, loadLibrary, saveLibrary } from './src/data/library';
import { LivePlayer } from './src/components/LivePlayer';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

type Tab = 'watch' | 'guide' | 'sources';
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const date = (ms?: number) => ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not imported';

function Button({ label, icon, onPress, secondary = false, disabled = false }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
    {icon && <Ionicons name={icon} size={18} color={secondary ? '#d7e6e0' : '#09241b'} />}<Text style={[s.buttonText, secondary && { color: '#d7e6e0' }]}>{label}</Text>
  </Pressable>;
}

function Shell() {
  const [library, setLibrary] = useState<Library>({ ...EMPTY_LIBRARY });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('watch');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selected, setSelected] = useState<Channel>();
  const [fullscreen, setFullscreen] = useState(false);
  const [playlistInput, setPlaylistInput] = useState('');
  const [guideInput, setGuideInput] = useState('');
  const [guideChannel, setGuideChannel] = useState<Channel>();
  const [matching, setMatching] = useState(false);
  const [matchQuery, setMatchQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const dirty = useRef(false);
  const current = useRef(library);
  current.current = library;
  const update = useCallback((change: (previous: Library) => Library) => {
    dirty.current = true;
    setLibrary(change);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadLibrary().then(data => { if (mounted) setLibrary(data); }).catch(() => {
      if (mounted) setError('Could not read the saved library. You can import your playlist again.');
    }).finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    const timer = setTimeout(() => { saveLibrary(library).catch(() => setError('Your changes could not be saved on this device. Check free storage.')); }, 350);
    return () => clearTimeout(timer);
  }, [library, loaded]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setFullscreen(false); return true; });
    return () => subscription.remove();
  }, [fullscreen]);

  const matcher = useMemo(() => createGuideMatcher(library.guide), [library.guide]);
  const favorites = useMemo(() => new Set(library.favorites), [library.favorites]);
  const groups = useMemo(() => ['All', ...Array.from(new Set(library.channels.map(c => c.group))).sort()], [library.channels]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return library.channels.filter(c => (!onlyFavorites || favorites.has(c.id)) && (group === 'All' || c.group === group) && (!search || `${c.name} ${c.group}`.toLowerCase().includes(search)));
  }, [library.channels, query, group, favorites, onlyFavorites]);
  const matchedCount = useMemo(() => library.channels.filter(c => matcher(c, library.mappings)).length, [library.channels, library.mappings, matcher]);
  const guideMatches = useMemo(() => Object.entries(library.guide?.channels ?? {}).filter(([id, names]) => `${id} ${names.join(' ')}`.toLowerCase().includes(matchQuery.toLowerCase())), [library.guide, matchQuery]);

  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError(''); setNotice('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The import could not finish. Please try again.'); }
    finally { setBusy(''); }
  };
  const importPlaylist = async (fromFile = false, refresh = false) => {
    await run('Importing channels…', async () => {
      const url = fromFile ? undefined : normalizeFeedUrl(refresh ? current.current.playlistUrl || '' : playlistInput);
      const picked = fromFile ? await pickFeed(MAX_PLAYLIST_BYTES) : undefined;
      if (fromFile && !picked) return;
      const playlist = parseM3u(picked?.text ?? await downloadFeed(url!, MAX_PLAYLIST_BYTES), url);
      const name = picked?.name ?? new URL(url!).hostname;
      update(previous => ({ ...previous, channels: playlist.channels, playlistName: name, playlistUrl: url,
        playlistUpdatedAt: Date.now(), favorites: previous.favorites.filter(id => playlist.channels.some(c => c.id === id)),
        guideUrl: previous.guideUrl || playlist.guideUrls[0],
      }));
      setSelected(undefined); setFullscreen(false); setGroup('All'); setQuery(''); setOnlyFavorites(false);
      setPlaylistInput('');
      if (playlist.guideUrls[0]) setGuideInput(playlist.guideUrls[0]);
      setNotice(`${playlist.channels.length.toLocaleString()} channels imported.${playlist.guideUrls.length ? ' A guide URL was detected. Import it below.' : ''}${playlist.warnings.length ? ` ${playlist.warnings.join(' ')}` : ''}`);
      setTab('sources');
    });
  };
  const importGuide = async (fromFile = false, refresh = false) => {
    await run('Importing program guide…', async () => {
      const url = fromFile ? undefined : normalizeFeedUrl(refresh ? current.current.guideUrl || '' : guideInput || current.current.guideUrl || '');
      const picked = fromFile ? await pickFeed() : undefined;
      if (fromFile && !picked) return;
      const snapshot = current.current;
      const text = picked?.text ?? await downloadFeed(url!);
      const guide = await parseXmltv(text, snapshot.channels, snapshot.mappings);
      await cacheGuideSource(text);
      update(previous => ({ ...previous, guide, guideUrl: url }));
      setGuideInput('');
      const count = Object.values(guide.programmes).reduce((sum, entries) => sum + entries.length, 0);
      const match = createGuideMatcher(guide);
      setNotice(`${count.toLocaleString()} upcoming or recent programs loaded. ${snapshot.channels.filter(c => match(c, snapshot.mappings)).length} of ${snapshot.channels.length} channels matched.${count ? '' : ' Check the guide dates and channel IDs.'}`);
    });
  };
  const matchChannel = async (channel: Channel, guideId: string) => {
    await run('Matching guide…', async () => {
      const snapshot = current.current;
      const mappings = { ...snapshot.mappings, [channel.id]: guideId };
      const text = await loadGuideSource();
      if (!text) throw new Error('Import the guide again to load this channel’s programs.');
      const guide = await parseXmltv(text, snapshot.channels, mappings);
      update(previous => ({ ...previous, mappings, guide }));
      setMatching(false);
    });
  };
  const toggleFavorite = (channel: Channel) => update(previous => ({ ...previous, favorites: previous.favorites.includes(channel.id) ? previous.favorites.filter(id => id !== channel.id) : [...previous.favorites, channel.id] }));
  const removeLibrary = () => {
    const remove = () => void run('Removing saved data…', async () => {
      const empty = { ...EMPTY_LIBRARY, channels: [], favorites: [], mappings: {} };
      update(() => empty);
      setSelected(undefined); setFullscreen(false); setGuideChannel(undefined);
      setPlaylistInput(''); setGuideInput(''); setGroup('All'); setQuery(''); setOnlyFavorites(false);
      await cacheGuideSource('');
      await saveLibrary(empty);
      setNotice('Saved channels, guide and source addresses removed from this device.');
    });
    if (Platform.OS === 'web') { if (window.confirm('Remove all saved channels, favorites, guide data and source addresses from this browser?')) remove(); }
    else Alert.alert('Remove saved library?', 'This removes saved channels, favorites, guide data and source addresses from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
  };
  const selectChannel = (channel: Channel) => { setSelected(channel); setTab('watch'); setGuideChannel(undefined); };

  const renderChannel = ({ item: channel }: { item: Channel }) => {
    const id = matcher(channel, library.mappings);
    const programs = id ? library.guide?.programmes[id] : undefined;
    const schedule = nowAndNext(programs, now);
    const activeChannel = selected?.id === channel.id;
    return <View style={[s.channel, activeChannel && s.channelActive]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Watch ${channel.name}`} onPress={() => selectChannel(channel)} style={s.channelMain}>
        <View style={[s.channelTile, activeChannel && { backgroundColor: '#1e493a' }]}>{activeChannel ? <Ionicons name="volume-high-outline" color="#a7eccb" size={22} /> : <Text style={s.initials}>{channel.name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</Text>}</View>
        <View style={s.channelText}><Text style={s.channelName} numberOfLines={1}>{channel.name}</Text>
          <Text style={s.programTitle} numberOfLines={1}>{schedule.now?.title || (library.guide ? id ? 'No program on now' : 'Guide not matched' : channel.group)}</Text>
          {tab === 'guide' && <Text style={s.nextTitle} numberOfLines={1}>{schedule.next ? `${time(schedule.next.start)}  ${schedule.next.title}` : 'No upcoming program available'}</Text>}
        </View>
      </Pressable>
      {tab === 'guide' ? <Pressable accessibilityRole="button" accessibilityLabel={`Schedule for ${channel.name}`} onPress={() => { setGuideChannel(channel); setMatching(false); }} style={s.smallIcon}><Ionicons name="calendar-outline" size={19} color="#a2b6b1" /></Pressable>
        : <Pressable accessibilityRole="button" accessibilityLabel={`${favorites.has(channel.id) ? 'Remove' : 'Add'} ${channel.name} ${favorites.has(channel.id) ? 'from' : 'to'} favorites`} onPress={() => toggleFavorite(channel)} style={s.smallIcon}><Ionicons name={favorites.has(channel.id) ? 'star' : 'star-outline'} size={20} color={favorites.has(channel.id) ? '#a7eccb' : '#78928b'} /></Pressable>}
    </View>;
  };

  const selectedGuideId = guideChannel ? matcher(guideChannel, library.mappings) : undefined;
  const upcoming = (selectedGuideId ? library.guide?.programmes[selectedGuideId] ?? [] : []).filter(p => p.stop > now).slice(0, 100);
  const showPlayer = selected;

  if (!loaded) return <SafeAreaView style={[s.safe, { justifyContent: 'center' }]}><ActivityIndicator color="#a7eccb" /></SafeAreaView>;
  return <SafeAreaView style={s.safe} edges={fullscreen ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']}>
    <StatusBar style="light" hidden={fullscreen} />
    <View style={[s.frame, fullscreen && s.fullFrame]}>
      {!fullscreen && <View style={s.header}>
        <View><View style={s.brandRow}><Ionicons name="radio" size={21} color="#a7eccb" /><Text style={s.brand}>stillwave<Text style={{ color: '#a7eccb' }}>.</Text></Text></View><Text style={s.tagline}>A little less noise. A lot more TV.</Text></View>
        <View style={s.privateBadge}><View style={s.greenDot} /><Text style={s.privateText}>AD FREE</Text></View>
      </View>}

      {showPlayer && <LivePlayer key={`${selected.id}:${library.profile}`} channel={selected} profile={library.profile} fullscreen={fullscreen} onFullscreen={() => setFullscreen(value => !value)} onClose={() => { setSelected(undefined); setFullscreen(false); }} />}

      {!fullscreen && <>
        {busy !== '' && <View style={s.banner}><ActivityIndicator size="small" color="#a7eccb" /><Text style={s.bannerText}>{busy}</Text></View>}
        {error !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={() => setError('')} style={[s.banner, { backgroundColor: '#3a2820' }]}><Ionicons name="alert-circle-outline" color="#edbd9b" size={19} /><Text style={[s.bannerText, { color: '#edbd9b', flex: 1 }]}>{error}</Text><Ionicons name="close" color="#edbd9b" size={16} /></Pressable>}
        {notice !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice('')} style={s.banner}><Text style={[s.bannerText, { flex: 1 }]}>{notice}</Text><Ionicons name="close" color="#a7eccb" size={16} /></Pressable>}

        {tab === 'sources' ? <ScrollView contentContainerStyle={s.sourceContent} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>YOUR TV, YOUR WAY</Text><Text style={s.heading}>Make yourself at home.</Text><Text style={s.body}>Bring your channels and your guide. Everything stays on this device.</Text>
          <View style={s.card}>
            <View style={s.cardTitle}><Ionicons name="albums-outline" color="#a7eccb" size={22} /><Text style={s.cardHeading}>Channel playlist</Text></View>
            <Text style={s.bodySmall}>Import an M3U file or paste its direct link.</Text>
            <TextInput accessibilityLabel="M3U playlist URL" style={s.input} value={playlistInput} onChangeText={setPlaylistInput} placeholder="https://your-provider/playlist.m3u" placeholderTextColor="#6c827d" autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="none" />
            <View style={s.buttonRow}><Button label="Import URL" icon="link-outline" disabled={!!busy || !playlistInput.trim()} onPress={() => void importPlaylist()} /><Button label="Choose file" icon="document-outline" secondary disabled={!!busy} onPress={() => void importPlaylist(true)} /></View>
            {library.channels.length > 0 && <View style={s.imported}><Text style={s.importedText}>{library.channels.length.toLocaleString()} channels · {library.playlistName}</Text><Text style={s.muted}>Updated {date(library.playlistUpdatedAt)}</Text>{library.playlistUrl && <Button label="Refresh playlist" icon="refresh-outline" secondary disabled={!!busy} onPress={() => void importPlaylist(false, true)} />}</View>}
          </View>

          <View style={s.card}>
            <View style={s.cardTitle}><Ionicons name="calendar-outline" color="#a7eccb" size={22} /><Text style={s.cardHeading}>Program guide · EPG</Text></View>
            <Text style={s.bodySmall}>See what’s on now and what’s coming next. Supports XMLTV .xml and .xml.gz files.</Text>
            <TextInput accessibilityLabel="XMLTV guide URL" style={s.input} value={guideInput} onChangeText={setGuideInput} placeholder={library.guideUrl ? 'A guide URL is saved · paste to replace' : 'https://your-guide/guide.xml'} placeholderTextColor="#6c827d" autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="none" />
            <View style={s.buttonRow}><Button label="Import guide" icon="link-outline" disabled={!!busy || !library.channels.length || (!guideInput.trim() && !library.guideUrl)} onPress={() => void importGuide()} /><Button label="Choose file" icon="document-outline" secondary disabled={!!busy || !library.channels.length} onPress={() => void importGuide(true)} /></View>
            {!library.channels.length && <Text style={s.muted}>Import your channels first so we can match their guide IDs.</Text>}
            {library.guide && <View style={s.imported}><Text style={s.importedText}>{matchedCount} of {library.channels.length} channels matched</Text><Text style={s.muted}>Updated {date(library.guide.importedAt)} · times shown in your phone’s time zone</Text>{library.guideUrl && <Button label="Refresh guide" icon="refresh-outline" secondary disabled={!!busy} onPress={() => void importGuide(false, true)} />}</View>}
            <View style={s.helpBox}><Text style={s.helpTitle}>Using iptv-org on GitHub?</Text><Text style={s.bodySmall}>Its EPG tools generate a guide.xml file. Import that file here, or host it and paste the direct URL. The repo page and .channels.xml setup files aren’t program guides.</Text><Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://github.com/iptv-org/epg')} style={s.textLink}><Text style={s.linkText}>Open iptv-org EPG setup</Text><Ionicons name="open-outline" color="#a7eccb" size={17} /></Pressable></View>
          </View>

          <View style={s.card}><View style={s.cardTitle}><Ionicons name="options-outline" color="#a7eccb" size={22} /><Text style={s.cardHeading}>Playback preference</Text></View><Text style={s.bodySmall}>A larger buffer helps uneven connections. Actual live delay depends on the channel source.</Text>
            <View style={s.profiles}>{(['fast', 'balanced', 'stable'] as BufferProfile[]).map(profile => <Pressable accessibilityRole="radio" accessibilityState={{ checked: library.profile === profile }} key={profile} onPress={() => update(previous => ({ ...previous, profile }))} style={[s.profile, library.profile === profile && s.profileSelected]}><Text style={[s.profileName, library.profile === profile && { color: '#a7eccb' }]}>{profile[0]!.toUpperCase() + profile.slice(1)}</Text><Text style={s.profileDescription}>{profile === 'fast' ? '8s buffer' : profile === 'balanced' ? '20s buffer' : '40s buffer'}</Text></Pressable>)}</View>
          </View>
          <Text style={s.footnote}>No ads from us. No account. No tracking SDKs.{Platform.OS === 'web' ? '\nBrowser preview: feeds may require CORS; native phone playback is the target.' : ''}</Text>
          {library.channels.length > 0 && <Button label="Remove saved library" icon="trash-outline" secondary disabled={!!busy} onPress={removeLibrary} />}
        </ScrollView> : library.channels.length === 0 ? <ScrollView contentContainerStyle={s.welcome}>
          <View style={s.welcomeArt}><View style={s.orbit}><View style={s.orbitInner}><Ionicons name="tv-outline" size={54} color="#a7eccb" /></View></View><View style={s.artLabel}><View style={s.greenDot} /><Text style={s.artLabelText}>JUST PRESS PLAY</Text></View></View>
          <Text style={s.eyebrow}>WELCOME TO STILLWAVE</Text><Text style={s.welcomeHeading}>{'TV without\nthe baggage.'}</Text><Text style={[s.body, { textAlign: 'center', maxWidth: 320 }]}>{'Your channels. A proper live player.\nNothing getting between you and the show.'}</Text>
          <Button label="Add your playlist" icon="add" onPress={() => setTab('sources')} />
          <View style={s.welcomeFeatures}><Text style={s.feature}>◉  Live controls</Text><Text style={s.feature}>☆  Favorites</Text><Text style={s.feature}>▤  Program guide</Text></View>
        </ScrollView> : <View style={s.browse}>
          <View style={s.sectionTitle}><Text style={s.heading}>{tab === 'guide' ? 'What’s on.' : 'Find your channel.'}</Text><Text style={s.count}>{filtered.length.toLocaleString()}</Text></View>
          {tab === 'guide' && <Text style={s.guideHint}>{library.guide ? `${time(now)} · Now and next · tap calendar for schedule` : 'Add an XMLTV guide in Sources to see programs.'}</Text>}
          <View style={s.search}><Ionicons name="search-outline" color="#78928b" size={19} /><TextInput accessibilityLabel="Search channels" value={query} onChangeText={setQuery} placeholder="Search channels or categories" placeholderTextColor="#78928b" style={s.searchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Show favorites only" accessibilityState={{ selected: onlyFavorites }} onPress={() => setOnlyFavorites(value => !value)} style={s.smallIcon}><Ionicons name={onlyFavorites ? 'star' : 'star-outline'} color={onlyFavorites ? '#a7eccb' : '#78928b'} size={21} /></Pressable></View>
          <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.groups}>{groups.map(name => <Pressable accessibilityRole="button" accessibilityState={{ selected: group === name }} key={name} onPress={() => setGroup(name)} style={[s.chip, group === name && s.chipSelected]}><Text style={[s.chipText, group === name && { color: '#a7eccb' }]}>{name}</Text></Pressable>)}</ScrollView></View>
          <FlatList data={filtered} renderItem={renderChannel} keyExtractor={item => item.id} initialNumToRender={14} maxToRenderPerBatch={14} windowSize={7} contentContainerStyle={s.channelList} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={s.empty}>No channels match. Try another search or turn off favorites.</Text>} />
        </View>}

        <SafeAreaView edges={['bottom']} style={s.navSafe}><View style={s.nav}>{([{ id: 'watch', icon: 'tv-outline', label: 'Watch' }, { id: 'guide', icon: 'calendar-outline', label: 'Guide' }, { id: 'sources', icon: 'options-outline', label: 'Sources' }] as const).map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.label} key={item.id} onPress={() => setTab(item.id)} style={s.navItem}><Ionicons name={item.icon} size={22} color={tab === item.id ? '#a7eccb' : '#728d84'} /><Text style={[s.navLabel, tab === item.id && { color: '#a7eccb' }]}>{item.label}</Text>{tab === item.id && <View style={s.navDot} />}</Pressable>)}</View></SafeAreaView>
      </>}
    </View>

    <Modal visible={!!guideChannel} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGuideChannel(undefined)}>
      <SafeAreaView style={s.safe}><View style={s.modalHeader}><View style={{ flex: 1 }}><Text style={s.eyebrow}>{matching ? 'MATCH CHANNEL' : 'PROGRAM GUIDE'}</Text><Text style={s.heading}>{guideChannel?.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close guide" onPress={() => setGuideChannel(undefined)} style={s.smallIcon}><Ionicons name="close" size={26} color="#d7e6e0" /></Pressable></View>
        {matching ? <><TextInput accessibilityLabel="Search guide channels" style={[s.input, { marginHorizontal: 22 }]} value={matchQuery} onChangeText={setMatchQuery} placeholder="Search guide name or XMLTV ID" placeholderTextColor="#78928b" /><Text style={[s.muted, { paddingHorizontal: 22 }]}>{busy || error || 'Choose the guide entry that belongs to this channel.'}</Text><FlatList data={guideMatches} keyExtractor={([id]) => id} renderItem={({ item: [id, names] }) => <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => { if (guideChannel) void matchChannel(guideChannel, id); }} style={s.scheduleItem}><Text style={s.channelName}>{names[0] || id}</Text><Text style={s.muted}>{id}</Text></Pressable>} /></> : <>
          <View style={{ paddingHorizontal: 22, gap: 12, paddingBottom: 15 }}><View style={s.buttonRow}><Button label="Watch channel" icon="play" onPress={() => { if (guideChannel) selectChannel(guideChannel); }} /><Button label="Match guide" icon="link-outline" secondary disabled={!library.guide} onPress={() => { setMatching(true); setMatchQuery(''); }} /></View><Text style={s.muted}>{selectedGuideId ? `Guide ID: ${selectedGuideId}` : 'No matching guide ID. Use Match guide to choose one.'}</Text></View>
          <FlatList data={upcoming} keyExtractor={(item, index) => `${item.start}:${index}`} renderItem={({ item }: { item: Programme }) => <View style={s.scheduleItem}><Text style={s.scheduleTime}>{item.start <= now && item.stop > now ? 'ON NOW · ' : ''}{new Date(item.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {time(item.start)} – {time(item.stop)}</Text><Text style={s.scheduleTitle}>{item.title}</Text>{item.description && <Text style={s.bodySmall}>{item.description}</Text>}</View>} ListEmptyComponent={<Text style={s.empty}>No upcoming programs for this channel. Check the guide’s dates or match its XMLTV ID.</Text>} />
        </>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><AppErrorBoundary><Shell /></AppErrorBoundary></SafeAreaProvider>; }

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#091315' }, frame: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20 }, fullFrame: { maxWidth: undefined, paddingHorizontal: 0 },
  header: { paddingTop: 15, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brand: { fontSize: 27, fontWeight: '700', letterSpacing: -1.2, color: '#ecf5f2' }, tagline: { fontSize: 11, color: '#819c92', marginTop: 5 },
  privateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#133026', padding: 8, borderRadius: 7 }, privateText: { color: '#a7eccb', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 }, greenDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a7eccb' },
  welcome: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 35, gap: 23 }, welcomeArt: { alignItems: 'center', marginBottom: 5 }, orbit: { width: 196, height: 196, borderRadius: 98, borderWidth: 1, borderColor: '#1c3a31', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d201c' }, orbitInner: { width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: '#275441', alignItems: 'center', justifyContent: 'center', backgroundColor: '#112e23' }, artLabel: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: '#173c2e', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, marginTop: -17 }, artLabelText: { fontSize: 9, fontWeight: '700', color: '#a7eccb', letterSpacing: 1.3 },
  eyebrow: { color: '#8baf9f', fontSize: 10, letterSpacing: 1.8, fontWeight: '700' }, welcomeHeading: { fontSize: 43, fontWeight: '600', color: '#ecf5f2', textAlign: 'center', letterSpacing: -1.7, lineHeight: 47 }, heading: { fontSize: 25, fontWeight: '600', color: '#ecf5f2', letterSpacing: -0.8 }, body: { fontSize: 14, lineHeight: 23, color: '#9ab0a8' }, bodySmall: { color: '#9ab0a8', fontSize: 13, lineHeight: 21 }, welcomeFeatures: { flexDirection: 'row', gap: 18, paddingTop: 8 }, feature: { fontSize: 10, color: '#809d90' },
  button: { minHeight: 46, backgroundColor: '#a7eccb', paddingHorizontal: 17, paddingVertical: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondary: { backgroundColor: '#20312e' }, buttonText: { color: '#09241b', fontWeight: '700', fontSize: 12 }, buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  sourceContent: { gap: 17, paddingBottom: 30 }, card: { padding: 18, borderRadius: 18, backgroundColor: '#101f1f', borderWidth: 1, borderColor: '#20332e', gap: 12 }, cardTitle: { flexDirection: 'row', gap: 10, alignItems: 'center' }, cardHeading: { fontSize: 17, color: '#e0eee7', fontWeight: '600' }, input: { minHeight: 49, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: '#2a4039', borderRadius: 10, color: '#e0eee7', fontSize: 12, backgroundColor: '#0b1817' }, imported: { borderTopWidth: 1, borderColor: '#2a4039', paddingTop: 13, gap: 10 }, importedText: { fontSize: 12, color: '#b9d4c7', fontWeight: '600' }, muted: { color: '#819c92', fontSize: 11, lineHeight: 18 }, helpBox: { backgroundColor: '#152b24', borderRadius: 11, padding: 13, gap: 8 }, helpTitle: { color: '#d0e7db', fontSize: 12, fontWeight: '600' }, textLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }, linkText: { color: '#a7eccb', fontSize: 12, fontWeight: '600' }, profiles: { flexDirection: 'row', gap: 7 }, profile: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#2a4039', gap: 5 }, profileSelected: { borderColor: '#77b796', backgroundColor: '#183b2c' }, profileName: { color: '#bfd3ca', fontSize: 12, fontWeight: '600' }, profileDescription: { color: '#819c92', fontSize: 10 }, footnote: { color: '#647e73', fontSize: 11, lineHeight: 19, textAlign: 'center' },
  browse: { flex: 1 }, sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, count: { color: '#8baf9f', fontSize: 12 }, guideHint: { color: '#819c92', fontSize: 11, marginBottom: 14 }, search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, backgroundColor: '#112021', borderRadius: 11, borderWidth: 1, borderColor: '#20332e', marginBottom: 14 }, searchInput: { color: '#d7e6e0', fontSize: 13, flex: 1, paddingVertical: 13, paddingHorizontal: 9 }, groups: { flexDirection: 'row', gap: 7, paddingBottom: 16 }, chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderRadius: 20, backgroundColor: '#122423' }, chipSelected: { backgroundColor: '#214a36' }, chipText: { fontSize: 11, color: '#90aa9e', fontWeight: '500' }, channelList: { paddingBottom: 12 }, channel: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#172c27', paddingVertical: 11 }, channelActive: { backgroundColor: '#11291f', borderRadius: 12 }, channelMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, paddingLeft: 6 }, channelTile: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#192e28', alignItems: 'center', justifyContent: 'center' }, initials: { color: '#8baf9f', fontSize: 13, fontWeight: '600' }, channelText: { flex: 1, gap: 5 }, channelName: { color: '#dfeee6', fontSize: 14, fontWeight: '600' }, programTitle: { fontSize: 12, color: '#91aa9d' }, nextTitle: { fontSize: 10, color: '#6c8a7c' }, smallIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, empty: { color: '#819c92', fontSize: 13, lineHeight: 22, padding: 25, textAlign: 'center' },
  navSafe: { backgroundColor: '#091315', borderTopWidth: 1, borderTopColor: '#20332e' }, nav: { flexDirection: 'row', paddingTop: 13, paddingBottom: 6 }, navItem: { flex: 1, alignItems: 'center', gap: 5, minHeight: 56 }, navLabel: { color: '#728d84', fontSize: 10, fontWeight: '600' }, navDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#a7eccb' }, banner: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: 10, backgroundColor: '#173629', marginBottom: 14, alignItems: 'center' }, bannerText: { color: '#b6d9c5', fontSize: 12, lineHeight: 19 },
  modalHeader: { flexDirection: 'row', gap: 12, padding: 22, alignItems: 'center' }, scheduleItem: { paddingHorizontal: 22, paddingVertical: 19, borderBottomWidth: 1, borderColor: '#20332e', gap: 8 }, scheduleTime: { color: '#8bb79d', fontSize: 11 }, scheduleTitle: { color: '#e0eee7', fontSize: 17, fontWeight: '600' },
});
