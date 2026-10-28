import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { LaunchSplash } from './src/components/LaunchSplash';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EMPTY_LIBRARY, type BufferProfile, type Channel, type GuideSource, type Library, type Programme, type SavedPlaylist } from './src/types';
import { addPlaylist, newPlaylistId, removePlaylist } from './src/core/playlists';
import { MAX_PLAYLIST_BYTES } from './src/core/feedBytes';
import { normalizeFeedUrl, parseM3u } from './src/core/m3u';
import { createGuideMatcher, nowAndNext, parseXmltv } from './src/core/xmltv';
import { assertGuideRefresh, createGuideView, getGuideSources, makeReminder, reminderKey, sourceChannels as channelsForSource, sourceMappings, splitGuideKey, withGuideSources, type ProgramResult } from './src/core/guides';
import { adjacentChannel, previousChannel, rememberChannel } from './src/core/history';
import { downloadGuide } from './src/data/guideFeeds';
import { downloadFeed, pickFeed } from './src/data/feeds';
import { cacheGuideSource, loadGuideSource, loadLibrary, removeGuideCache, saveLibrary } from './src/data/library';
import { dvr } from './src/data/dvr';
import { remindersNative, requestReminderNotifications, syncReminders } from './src/data/reminders';
import { LivePlayer } from './src/components/LivePlayer';
import { Recordings } from './src/components/Recordings';
import { GuideSources } from './src/components/GuideSources';
import { ProgramBrowser } from './src/components/ProgramBrowser';
import { MiniGuide } from './src/components/MiniGuide';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { useAndroidFullscreen } from './src/components/useAndroidFullscreen';
import { isTv } from './src/data/tv';
import { DEFAULT_TV_PLAYLIST, completeTvSetup, installTvDefaults, needsTvGuideUpgrade } from './src/core/tvDefaults';
import { TvShell } from './src/components/tv/TvDvrShell';
import { preferences, startupChannel } from './src/core/preferences';
import { SleepTimerProvider } from './src/components/SleepTimer';

if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync().catch(() => {});
const splashPreview = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('splash') === '1';
const hideNativeSplash = () => { if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => {}); };

type Tab = 'watch' | 'guide' | 'recordings' | 'sources';
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const date = (ms?: number) => ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not imported';

function Button({ label, icon, onPress, secondary = false, disabled = false }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
    {icon && <Ionicons name={icon} size={18} color={secondary ? '#d7e6e0' : '#09241b'} />}<Text style={[s.buttonText, secondary && { color: '#d7e6e0' }]}>{label}</Text>
  </Pressable>;
}

function Shell() {
  const [library, setLibrary] = useState<Library>({ ...EMPTY_LIBRARY });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (loaded) hideNativeSplash(); }, [loaded]);
  const [tab, setTab] = useState<Tab>('watch');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = useMemo(() => library.channels.find(c => c.id === selectedId), [library.channels, selectedId]);
  const setSelected = useCallback((channel?: Channel) => setSelectedId(channel?.id), []);
  const [fullscreen, setFullscreen] = useState(false);
  useAndroidFullscreen(fullscreen, () => { setFullscreen(false); setError('Fullscreen could not rotate the screen. Please try again.'); });
  const [playlistInput, setPlaylistInput] = useState('');
  const [playlistNameInput, setPlaylistNameInput] = useState('');
  const [playlistFilter, setPlaylistFilter] = useState('all');
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const channelList = useRef<FlatList<Channel>>(null);
  const categoryList = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [guideInput, setGuideInput] = useState('');
  const [guideNameInput, setGuideNameInput] = useState('');
  const [guideScope, setGuideScope] = useState('all');
  const [programMode, setProgramMode] = useState(false);
  const [programsSaved, setProgramsSaved] = useState(false);
  const [showMiniGuide, setShowMiniGuide] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [guideChannel, setGuideChannel] = useState<Channel>();
  const [matching, setMatching] = useState(false);
  const [matchQuery, setMatchQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const dirty = useRef(false);
  const busyRef = useRef(false);
  const selectionRequest = useRef(0);
  const startupApplied = useRef(false);
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

  const guideView = useMemo(() => createGuideView(library), [library.guideSources, library.guide, library.guideUrl, library.mappings]);
  const guide = guideView.guide;
  const matcher = guideView.matcher;
  const previous = useMemo(() => previousChannel(library, selectedId), [library.channels, library.recents, selectedId]);
  const previousInLineup = useMemo(() => adjacentChannel(library.channels, selectedId, -1), [library.channels, selectedId]);
  const nextInLineup = useMemo(() => adjacentChannel(library.channels, selectedId, 1), [library.channels, selectedId]);
  const onFirstPlaying = useCallback((id: string) => update(previous => rememberChannel(previous, id)), [update]);
  const favorites = useMemo(() => new Set(library.favorites), [library.favorites]);
  const sourceChannels = useMemo(() => library.channels.filter(c => playlistFilter === 'all' || c.playlistId === playlistFilter), [library.channels, playlistFilter]);
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const channel of sourceChannels) counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sourceChannels]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const recent = new Map(library.recents.map((r, index) => [r.channelId, index]));
    return sourceChannels.filter(c => (!onlyFavorites || favorites.has(c.id)) && (!recentOnly || recent.has(c.id)) && (tab === 'guide' || group === 'All' || c.group === group) && (!search || (/^\d+$/.test(search) ? c.number === String(Number(search)) : `${c.name} ${c.group}`.toLowerCase().includes(search))))
      .sort((a, b) => recentOnly ? recent.get(a.id)! - recent.get(b.id)! : 0);
  }, [sourceChannels, query, group, favorites, onlyFavorites, tab, recentOnly, library.recents]);
  useEffect(() => { channelList.current?.scrollToOffset({ offset: 0, animated: false }); setShowTop(false); }, [tab, group, query, onlyFavorites, playlistFilter, browsing]);
  const playlistLabel = playlistFilter === 'all' ? 'All playlists' : library.playlists.find(p => p.id === playlistFilter)?.name ?? 'All playlists';
  const matchedCount = useMemo(() => library.channels.filter(c => matcher(c, library.mappings)).length, [library.channels, library.mappings, matcher]);
  const guideMatches = useMemo(() => guideChannel ? guideView.choices(guideChannel).filter(item => `${item.id} ${item.sourceName} ${item.names.join(' ')}`.toLowerCase().includes(matchQuery.toLowerCase())) : [], [guideView, guideChannel, matchQuery]);

  const run = async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) { setNotice('Another import or refresh is running. Try again shortly.'); return; }
    busyRef.current = true;
    setBusy(label); setError(''); setNotice('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The import could not finish. Please try again.'); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const setupTvDefaults = () => run('Setting up US channels…', async () => {
    const result = await installTvDefaults(current.current, { download: downloadFeed, downloadGuide, cache: cacheGuideSource, progress: name => setBusy(`Loading ${name}…`), onUpdate: partial => update(() => completeTvSetup(partial, current.current)) });
    const next = completeTvSetup(result.library, current.current);
    update(() => next); await saveLibrary(next);
    setNotice(result.guideError || 'US channels are ready. Your other playlists are kept.');
  });
  useEffect(() => {
    if (isTv && loaded && (!current.current.channels.length || needsTvGuideUpgrade(current.current))) void setupTvDefaults();
  }, [loaded]);
  const importPlaylist = async (fromFile = false, refreshId?: string) => {
    await run('Importing channels…', async () => {
      const source = refreshId ? current.current.playlists.find(p => p.id === refreshId) : undefined;
      if (refreshId && !source) throw new Error('This playlist was removed.');
      const url = fromFile ? undefined : normalizeFeedUrl(source ? source.url || '' : playlistInput);
      const picked = fromFile ? await pickFeed(MAX_PLAYLIST_BYTES) : undefined;
      if (fromFile && !picked) return;
      const playlist = parseM3u(picked?.text ?? await downloadFeed(url!, MAX_PLAYLIST_BYTES), url);
      const name = source?.name || playlistNameInput.trim() || picked?.name || new URL(url!).hostname;
      const metadata: SavedPlaylist = { id: source?.id ?? newPlaylistId(), name, url, updatedAt: Date.now() };
      // An already-cached guide may contain programs for the newly added source.
      const combined = addPlaylist(current.current, playlist, metadata);
      const sources = await Promise.all(getGuideSources(combined).map(async source => {
        const cached = await loadGuideSource(source.id);
        if (!cached) return source;
        return { ...source, guide: await parseXmltv(cached, channelsForSource(source, combined.channels), sourceMappings(source.id, combined.mappings)) };
      }));
      const base = addPlaylist(current.current, playlist, metadata);
      const next = sources.length ? withGuideSources(base, sources) : base;
      update(() => next);
      await saveLibrary(next);
      setPlaylistInput(''); setPlaylistNameInput('');
      if (playlist.guideUrls[0]) setGuideInput(playlist.guideUrls[0]);
      if (playlist.guideUrls[0]) setGuideScope(url ? next.playlists.find(p => p.url === url)?.id ?? metadata.id : metadata.id);
      setNotice(`${name}: ${playlist.channels.length.toLocaleString()} channels ${source ? 'updated' : 'imported'}. Your other playlists are kept.${playlist.guideUrls.length ? ' A guide URL was detected. Import it below.' : ''}${playlist.warnings.length ? ` ${playlist.warnings.join(' ')}` : ''}`);
      setTab('sources');
    });
  };
  const deletePlaylist = (source: SavedPlaylist) => {
    const remove = () => void run('Removing playlist…', async () => {
      const next = removePlaylist(current.current, source.id);
      update(() => next);
      if (selected?.playlistId === source.id) { setSelected(undefined); setFullscreen(false); }
      if (playlistFilter === source.id) setPlaylistFilter('all');
      await saveLibrary(next);
      setNotice(`${source.name} removed. Your other playlists are kept.`);
    });
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${source.name} and its channels? Other playlists will stay.`)) remove(); }
    else Alert.alert('Remove playlist?', `Remove ${source.name} and its channels? Other playlists will stay.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
  };
  useEffect(() => {
    if (selectedId && !selected) { setSelectedId(undefined); setFullscreen(false); }
  }, [selectedId, selected]);
  const importGuide = async (fromFile = false, refreshId?: string) => {
    await run('Importing program guide…', async () => {
      const sources = getGuideSources(current.current);
      const source = refreshId ? sources.find(s => s.id === refreshId) : undefined;
      const playlistIds = source?.playlistIds ?? (guideScope === 'all' ? [] : [guideScope]);
      const url = fromFile ? undefined : normalizeFeedUrl(source?.url || guideInput);
      const picked = fromFile ? await pickFeed() : undefined;
      if (fromFile && !picked) return;
      const snapshot = current.current;
      const existing = source ?? sources.find(s => !!url && s.url === url && JSON.stringify(s.playlistIds) === JSON.stringify(playlistIds));
      const id = existing?.id ?? newPlaylistId().replace('playlist-', 'guide-');
      const result = picked ? { text: picked.text, guide: await parseXmltv(picked.text, channelsForSource({ playlistIds }, snapshot.channels), sourceMappings(id, snapshot.mappings)) } : await downloadGuide(url!, channelsForSource({ playlistIds }, snapshot.channels), sourceMappings(id, snapshot.mappings));
      const parsed = result.guide;
      assertGuideRefresh(existing?.guide, parsed);
      await cacheGuideSource(result.text, id);
      const entry: GuideSource = { id, name: existing?.name || guideNameInput.trim() || picked?.name || new URL(url!).hostname, url, playlistIds, guide: parsed, lastAttemptAt: Date.now(), refreshHours: existing?.refreshHours ?? 12 };
      const nextSources = getGuideSources(current.current);
      const next = withGuideSources(current.current, existing ? nextSources.map(s => s.id === id ? entry : s) : [...nextSources, entry]);
      update(() => next); await saveLibrary(next);
      setGuideInput(''); setGuideNameInput('');
      const count = Object.values(parsed.programmes).reduce((sum, entries) => sum + entries.length, 0);
      setNotice(`${entry.name}: ${count.toLocaleString()} programs loaded. Your other guides are kept.${count ? '' : ' Check guide dates and channel IDs.'}`);
    });
  };
  const matchChannel = async (channel: Channel, guideId: string) => {
    await run('Matching guide…', async () => {
      const snapshot = current.current;
      const mappings = { ...snapshot.mappings, [channel.id]: guideId };
      const sourceId = splitGuideKey(guideId)?.[0];
      const source = getGuideSources(snapshot).find(s => s.id === sourceId);
      if (!source) throw new Error('Choose an available guide source.');
      const text = await loadGuideSource(source.id);
      if (!text) throw new Error('Import the guide again to load this channel’s programs.');
      const result = source.url ? await downloadGuide(source.url, channelsForSource(source, snapshot.channels), sourceMappings(source.id, mappings)) : { text, guide: await parseXmltv(text, channelsForSource(source, snapshot.channels), sourceMappings(source.id, mappings)) };
      const parsed = result.guide;
      await cacheGuideSource(result.text, source.id);
      const next = withGuideSources({ ...current.current, mappings }, getGuideSources(current.current).map(s => s.id === source.id ? { ...s, guide: parsed } : s));
      update(() => next); await saveLibrary(next);
      setMatching(false);
    });
  };
  const editSources = async (change: (sources: GuideSource[]) => GuideSource[]) => run('Saving guide settings…', async () => {
    const next = withGuideSources(current.current, change(getGuideSources(current.current)));
    update(() => next); await saveLibrary(next);
  });
  const deleteGuide = (id: string) => {
    const source = getGuideSources(current.current).find(s => s.id === id);
    const remove = () => void run('Removing guide…', async () => {
      const next = withGuideSources(current.current, getGuideSources(current.current).filter(s => s.id !== id));
      await saveLibrary(next); update(() => next); await removeGuideCache(id);
    });
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${source?.name || 'this guide'}? Your playlists stay.`)) remove(); }
    else Alert.alert('Remove guide?', `Remove ${source?.name || 'this guide'}? Your playlists stay.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
  };
  const assignGuide = async (id: string, scope: string) => run('Assigning guide…', async () => {
    const source = getGuideSources(current.current).find(s => s.id === id);
    if (!source) return;
    const text = await loadGuideSource(id);
    if (!text) throw new Error('Replace or refresh this guide before changing its assignment.');
    const playlistIds = scope === 'all' ? [] : [scope];
    const result = source.url ? await downloadGuide(source.url, channelsForSource({ playlistIds }, current.current.channels), sourceMappings(id, current.current.mappings)) : { text, guide: await parseXmltv(text, channelsForSource({ playlistIds }, current.current.channels), sourceMappings(id, current.current.mappings)) };
    const parsed = result.guide;
    await cacheGuideSource(result.text, id);
    const next = withGuideSources(current.current, getGuideSources(current.current).map(s => s.id === id ? { ...s, playlistIds, guide: parsed } : s));
    update(() => next); await saveLibrary(next);
  });
  const toggleReminder = async (row: ProgramResult) => run('Saving program…', async () => {
    const existing = current.current.reminders.find(r => r.id === row.key);
    if (!existing && current.current.reminders.length >= 100) throw new Error('You have 100 saved programs. Remove a few before adding another.');
    const notify = existing ? false : await requestReminderNotifications();
    const reminder = existing ? undefined : makeReminder(row.channel, row.programme, notify);
    const next = { ...current.current, reminders: existing ? current.current.reminders.filter(r => r.id !== row.key) : [...current.current.reminders, reminder!] };
    await saveLibrary(next); update(() => next);
    await syncReminders(next.reminders);
    setNotice(existing ? 'Program removed from saved reminders.' : notify ? 'Reminder set for about five minutes before the program. Android may delay delivery while idle.' : 'Program saved. Notifications are unavailable or were not allowed; find it in Guide → Saved.');
  });
  useEffect(() => {
    if (!loaded) return;
    void syncReminders(library.reminders).catch(() => setError('Saved programs are kept, but Android could not schedule their notifications. Open the app again to retry.'));
  }, [loaded, library.reminders]);
  useEffect(() => {
    if (!loaded) return;
    const refresh = async () => {
      if (busyRef.current || AppState.currentState !== 'active') return;
      const due = getGuideSources(current.current).filter(s => s.url && s.refreshHours > 0 && Date.now() - Math.max(s.guide.importedAt, s.lastAttemptAt || 0) >= s.refreshHours * 3600_000);
      if (!due.length) return;
      await run('Refreshing program guides…', async () => {
        for (const source of due) {
          let replacement: GuideSource;
          try {
            const result = await downloadGuide(source.url!, channelsForSource(source, current.current.channels), sourceMappings(source.id, current.current.mappings));
            const parsed = result.guide;
            assertGuideRefresh(source.guide, parsed);
            await cacheGuideSource(result.text, source.id);
            replacement = { ...source, guide: parsed, lastAttemptAt: Date.now(), lastError: undefined };
          } catch { replacement = { ...source, lastAttemptAt: Date.now(), lastError: 'The latest refresh failed.' }; }
          const next = withGuideSources(current.current, getGuideSources(current.current).map(s => s.id === source.id ? replacement : s));
          update(() => next); await saveLibrary(next);
        }
      });
    };
    void refresh(); const timer = setInterval(() => void refresh(), 60_000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { clearInterval(timer); app.remove(); };
  }, [loaded]);
  const toggleFavorite = (channel: Channel) => update(previous => ({ ...previous, favorites: previous.favorites.includes(channel.id) ? previous.favorites.filter(id => id !== channel.id) : [...previous.favorites, channel.id] }));
  const removeLibrary = () => {
    const remove = () => void run('Removing saved data…', async () => {
      const cacheIds = getGuideSources(current.current).map(s => s.id);
      const empty = { ...EMPTY_LIBRARY, channels: [], favorites: [], mappings: {} };
      update(() => empty);
      setSelected(undefined); setFullscreen(false); setGuideChannel(undefined);
      setGuideNameInput(''); setGuideScope('all'); setRecentOnly(false); setProgramMode(false); setPlaylistInput(''); setPlaylistNameInput(''); setPlaylistFilter('all'); setBrowsing(false); setGuideInput(''); setGroup('All'); setQuery(''); setOnlyFavorites(false);
      await syncReminders([]);
      await Promise.all(cacheIds.map(removeGuideCache));
      await cacheGuideSource('');
      await saveLibrary(empty);
      setNotice('Saved channels, guide and source addresses removed from this device.');
    });
    if (Platform.OS === 'web') { if (window.confirm('Remove all saved channels, favorites, guide data and source addresses from this browser?')) remove(); }
    else Alert.alert('Remove saved library?', 'This removes saved channels, favorites, guide data and source addresses from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
  };
  const selectChannel = async (channel: Channel): Promise<boolean> => {
    const request = ++selectionRequest.current;
    try {
      const conflict = dvr ? await dvr.tuningConflict(channel.id) : null;
      if (request !== selectionRequest.current) return false;
      const available = current.current.channels.find(c => c.id === channel.id && c.url === channel.url);
      if (!available) { setError('This channel changed. Choose it again from your updated playlist.'); return false; }
      if (conflict) { setError(conflict); if (Platform.OS !== 'web') Alert.alert('Recording is running', conflict); return false; }
      setSelected(channel); if (tab === 'guide') setGroup(channel.group); setTab('watch'); setBrowsing(true); setGuideChannel(undefined); setShowMiniGuide(false);
      if (isTv) setFullscreen(true);
      return true;
    } catch { setError('Could not check the current recording. Try again before changing channels.'); return false; }
  };
  useEffect(() => {
    if (!loaded || startupApplied.current) return;
    startupApplied.current = true;
    const startup = preferences(library.preferences).startup;
    if (startup === 'lastChannel') { const channel = startupChannel(library); if (channel) void selectChannel(channel); }
    else if (!isTv) { setTab('guide'); setOnlyFavorites(startup === 'favorites'); }
  }, [loaded]);
  useEffect(() => {
    if (!loaded || !remindersNative) return;
    const client = remindersNative;
    const consume = () => {
      const id = client.consumeChannel();
      if (!id) return;
      const channel = current.current.channels.find(c => c.id === id);
      if (channel) void selectChannel(channel);
      else setError('The reminder’s channel is no longer in your playlists.');
    };
    consume();
    const event = client.addListener('reminderOpen', consume);
    const app = AppState.addEventListener('change', state => { if (state === 'active') consume(); });
    return () => { event.remove(); app.remove(); };
  }, [loaded]);

  const renderChannel = ({ item: channel }: { item: Channel }) => {
    const id = matcher(channel, library.mappings);
    const programs = id ? guide?.programmes[id] : undefined;
    const schedule = nowAndNext(programs, now);
    const activeChannel = selected?.id === channel.id;
    return <View style={[s.channel, activeChannel && s.channelActive]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Watch ${channel.name}`} onPress={() => selectChannel(channel)} style={s.channelMain}>
        <View style={[s.channelTile, activeChannel && { backgroundColor: '#1e493a' }]}>{activeChannel ? <Ionicons name="volume-high-outline" color="#a7eccb" size={22} /> : <Text style={s.initials}>{channel.name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase()}</Text>}</View>
        <View style={s.channelText}><Text style={s.channelName} numberOfLines={1}>{channel.name}</Text>
          <Text style={s.programTitle} numberOfLines={1}>{schedule.now?.title || (guide ? id ? 'No program on now' : 'Guide not matched' : channel.group)}</Text>
          {tab === 'guide' && <Text style={s.nextTitle} numberOfLines={1}>{schedule.next ? `${time(schedule.next.start)}  ${schedule.next.title}` : 'No upcoming program available'}</Text>}
        </View>
      </Pressable>
      {tab === 'guide' ? <Pressable accessibilityRole="button" accessibilityLabel={`Schedule for ${channel.name}`} onPress={() => { setGuideChannel(channel); setMatching(false); }} style={s.smallIcon}><Ionicons name="calendar-outline" size={19} color="#a2b6b1" /></Pressable>
        : <Pressable accessibilityRole="button" accessibilityLabel={`${favorites.has(channel.id) ? 'Remove' : 'Add'} ${channel.name} ${favorites.has(channel.id) ? 'from' : 'to'} favorites`} onPress={() => toggleFavorite(channel)} style={s.smallIcon}><Ionicons name={favorites.has(channel.id) ? 'star' : 'star-outline'} size={20} color={favorites.has(channel.id) ? '#a7eccb' : '#78928b'} /></Pressable>}
    </View>;
  };

  const renderSchedule = ({ item: channel }: { item: Channel }) => {
    const id = matcher(channel, library.mappings);
    const programmes = id ? guide?.programmes[id] ?? [] : [];
    const schedule = programmes.filter(p => p.stop > now).slice(0, 4);
    return <View style={s.guideCard}>
      <View style={s.guideCardHeader}><View style={{ flex: 1, gap: 4 }}><Text style={s.channelName}>{channel.name}</Text><Text style={s.muted}>{channel.group}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Watch ${channel.name}`} onPress={() => selectChannel(channel)} style={s.smallIcon}><Ionicons name="play-circle-outline" size={27} color="#a7eccb" /></Pressable></View>
      {schedule.map((programme, index) => {
        const onNow = programme.start <= now && programme.stop > now;
        const progress = Math.max(0, Math.min(1, (now - programme.start) / (programme.stop - programme.start)));
        return <Pressable accessibilityRole="button" accessibilityLabel={`${programme.title}, ${channel.name}, ${onNow ? 'on now' : time(programme.start)}`} key={`${programme.start}:${index}`} onPress={() => { setGuideChannel(channel); setMatching(false); }} style={[s.guideProgramme, onNow && s.guideOnNow]}>
          <View style={s.guideTime}><Text style={[s.muted, onNow && { color: '#a7eccb' }]}>{onNow ? 'ON NOW' : new Date(programme.start).toDateString() !== new Date(now).toDateString() ? new Date(programme.start).toLocaleDateString([], { weekday: 'short' }) : index === (schedule[0] && schedule[0].start <= now ? 1 : 0) ? 'UP NEXT' : 'LATER'}</Text><Text style={s.programTitle}>{time(programme.start)}</Text></View>
          <View style={{ flex: 1, gap: 6 }}><Text style={s.channelName} numberOfLines={2}>{programme.title}</Text><Text style={s.muted}>{time(programme.start)} – {time(programme.stop)}</Text>{onNow && <View style={s.progressTrack}><View style={[s.progressFill, { width: `${progress * 100}%` }]} /></View>}</View><Ionicons name="chevron-forward" size={16} color="#6c8a7c" />
        </Pressable>;
      })}
      {!schedule.length && <Text style={[s.muted, { paddingVertical: 12 }]}>{!guide ? 'Import an XMLTV guide in Sources to see the schedule.' : !id ? 'No guide match for this channel.' : 'No upcoming programs in this guide.'}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Schedule for ${channel.name}`} onPress={() => { setGuideChannel(channel); setMatching(false); }} style={s.textLink}><Text style={s.linkText}>{id ? 'Full schedule' : 'Match guide'}</Text><Ionicons name="arrow-forward" color="#a7eccb" size={16} /></Pressable>
    </View>;
  };

  const selectedGuideId = guideChannel ? matcher(guideChannel, library.mappings) : undefined;
  const upcoming = (selectedGuideId ? guide?.programmes[selectedGuideId] ?? [] : []).filter(p => p.stop > now).slice(0, 100);
  const showPlayer = selected;

  if (!loaded) return <LaunchSplash onReady={hideNativeSplash} />;
  if (isTv) return <TvShell library={library} selected={selected} loaded={loaded} busy={busy} error={error} notice={notice}
    onWatch={selectChannel} onClose={() => { selectionRequest.current++; setSelected(undefined); setFullscreen(false); }} onFirstPlaying={onFirstPlaying}
    onFavorite={toggleFavorite} onHiddenChannels={hiddenChannels => update(previous => ({ ...previous, hiddenChannels }))}
    onPreferences={preferences => update(previous => ({ ...previous, preferences }))} onChannelOrder={channelOrder => update(previous => ({ ...previous, channelOrder }))}
    onDefaults={() => void setupTvDefaults()} onRefreshPlaylist={id => void importPlaylist(false, id)} onRefreshGuide={id => void importGuide(false, id)} />;
  return <SafeAreaView style={s.safe} edges={fullscreen ? [] : ['top', 'left', 'right']}>
    <StatusBar style="light" hidden={fullscreen} />
    <View style={[s.frame, fullscreen && s.fullFrame]}>
      {!fullscreen && <View style={s.header}>
        <View><View style={s.brandRow}><Ionicons name="radio" size={21} color="#a7eccb" /><Text style={s.brand}>stillwave<Text style={{ color: '#a7eccb' }}>.</Text></Text></View><Text style={s.tagline}>A little less noise. A lot more TV.</Text></View>
      </View>}

      {showPlayer && <LivePlayer key={`${selected.id}:${library.profile}:${library.playlists.find(p => p.id === selected.playlistId)?.updatedAt ?? 0}`} channel={selected} programme={nowAndNext(guide?.programmes[matcher(selected, library.mappings) || ''], now).now} profile={library.profile} fullscreen={fullscreen} onFullscreenChange={setFullscreen} onFirstPlaying={onFirstPlaying} onOpenGuide={() => setShowMiniGuide(true)} previousChannelName={previous?.name} onPreviousChannel={previous ? () => void selectChannel(previous) : undefined} onPreviousInLineup={previousInLineup ? () => void selectChannel(previousInLineup) : undefined} onNextChannel={nextInLineup ? () => void selectChannel(nextInLineup) : undefined} onClose={() => { selectionRequest.current++; setSelected(undefined); setFullscreen(false); setShowMiniGuide(false); }} />}

      {!fullscreen && <>
        {busy !== '' && <View style={s.banner}><ActivityIndicator size="small" color="#a7eccb" /><Text style={s.bannerText}>{busy}</Text></View>}
        {error !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={() => setError('')} style={[s.banner, { backgroundColor: '#3a2820' }]}><Ionicons name="alert-circle-outline" color="#edbd9b" size={19} /><Text style={[s.bannerText, { color: '#edbd9b', flex: 1 }]}>{error}</Text><Ionicons name="close" color="#edbd9b" size={16} /></Pressable>}
        {notice !== '' && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setNotice('')} style={s.banner}><Text style={[s.bannerText, { flex: 1 }]}>{notice}</Text><Ionicons name="close" color="#a7eccb" size={16} /></Pressable>}

        {tab === 'recordings' ? <Recordings /> : tab === 'sources' ? <ScrollView contentContainerStyle={s.sourceContent} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>YOUR TV, YOUR WAY</Text><Text style={s.heading}>Make yourself at home.</Text><Text style={s.body}>Bring your channels and your guide. Everything stays on this device.</Text>
          <View style={s.card}>
            <View style={s.cardTitle}><Ionicons name="albums-outline" color="#a7eccb" size={22} /><Text style={s.cardHeading}>Your playlists</Text></View>
            <Text style={s.bodySmall}>Add an M3U file or direct link. Each playlist stays in your library.</Text>
            <TextInput accessibilityLabel="Playlist name" style={s.input} value={playlistNameInput} onChangeText={setPlaylistNameInput} placeholder="Playlist name (optional)" placeholderTextColor="#6c827d" />
            <TextInput accessibilityLabel="M3U playlist URL" style={s.input} value={playlistInput} onChangeText={setPlaylistInput} placeholder="https://your-provider/playlist.m3u" placeholderTextColor="#6c827d" autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="none" />
            <View style={s.buttonRow}><Button label="Import URL" icon="link-outline" disabled={!!busy || !playlistInput.trim()} onPress={() => void importPlaylist()} /><Button label="Choose file" icon="document-outline" secondary disabled={!!busy} onPress={() => void importPlaylist(true)} /></View>
            {library.playlists.map(source => <View style={s.imported} key={source.id}><Text style={s.importedText}>{source.name}</Text><Text style={s.muted}>{library.channels.filter(c => c.playlistId === source.id).length.toLocaleString()} channels · Updated {date(source.updatedAt)}</Text><View style={s.buttonRow}><Button label={source.url ? `Refresh ${source.name}` : `Replace ${source.name}`} icon="refresh-outline" secondary disabled={!!busy} onPress={() => void importPlaylist(!source.url, source.id)} /><Button label={`Remove ${source.name}`} icon="trash-outline" secondary disabled={!!busy} onPress={() => deletePlaylist(source)} /></View></View>)}
          </View>

          <GuideSources sources={guideView.sources} playlists={library.playlists} input={guideInput} onInput={setGuideInput} name={guideNameInput} onName={setGuideNameInput} scope={guideScope} onScope={setGuideScope} busy={!!busy} onImport={(file, id) => void importGuide(file, id)} onRemove={deleteGuide} onAssign={(id, scope) => void assignGuide(id, scope)} onMove={id => void editSources(sources => { const next = [...sources]; const index = next.findIndex(s => s.id === id); if (index > 0) [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })} onRefreshHours={(id, hours) => void editSources(sources => sources.map(s => s.id === id ? { ...s, refreshHours: hours } : s))} />
          {!!guide && <Text style={s.muted}>{matchedCount} of {library.channels.length} channels matched · times shown in your phone’s time zone</Text>}

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
        {tab === 'guide' && programMode ? <ProgramBrowser key={programsSaved ? 'saved' : 'search'} channels={sourceChannels} view={guideView} reminders={library.reminders} favorites={favorites} now={now} initiallySaved={programsSaved} onWatch={channel => void selectChannel(channel)} onReminder={row => void toggleReminder(row)} onChannels={() => setProgramMode(false)} sourceLabel={playlistLabel} onChooseSource={() => setShowPlaylistPicker(true)} /> : tab === 'watch' && !browsing ? <ScrollView ref={categoryList} onScroll={event => setShowTop(event.nativeEvent.contentOffset.y > 220)} scrollEventThrottle={100} contentContainerStyle={s.categoryContent} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>SETTLE INTO SOMETHING GOOD</Text><Text style={s.heading}>What are you watching?</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose playlists" onPress={() => setShowPlaylistPicker(true)} style={s.sourcePicker}><Ionicons name="albums-outline" color="#a7eccb" size={17} /><Text numberOfLines={1} style={s.linkText}>{playlistLabel}</Text><Ionicons name="chevron-down" size={16} color="#a7eccb" /></Pressable>
          <View style={s.search}><Ionicons name="search-outline" color="#78928b" size={19} /><TextInput accessibilityLabel="Search categories" value={categorySearch} onChangeText={setCategorySearch} placeholder="Find a category" placeholderTextColor="#78928b" style={s.searchInput} /></View>
          <View style={s.categoryGrid}>
            {[{ name: 'All channels', count: sourceChannels.length, kind: 'all' }, { name: 'Favorites', count: sourceChannels.filter(c => favorites.has(c.id)).length, kind: 'favorites' }, { name: 'Recent', count: sourceChannels.filter(c => library.recents.some(r => r.channelId === c.id)).length, kind: 'recent' }, ...groups.map(item => ({ ...item, kind: 'category' }))].filter(item => item.name.toLowerCase().includes(categorySearch.toLowerCase())).map(item => <Pressable accessibilityRole="button" accessibilityLabel={`Browse ${item.kind === 'all' ? 'all channels' : item.name}`} key={`${item.kind}:${item.name}`} onPress={() => { setGroup(item.kind === 'category' ? item.name : 'All'); setOnlyFavorites(item.kind === 'favorites'); setRecentOnly(item.kind === 'recent'); setQuery(''); setBrowsing(true); }} style={[s.categoryTile, item.kind !== 'category' && s.categorySpecial]}><Ionicons name={item.kind === 'all' ? 'grid-outline' : item.kind === 'favorites' ? 'star-outline' : item.kind === 'recent' ? 'time-outline' : 'tv-outline'} size={24} color="#a7eccb" /><Text style={s.categoryName} numberOfLines={2}>{item.name}</Text><Text style={s.muted}>{item.count.toLocaleString()} channels</Text></Pressable>)}
          </View>
          {!!categorySearch && !groups.some(item => item.name.toLowerCase().includes(categorySearch.toLowerCase())) && <Text style={s.muted}>Clear the search to see all categories.</Text>}
        </ScrollView> : <FlatList ref={channelList} style={s.browse} data={filtered} renderItem={tab === 'guide' ? renderSchedule : renderChannel} keyExtractor={item => item.id} initialNumToRender={tab === 'guide' ? 5 : 14} maxToRenderPerBatch={10} windowSize={7} onScroll={event => setShowTop(event.nativeEvent.contentOffset.y > 220)} scrollEventThrottle={100} contentContainerStyle={s.channelList} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ListHeaderComponent={<View>
          {tab === 'watch' && <Pressable accessibilityRole="button" accessibilityLabel="Back to categories" onPress={() => { setBrowsing(false); setCategorySearch(''); }} style={s.textLink}><Ionicons name="arrow-back" color="#a7eccb" size={17} /><Text style={s.linkText}>Categories</Text></Pressable>}
          <View style={s.sectionTitle}><Text style={s.heading}>{tab === 'guide' ? 'Your TV schedule.' : recentOnly ? 'Recently watched.' : onlyFavorites ? 'Your favorites.' : group === 'All' ? 'All channels.' : group}</Text><Text style={s.count}>{filtered.length.toLocaleString()}</Text></View>
          {tab === 'guide' && <><Text style={s.guideHint}>{guide ? `${time(now)} · On now, up next, and later` : 'Import an XMLTV guide in Sources to see the schedule.'}</Text><View style={[s.buttonRow, { marginBottom: 14 }]}><Button label="Search shows & teams" icon="search-outline" secondary onPress={() => { setProgramsSaved(false); setProgramMode(true); }} /><Button label={`Saved programs (${library.reminders.length})`} icon="notifications-outline" secondary onPress={() => { setProgramsSaved(true); setProgramMode(true); }} /></View></>}
          <View style={s.search}><Ionicons name="search-outline" color="#78928b" size={19} /><TextInput accessibilityLabel="Search channels" value={query} onChangeText={setQuery} placeholder="Search channels or categories" placeholderTextColor="#78928b" style={s.searchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Show favorites only" accessibilityState={{ selected: onlyFavorites }} onPress={() => setOnlyFavorites(value => !value)} style={s.smallIcon}><Ionicons name={onlyFavorites ? 'star' : 'star-outline'} color={onlyFavorites ? '#a7eccb' : '#78928b'} size={21} /></Pressable></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose playlists" onPress={() => setShowPlaylistPicker(true)} style={s.sourcePicker}><Ionicons name="albums-outline" color="#a7eccb" size={17} /><Text numberOfLines={1} style={s.linkText}>{playlistLabel}</Text><Ionicons name="chevron-down" size={16} color="#a7eccb" /></Pressable>
        </View>} ListEmptyComponent={<Text style={s.empty}>No channels match. Try another search or turn off favorites.</Text>} />}
          {showTop && !(tab === 'guide' && programMode) && <Pressable accessibilityRole="button" accessibilityLabel="Scroll to top" onPress={() => { if (tab === 'watch' && !browsing) categoryList.current?.scrollTo({ y: 0, animated: false }); else channelList.current?.scrollToOffset({ offset: 0, animated: false }); setShowTop(false); }} style={s.toTop}><Ionicons name="arrow-up" color="#09241b" size={22} /></Pressable>}
        </View>}

        <SafeAreaView edges={['bottom']} style={s.navSafe}><View style={s.nav}>{([{ id: 'watch', icon: 'tv-outline', label: 'Watch' }, { id: 'guide', icon: 'calendar-outline', label: 'Guide' }, { id: 'recordings', icon: 'film-outline', label: 'Recordings' }, { id: 'sources', icon: 'options-outline', label: 'Sources' }] as const).map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.label} key={item.id} onPress={() => { if (item.id === 'recordings') { selectionRequest.current++; setSelected(undefined); } if (item.id === 'guide') setRecentOnly(false); setTab(item.id); if (item.id === 'watch') setBrowsing(false); }} style={s.navItem}><Ionicons name={item.icon} size={22} color={tab === item.id ? '#a7eccb' : '#728d84'} /><Text style={[s.navLabel, tab === item.id && { color: '#a7eccb' }]}>{item.label}</Text>{tab === item.id && <View style={s.navDot} />}</Pressable>)}</View></SafeAreaView>
      </>}
    </View>

    {showMiniGuide && selected && <MiniGuide library={library} view={guideView} selectedId={selected.id} fullscreen={fullscreen} previous={previous} onSelect={selectChannel} onClose={() => setShowMiniGuide(false)} />}
    <Modal visible={showPlaylistPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPlaylistPicker(false)}><SafeAreaView style={s.safe}><View style={s.modalHeader}><Text style={[s.heading, { flex: 1 }]}>Browse playlists</Text><Pressable accessibilityRole="button" accessibilityLabel="Close playlist picker" onPress={() => setShowPlaylistPicker(false)} style={s.smallIcon}><Ionicons name="close" size={25} color="#d7e6e0" /></Pressable></View><FlatList data={[{ id: 'all', name: 'All playlists' }, ...library.playlists]} keyExtractor={item => item.id} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Use ${item.name}`} accessibilityState={{ selected: playlistFilter === item.id }} onPress={() => { setPlaylistFilter(item.id); setGroup('All'); setShowPlaylistPicker(false); }} style={s.scheduleItem}><View style={s.guideCardHeader}><Text style={[s.channelName, { flex: 1 }]}>{item.name}</Text>{playlistFilter === item.id && <Ionicons name="checkmark" color="#a7eccb" size={22} />}</View><Text style={s.muted}>{library.channels.filter(c => item.id === 'all' || c.playlistId === item.id).length.toLocaleString()} channels</Text></Pressable>} /></SafeAreaView></Modal>

    <Modal visible={!!guideChannel} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setGuideChannel(undefined)}>
      <SafeAreaView style={s.safe}><View style={s.modalHeader}><View style={{ flex: 1 }}><Text style={s.eyebrow}>{matching ? 'MATCH CHANNEL' : 'PROGRAM GUIDE'}</Text><Text style={s.heading}>{guideChannel?.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close guide" onPress={() => setGuideChannel(undefined)} style={s.smallIcon}><Ionicons name="close" size={26} color="#d7e6e0" /></Pressable></View>
        {matching ? <><TextInput accessibilityLabel="Search guide channels" style={[s.input, { marginHorizontal: 22 }]} value={matchQuery} onChangeText={setMatchQuery} placeholder="Search guide name or XMLTV ID" placeholderTextColor="#78928b" /><Text style={[s.muted, { paddingHorizontal: 22 }]}>{busy || error || 'Choose the guide entry that belongs to this channel.'}</Text><FlatList data={guideMatches} keyExtractor={item => item.id} renderItem={({ item: { id, names, sourceName } }) => <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => { if (guideChannel) void matchChannel(guideChannel, id); }} style={s.scheduleItem}><Text style={s.channelName}>{names[0] || id}</Text><Text style={s.muted}>{sourceName} · {splitGuideKey(id)?.[1] || id}</Text></Pressable>} /></> : <>
          <View style={{ paddingHorizontal: 22, gap: 12, paddingBottom: 15 }}><View style={s.buttonRow}><Button label="Watch channel" icon="play" onPress={() => { if (guideChannel) selectChannel(guideChannel); }} /><Button label="Match guide" icon="link-outline" secondary disabled={!guide} onPress={() => { setMatching(true); setMatchQuery(''); }} /></View><Text style={s.muted}>{selectedGuideId ? `Guide ID: ${selectedGuideId}` : 'No matching guide ID. Use Match guide to choose one.'}</Text></View>
          <FlatList data={upcoming} keyExtractor={(item, index) => `${item.start}:${index}`} renderItem={({ item }: { item: Programme }) => { const key = guideChannel ? reminderKey(guideChannel.id, item) : ''; const saved = library.reminders.find(r => r.id === key); return <View style={s.scheduleItem}><Text style={s.scheduleTime}>{item.start <= now && item.stop > now ? 'ON NOW · ' : ''}{new Date(item.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {time(item.start)} – {time(item.stop)}</Text><Text style={s.scheduleTitle}>{item.title}</Text>{item.description && <Text style={s.bodySmall}>{item.description}</Text>}{guideChannel && (saved || item.start > now) && <Pressable accessibilityRole="button" accessibilityLabel={`${saved ? 'Remove reminder for' : 'Remind me about'} ${item.title} on ${guideChannel.name}`} disabled={!!busy} onPress={() => void toggleReminder({ channel: guideChannel, programme: item, key })} style={[s.chip, { alignSelf: 'flex-start' }]}><Text style={s.linkText}>{saved ? saved.notify ? '✓ Reminder set' : '✓ Saved only' : 'Remind me'}</Text></Pressable>}</View>; }} ListEmptyComponent={<Text style={s.empty}>No upcoming programs for this channel. Check the guide’s dates or match its XMLTV ID.</Text>} />
        </>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><AppErrorBoundary><SleepTimerProvider>{splashPreview ? <LaunchSplash /> : <Shell />}</SleepTimerProvider></AppErrorBoundary></SafeAreaProvider>; }

const s = StyleSheet.create({
  fullFrame: { maxWidth: undefined, paddingHorizontal: 0 },
  categoryContent: { gap: 14, paddingBottom: 80 }, categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, categoryTile: { width: '48%', flexGrow: 1, maxWidth: '50%', minHeight: 132, borderRadius: 16, padding: 17, gap: 12, backgroundColor: '#10231f', borderWidth: 1, borderColor: '#203c31' }, categorySpecial: { backgroundColor: '#183b2c', borderColor: '#315c44' }, categoryName: { color: '#e0eee7', fontSize: 16, fontWeight: '600' }, sourcePicker: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, marginBottom: 8, alignSelf: 'flex-start', maxWidth: '100%' }, toTop: { position: 'absolute', right: 6, bottom: 18, width: 48, height: 48, borderRadius: 24, backgroundColor: '#a7eccb', alignItems: 'center', justifyContent: 'center', elevation: 7, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  guideCard: { padding: 15, backgroundColor: '#10211e', borderWidth: 1, borderColor: '#20382d', borderRadius: 16, marginBottom: 14 }, guideCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, guideProgramme: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#20382d' }, guideOnNow: { backgroundColor: '#153326', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10, marginTop: 8 }, guideTime: { width: 65, gap: 6 }, progressTrack: { height: 3, backgroundColor: '#284638', borderRadius: 2, overflow: 'hidden' }, progressFill: { height: 3, backgroundColor: '#a7eccb' },
  safe: { flex: 1, backgroundColor: '#091315' }, frame: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 20 },
  header: { paddingTop: 15, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brand: { fontSize: 27, fontWeight: '700', letterSpacing: -1.2, color: '#ecf5f2' }, tagline: { fontSize: 11, color: '#819c92', marginTop: 5 },
  greenDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#a7eccb' },
  welcome: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 35, gap: 23 }, welcomeArt: { alignItems: 'center', marginBottom: 5 }, orbit: { width: 196, height: 196, borderRadius: 98, borderWidth: 1, borderColor: '#1c3a31', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d201c' }, orbitInner: { width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: '#275441', alignItems: 'center', justifyContent: 'center', backgroundColor: '#112e23' }, artLabel: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: '#173c2e', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, marginTop: -17 }, artLabelText: { fontSize: 9, fontWeight: '700', color: '#a7eccb', letterSpacing: 1.3 },
  eyebrow: { color: '#8baf9f', fontSize: 10, letterSpacing: 1.8, fontWeight: '700' }, welcomeHeading: { fontSize: 43, fontWeight: '600', color: '#ecf5f2', textAlign: 'center', letterSpacing: -1.7, lineHeight: 47 }, heading: { fontSize: 25, fontWeight: '600', color: '#ecf5f2', letterSpacing: -0.8 }, body: { fontSize: 14, lineHeight: 23, color: '#9ab0a8' }, bodySmall: { color: '#9ab0a8', fontSize: 13, lineHeight: 21 }, welcomeFeatures: { flexDirection: 'row', gap: 18, paddingTop: 8 }, feature: { fontSize: 10, color: '#809d90' },
  button: { minHeight: 46, backgroundColor: '#a7eccb', paddingHorizontal: 17, paddingVertical: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondary: { backgroundColor: '#20312e' }, buttonText: { color: '#09241b', fontWeight: '700', fontSize: 12 }, buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  sourceContent: { gap: 17, paddingBottom: 30 }, card: { padding: 18, borderRadius: 18, backgroundColor: '#101f1f', borderWidth: 1, borderColor: '#20332e', gap: 12 }, cardTitle: { flexDirection: 'row', gap: 10, alignItems: 'center' }, cardHeading: { fontSize: 17, color: '#e0eee7', fontWeight: '600' }, input: { minHeight: 49, paddingHorizontal: 13, paddingVertical: 12, borderWidth: 1, borderColor: '#2a4039', borderRadius: 10, color: '#e0eee7', fontSize: 12, backgroundColor: '#0b1817' }, imported: { borderTopWidth: 1, borderColor: '#2a4039', paddingTop: 13, gap: 10 }, importedText: { fontSize: 12, color: '#b9d4c7', fontWeight: '600' }, muted: { color: '#819c92', fontSize: 11, lineHeight: 18 }, helpBox: { backgroundColor: '#152b24', borderRadius: 11, padding: 13, gap: 8 }, helpTitle: { color: '#d0e7db', fontSize: 12, fontWeight: '600' }, textLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }, linkText: { color: '#a7eccb', fontSize: 12, fontWeight: '600' }, profiles: { flexDirection: 'row', gap: 7 }, profile: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#2a4039', gap: 5 }, profileSelected: { borderColor: '#77b796', backgroundColor: '#183b2c' }, profileName: { color: '#bfd3ca', fontSize: 12, fontWeight: '600' }, profileDescription: { color: '#819c92', fontSize: 10 }, footnote: { color: '#647e73', fontSize: 11, lineHeight: 19, textAlign: 'center' },
  browse: { flex: 1 }, sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, count: { color: '#8baf9f', fontSize: 12 }, guideHint: { color: '#819c92', fontSize: 11, marginBottom: 14 }, search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, backgroundColor: '#112021', borderRadius: 11, borderWidth: 1, borderColor: '#20332e', marginBottom: 14 }, searchInput: { color: '#d7e6e0', fontSize: 13, flex: 1, paddingVertical: 13, paddingHorizontal: 9 }, groups: { flexDirection: 'row', gap: 7, paddingBottom: 16 }, chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderRadius: 20, backgroundColor: '#122423' }, chipSelected: { backgroundColor: '#214a36' }, chipText: { fontSize: 11, color: '#90aa9e', fontWeight: '500' }, channelList: { paddingBottom: 12 }, channel: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#172c27', paddingVertical: 11 }, channelActive: { backgroundColor: '#11291f', borderRadius: 12 }, channelMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 13, paddingLeft: 6 }, channelTile: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#192e28', alignItems: 'center', justifyContent: 'center' }, initials: { color: '#8baf9f', fontSize: 13, fontWeight: '600' }, channelText: { flex: 1, gap: 5 }, channelName: { color: '#dfeee6', fontSize: 14, fontWeight: '600' }, programTitle: { fontSize: 12, color: '#91aa9d' }, nextTitle: { fontSize: 10, color: '#6c8a7c' }, smallIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, empty: { color: '#819c92', fontSize: 13, lineHeight: 22, padding: 25, textAlign: 'center' },
  navSafe: { backgroundColor: '#091315', borderTopWidth: 1, borderTopColor: '#20332e' }, nav: { flexDirection: 'row', paddingTop: 13, paddingBottom: 6 }, navItem: { flex: 1, alignItems: 'center', gap: 5, minHeight: 56 }, navLabel: { color: '#728d84', fontSize: 10, fontWeight: '600' }, navDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#a7eccb' }, banner: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: 10, backgroundColor: '#173629', marginBottom: 14, alignItems: 'center' }, bannerText: { color: '#b6d9c5', fontSize: 12, lineHeight: 19 },
  modalHeader: { flexDirection: 'row', gap: 12, padding: 22, alignItems: 'center' }, scheduleItem: { paddingHorizontal: 22, paddingVertical: 19, borderBottomWidth: 1, borderColor: '#20332e', gap: 8 }, scheduleTime: { color: '#8bb79d', fontSize: 11 }, scheduleTitle: { color: '#e0eee7', fontSize: 17, fontWeight: '600' },
});
