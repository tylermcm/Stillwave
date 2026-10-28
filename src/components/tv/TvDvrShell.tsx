import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Channel, Library } from '../../types';
import { createGuideView, guideCoverage } from '../../core/guides';
import { guideProgrammeKey, guideWindow, moveGuide, programmeAt, type TvDashboardState, type TvDvrTab, type TvGuideCursor } from '../../core/tvGuide';
import { recordingConflict, recordingMatchesProgramme, seriesEpisodes, seriesTitle, tvDvrItems } from '../../core/tvDvr';
import type { Recording } from '../../core/dvr';
import { adjacentChannel, previousChannel } from '../../core/history';
import { nowAndNext } from '../../core/xmltv';
import { dvr } from '../../data/dvr';
import { recordingPlanner, type RecordingPlan, type SeriesRule } from '../../data/recordingPlanner';
import { TvKeysSuspended, tvNative, usesTvPlayer, useTvKeys } from '../../data/tv';
import { LivePlayer } from '../LivePlayer';
import { TvRecordingPlayer } from './TvRecordingPlayer';
import { TvDashboard, DVR_COLORS } from './TvDashboard';
import { TvButton } from './TvUi';
import { browseChannelRows, channelCategories, CHANNEL_BROWSE_MODES, comparePreferredChannels, filterTvRows, isChannelHidden, prioritizeGuideRows, toggleHiddenChannel, type ChannelBrowseMode } from '../../core/channelBrowsing';
import { ChannelNumberPad } from './ChannelNumberPad';
import { TvChannelSearch } from './TvChannelSearch';
import { checkAppRelease, installAppRelease } from '../../data/appUpdates';
import type { AppRelease } from '../../core/appUpdates';

type Props = {
  library: Library; selected?: Channel; loaded: boolean; busy: string; error: string; notice: string;
  onWatch: (channel: Channel) => Promise<boolean>; onClose: () => void; onFirstPlaying: (id: string) => void;
  onFavorite: (channel: Channel) => void; onDefaults: () => void; onRefreshPlaylist: (id: string) => void; onRefreshGuide: (id: string) => void;
  onHiddenChannels: (hidden: string[]) => void;
};
export function TvShell(props: Props) {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<'guide' | 'dvr'>('guide');
  const [now, setNow] = useState(Date.now());
  const [cursor, setCursor] = useState<TvGuideCursor>(() => ({ channel: 0, programme: 0, rowTop: 0, windowStart: Math.floor(Date.now() / 1_800_000) * 1_800_000 }));
  const [focus, setFocus] = useState<TvDashboardState['focus']>({ zone: 'grid', index: 0 });
  const [dvrTab, setDvrTab] = useState<TvDvrTab>('recordings');
  const [itemIndex, setItemIndex] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [plans, setPlans] = useState<RecordingPlan[]>([]);
  const [rules, setRules] = useState<SeriesRule[]>([]);
  const [storage, setStorage] = useState<{ totalBytes: number; freeBytes: number }>();
  const [toast, setToast] = useState('');
  const [watching, setWatching] = useState<Recording & { uri: string }>();
  const [menu, setMenu] = useState(false);
  const [menuIndex, setMenuIndex] = useState(0);
  const [browseMode, setBrowseMode] = useState<ChannelBrowseMode>('all');
  const [browseMenu, setBrowseMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [release, setRelease] = useState<AppRelease>();
  const [updateBusy, setUpdateBusy] = useState(false);
  const updateInFlight = useRef(false), lastUpdateCheck = useRef(0);
  const [numberSearch, setNumberSearch] = useState<{ initial: string }>();
  const menuList = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const busy = useRef(false);
  const initialized = useRef(false);
  const deletePending = useRef<{ id: string; at: number } | undefined>(undefined);
  const view = useMemo(() => createGuideView(props.library), [props.library.guideSources, props.library.guide, props.library.guideUrl, props.library.mappings]);
  const allRows = useMemo(() => prioritizeGuideRows(props.library.channels.map((channel, index) => ({ channel, number: channel.number || String(index + 1), programmes: view.guide?.programmes[view.matcher(channel, props.library.mappings) || ''] || [] }))
    .sort((a, b) => comparePreferredChannels(a.channel, b.channel)), now), [props.library.channels, props.library.mappings, view, now]);
  const visibleChannels = useMemo(() => props.library.channels.filter(c => !isChannelHidden(c, props.library.hiddenChannels)), [props.library.channels, props.library.hiddenChannels]);
  const defaultRows = useMemo(() => browseChannelRows(allRows, 'all', props.library.favorites, now, props.library.hiddenChannels), [allRows, props.library.favorites, props.library.hiddenChannels, now]);
  const rows = useMemo(() => filterTvRows(browseChannelRows(allRows, browseMode, props.library.favorites, now, props.library.hiddenChannels), query, category, now), [allRows, browseMode, props.library.favorites, props.library.hiddenChannels, query, category, now]);
  const categories = useMemo(() => channelCategories(allRows), [allRows]);
  const selectedCursor = { ...cursor, channel: Math.max(0, Math.min(cursor.channel, rows.length - 1)), programme: Math.max(0, Math.min(cursor.programme, (rows[cursor.channel]?.programmes.length || 1) - 1)) };
  const row = rows[selectedCursor.channel];
  const programme = row?.programmes[selectedCursor.programme];
  const items = useMemo(() => tvDvrItems(dvrTab, recordings, plans, rules, now), [dvrTab, recordings, plans, rules, now]);
  const item = items[Math.min(itemIndex, Math.max(0, items.length - 1))];

  const refresh = async () => {
    const [recordings, jobs, rules, disk] = await Promise.all([dvr?.listRecordings() || [], recordingPlanner?.plans() || [], recordingPlanner?.rules() || [], recordingPlanner?.storage()]);
    setRecordings(recordings); setPlans(jobs); setRules(rules); setStorage(disk);
  };
  const run = (action: () => Promise<void>) => {
    if (busy.current) { setToast('Please wait for the current DVR action.'); return; }
    busy.current = true;
    void action().catch(e => setToast(e instanceof Error ? e.message : 'The DVR action could not finish.')).finally(() => { busy.current = false; void refresh().catch(() => {}); });
  };
  const onScreen = (next: 'guide' | 'dvr') => { setScreen(next); setFocus({ zone: next === 'guide' ? 'grid' : 'dvrList', index: 0 }); setMenu(false); };
  const guideAction = (action: 'watch' | 'record' | 'series', channelIndex = selectedCursor.channel, programmeIndex = selectedCursor.programme) => {
    // Context actions target the held item, independently of cursor updates.
    const row = rows[channelIndex];
    const programme = row?.programmes[programmeIndex];
    if (!row) return;
    if (action === 'watch') { void props.onWatch(row.channel); return; }
    if (!recordingPlanner || !programme) { setToast('A matching program guide and the Android DVR are required.'); return; }
    const client = recordingPlanner;
    if (programme.stop <= Date.now()) { setToast('This program has already aired.'); return; }
    const rule = rules.find(r => r.channelId === row.channel.id && seriesTitle(r.title) === seriesTitle(programme.title));
    const plan = plans.find(p => ['scheduled', 'starting', 'recording'].includes(p.status) && p.channelId === row.channel.id && p.start === programme.start && p.title === programme.title);
    const record = recordings.find(r => recordingMatchesProgramme(r, row.channel.id, programme, Date.now()));
    run(async () => {
      if (action === 'series') {
        if (rule) { await client.removeRule(rule.id); setToast('Series rule removed. Upcoming episodes cancelled.'); }
        else {
          const added = await client.addRule(row.channel, programme);
          for (const p of row.programmes.filter(p => p.stop > Date.now() && seriesTitle(p.title) === seriesTitle(programme.title)).slice(0, 200)) await client.schedule(row.channel, p, added.id);
          setToast('Series rule saved. Episodes in the downloaded guide are queued.');
        }
      } else if (record) { await dvr?.stopRecording(record.id); setToast('Recording stopped. Captured video kept.'); }
      else if (plan) { await client.cancel(plan.id); setToast('Recording cancelled.'); }
      else {
        if (programme.start <= Date.now() && recordings.some(r => r.status === 'recording')) { setToast('Stop the current recording first. Only one stream is available.'); return; }
        await client.schedule(row.channel, programme, undefined, true);
        setToast(programme.start <= Date.now() ? 'Starting recording…' : client.precise() ? 'Recording scheduled.' : 'Recording scheduled. Android may delay it without exact-alarm access.');
      }
    });
  };
  const onDvrAction = (action: 'play' | 'delete' | 'stop' | 'cancel' | 'guide') => {
    if (!item) return;
    const selected = item;
    if (action === 'guide') {
      const channel = defaultRows.findIndex(r => r.channel.id === selected.channelId);
      if (channel < 0) { setToast('This channel is hidden or no longer available. Use Menu → Hidden channels to restore it.'); return; }
      setBrowseMode('all');
      setQuery(''); setCategory('all');
      setCursor(guideWindow({ ...cursor, channel, programme: programmeAt(defaultRows[channel]!.programmes, selected.programme?.start || now) }, defaultRows)); onScreen('guide'); return;
    }
    if (action === 'delete' && (deletePending.current?.id !== selected.id || Date.now() - deletePending.current.at > 4000)) { deletePending.current = { id: selected.id, at: Date.now() }; setToast(usesTvPlayer ? 'Press Delete again to permanently remove this recording.' : 'Tap Delete again to permanently remove this recording.'); return; }
    run(async () => {
      if (action === 'play' && selected.recordingId && dvr) { const source = await dvr.recordingSource(selected.recordingId); if (selected.kind === 'recording') source.position = 0; setWatching(source); }
      else if (action === 'stop' && selected.recordingId) { await dvr?.stopRecording(selected.recordingId); setToast('Stopped. Captured video kept.'); }
      else if (action === 'delete' && selected.recordingId) { await dvr?.deleteRecording(selected.recordingId); deletePending.current = undefined; setToast('Recording deleted.'); }
      else if (action === 'cancel') { if (selected.ruleId) await recordingPlanner?.removeRule(selected.ruleId); else await recordingPlanner?.cancel(selected.id); setToast(selected.ruleId ? 'Series rule removed.' : 'Recording cancelled.'); }
    });
  };
  const marks = useMemo(() => {
    const result: TvDashboardState['marks'] = {};
    for (const row of rows) for (const p of row.programmes) {
      const job = plans.find(j => j.channelId === row.channel.id && j.start === p.start && j.title === p.title);
      const recording = recordings.find(r => recordingMatchesProgramme(r, row.channel.id, p, now));
      if (recording) result[guideProgrammeKey(row.channel.id, p)] = 'recording';
      else if (job && ['scheduled', 'starting'].includes(job.status)) result[guideProgrammeKey(row.channel.id, p)] = job.seriesId ? 'series' : 'scheduled';
    }
    return result;
  }, [rows, recordings, plans, now]);
  const chooseBrowseMode = (mode: ChannelBrowseMode) => {
    const nextRows = filterTvRows(browseChannelRows(allRows, mode, props.library.favorites, now, props.library.hiddenChannels), query, category, now);
    setBrowseMode(mode); setScreen('guide'); setMenu(false);
    setCursor(guideWindow({ channel: 0, programme: programmeAt(nextRows[0]?.programmes || [], now), rowTop: 0, windowStart: Math.floor(now / 1_800_000) * 1_800_000 }, nextRows));
    setFocus({ zone: 'grid', index: 0 });
  };
  const openNumberSearch = (initial = '') => { setMenu(false); setNumberSearch({ initial }); };
  const showNumberInGuide = (channel: Channel) => {
    const index = defaultRows.findIndex(row => row.channel.id === channel.id);
    if (index < 0) return;
    setNumberSearch(undefined); setBrowseMode('all'); onScreen('guide');
    setQuery(''); setCategory('all');
    setCursor(guideWindow({ channel: index, programme: programmeAt(defaultRows[index]!.programmes, now), rowTop: 0, windowStart: Math.floor(now / 1_800_000) * 1_800_000 }, defaultRows));
    if (props.selected) props.onClose();
  };
  const numberPad = numberSearch && <ChannelNumberPad channels={visibleChannels} initial={numberSearch.initial} onClose={() => setNumberSearch(undefined)} onGuide={showNumberInGuide}
    onWatch={channel => { setNumberSearch(undefined); void props.onWatch(channel); }} />;
  const coverage = useMemo(() => guideCoverage(props.library.channels, view, now), [props.library.channels, view, now]);
  const checkUpdates = async (manual = false) => {
    if (updateInFlight.current) return;
    updateInFlight.current = true; lastUpdateCheck.current = Date.now();
    try { const result = await checkAppRelease(); setRelease(result.release); if (manual || result.release) setToast(result.message); }
    catch (error) { if (manual) setToast(error instanceof Error ? error.message : 'Could not check for updates.'); }
    finally { updateInFlight.current = false; }
  };
  const installUpdate = async () => {
    if (!release || updateBusy) return;
    if (recordings.some(r => r.status === 'recording')) { setToast('Finish the active recording before installing an update.'); return; }
    setUpdateBusy(true); setToast('Preparing update. Android will ask you to confirm installation.');
    try { const result = await installAppRelease(release.url, release.digest); setToast(result === 'permission' ? 'Allow StillWave to install unknown apps in device settings, then select Install update again.' : 'Confirm Update in the Android installer. Your saved library is kept.'); }
    catch (error) { setToast(error instanceof Error ? error.message : 'The update could not be installed.'); }
    finally { setUpdateBusy(false); }
  };
  const applySearch = (text: string, group: string) => {
    setQuery(text); setCategory(group); setSearchOpen(false); setScreen('guide');
    const nextRows = filterTvRows(browseChannelRows(allRows, browseMode, props.library.favorites, now, props.library.hiddenChannels), text, group, now);
    setCursor(guideWindow({ channel: 0, programme: programmeAt(nextRows[0]?.programmes || [], now), rowTop: 0, windowStart: Math.floor(now / 1_800_000) * 1_800_000 }, nextRows)); setFocus({ zone: 'grid', index: 0 });
  };
  const menuActions = browseMenu ? [
    ...CHANNEL_BROWSE_MODES.map(mode => ({ label: `${mode.label} (${browseChannelRows(allRows, mode.id, props.library.favorites, now, props.library.hiddenChannels).length})`, run: () => chooseBrowseMode(mode.id) })),
    { label: 'Back', run: () => { setBrowseMenu(false); setMenuIndex(0); } },
  ] : [
    { label: 'Guide', run: () => onScreen('guide') }, { label: 'My DVR', run: () => onScreen('dvr') },
    { label: 'Search and filter channels', run: () => { setMenu(false); setSearchOpen(true); } },
    ...(query || category !== 'all' ? [{ label: 'Clear search and category filter', run: () => { applySearch('', 'all'); setMenu(false); } }] : []),
    { label: `Schedules: ${coverage.available} of ${coverage.total} channels`, run: () => chooseBrowseMode('withGuide') },
    { label: 'Find channel by number', run: () => openNumberSearch() },
    { label: `Browse channels: ${CHANNEL_BROWSE_MODES.find(m => m.id === browseMode)!.label}`, run: () => { setBrowseMenu(true); setMenuIndex(0); } },
    ...(screen === 'guide' && row ? [{ label: 'Selected channel actions', run: () => { setMenu(false); setFocus({ zone: 'guideActions', index: 0 }); } }] : []),
    ...(screen === 'dvr' && item ? [{ label: 'Selected recording actions', run: () => { setMenu(false); setFocus({ zone: 'dvrActions', index: 0 }); } }] : []),
    ...(row ? [{ label: props.library.favorites.includes(row.channel.id) ? 'Remove favorite' : 'Add favorite', run: () => props.onFavorite(row.channel) }] : []),
    ...(row ? [{ label: isChannelHidden(row.channel, props.library.hiddenChannels) ? 'Unhide selected channel' : 'Hide selected channel', run: () => { props.onHiddenChannels(toggleHiddenChannel(props.library.hiddenChannels || [], row.channel)); setMenu(false); setToast(browseMode === 'hidden' ? 'Channel restored to the guide.' : 'Channel hidden. Restore it in Menu → Hidden channels.'); } }] : []),
    { label: `Hidden channels (${props.library.channels.length - visibleChannels.length})`, run: () => { setQuery(''); setCategory('all'); setBrowseMode('hidden'); setCursor(c => ({ ...c, channel: 0, programme: 0, rowTop: 0 })); setScreen('guide'); setMenu(false); } },
    ...(visibleChannels.length < props.library.channels.length ? [{ label: 'Unhide all channels', run: () => { props.onHiddenChannels([]); setMenu(false); setToast('All channels restored.'); } }] : []),
    { label: updateBusy ? 'Downloading update…' : release ? `Install update ${release.version}` : 'Check for app updates', run: () => { if (release) void installUpdate(); else void checkUpdates(true); } },
    { label: 'Refresh US playlist and guide', run: () => { props.onDefaults(); setMenu(false); } },
    ...view.sources.filter(s => s.url).map(source => ({ label: `Refresh ${source.name}${source.lastError ? ' · retry failed guide' : ''}`, run: () => { props.onRefreshGuide(source.id); setMenu(false); } })),
    { label: 'Back', run: () => setMenu(false) },
  ];
  const live = !!programme && programme.start <= now && programme.stop > now;
  const actions = [...(live || !programme ? ['watch'] : []), ...(programme && programme.stop > now ? ['record', 'series'] : [])] as ('watch' | 'record' | 'series')[];
  useTvKeys(key => {
    if (numberSearch || searchOpen) return;
    if (key.startsWith('digit')) { openNumberSearch(key.slice(5)); return; }
    if (props.selected) return;
    if (menu) {
      if (key === 'back' && browseMenu) { setBrowseMenu(false); setMenuIndex(0); }
      else if (key === 'back' || key === 'menu') setMenu(false);
      else if (key === 'up' || key === 'down') setMenuIndex(i => Math.max(0, Math.min(menuActions.length - 1, i + (key === 'up' ? -1 : 1))));
      else if (key === 'select') menuActions[Math.min(menuIndex, menuActions.length - 1)]?.run();
      return;
    }
    if (key === 'dvr' || key === 'guide') { onScreen(key === 'dvr' ? 'dvr' : 'guide'); return; }
    if (key === 'menu') {
      setMenu(true); setBrowseMenu(false); setMenuIndex(0);
      return;
    }
    if (key === 'record' || key === 'series') { if (screen === 'guide') guideAction(key); return; }
    if (key === 'delete') { if (screen === 'dvr' && item) onDvrAction(item.kind === 'saved' ? 'delete' : item.kind === 'recording' ? 'stop' : 'cancel'); return; }
    if (key === 'back') {
      if (focus.zone !== 'nav') setFocus({ zone: 'nav', index: screen === 'guide' ? 0 : 1 }); else BackHandler.exitApp();
      return;
    }
    if (focus.zone === 'nav') {
      if (key === 'left' || key === 'right') setFocus({ zone: 'nav', index: Math.max(0, Math.min(2, focus.index + (key === 'left' ? -1 : 1))) });
      else if (key === 'select') { if (focus.index === 2) { setMenu(true); setBrowseMenu(false); setMenuIndex(0); } else onScreen(focus.index ? 'dvr' : 'guide'); }
      else if (key === 'down') setFocus({ zone: screen === 'guide' ? 'grid' : 'dvrList', index: 0 });
      return;
    }
    if (focus.zone === 'guideActions') {
      if (key === 'left' || key === 'right') setFocus({ zone: 'guideActions', index: Math.max(0, Math.min(actions.length - 1, focus.index + (key === 'left' ? -1 : 1))) });
      else if (key === 'select') guideAction(actions[focus.index] || 'watch');
      else if (key === 'down') setFocus({ zone: 'grid', index: 0 });
      else if (key === 'up') setFocus({ zone: 'nav', index: 0 });
      return;
    }
    if (focus.zone === 'dvrActions') {
      if (key === 'left' || key === 'right') setFocus({ zone: 'dvrActions', index: Math.max(0, Math.min(2, focus.index + (key === 'left' ? -1 : 1))) });
      else if (key === 'select' && item) onDvrAction(focus.index === 0 ? item.kind === 'saved' || item.kind === 'recording' ? 'play' : 'cancel' : item.kind === 'saved' ? 'delete' : item.kind === 'recording' ? 'stop' : 'guide');
      else if (key === 'up' || key === 'down') setFocus({ zone: 'dvrList', index: 0 });
      return;
    }
    if (screen === 'guide') {
      if (key === 'select' || key === 'playPause') { guideAction('watch'); return; }
      if (key === 'up' && selectedCursor.channel === 0) { setFocus({ zone: actions.length ? 'guideActions' : 'nav', index: 0 }); return; }
      const dx = key === 'left' ? -1 : key === 'right' ? 1 : 0;
      const dy = key === 'up' ? -1 : key === 'down' ? 1 : key === 'channelUp' ? -6 : key === 'channelDown' ? 6 : 0;
      if (dx || dy) setCursor(moveGuide(selectedCursor, rows, dx, dy));
    } else {
      const tabs: TvDvrTab[] = ['recordings', 'scheduled', 'series'];
      if (key === 'left' || key === 'right') { setDvrTab(tabs[Math.max(0, Math.min(2, tabs.indexOf(dvrTab) + (key === 'left' ? -1 : 1)))]!); setItemIndex(0); }
      else if (key === 'up') { if (!itemIndex) setFocus({ zone: 'nav', index: 1 }); else setItemIndex(i => i - 1); }
      else if (key === 'down') setItemIndex(i => Math.min(Math.max(0, items.length - 1), i + 1));
      else if (key === 'select' && item) onDvrAction(item.kind === 'saved' || item.kind === 'recording' ? 'play' : 'guide');
      else if (key === 'fastForward') setFocus({ zone: 'dvrActions', index: 0 });
    }
  }, !watching);
  useEffect(() => { tvNative?.setRemoteEnabled(true); NavigationBar.setHidden(true); return () => { tvNative?.setRemoteEnabled(false); NavigationBar.setHidden(false); }; }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !props.loaded) return;
    void checkUpdates();
    const timer = setInterval(() => void checkUpdates(), 6 * 3600_000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active' && Date.now() - lastUpdateCheck.current >= 6 * 3600_000) void checkUpdates(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [props.loaded]);
  useEffect(() => {
    if (!rows.length || initialized.current) return;
    initialized.current = true;
    setCursor(c => guideWindow({ ...c, programme: programmeAt(rows[0]!.programmes, now) }, rows));
  }, [rows]);
  useEffect(() => {
    let active = true;
    const load = () => { if (active) void refresh().catch(() => setToast('Could not read the DVR. Your library is kept.')); };
    void recordingPlanner?.restore().then(load).catch(load); load();
    const timer = setInterval(load, 3000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { active = false; clearInterval(timer); app.remove(); };
  }, []);
  useEffect(() => {
    const capacity = Math.max(0, 200 - plans.filter(p => ['scheduled', 'starting', 'recording'].includes(p.status)).length);
    const missing = seriesEpisodes(rules, allRows, plans, Date.now()).slice(0, capacity);
    if (!recordingPlanner || !missing.length || busy.current) return;
    const client = recordingPlanner;
    run(async () => { for (const item of missing) await client.schedule(item.channel, item.programme, item.ruleId); });
  }, [allRows, rules, plans]);
  useEffect(() => { if (menu) menuList.current?.scrollTo({ y: Math.max(0, (menuIndex - 2) * 50), animated: false }); }, [menu, menuIndex, browseMenu]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (props.error) setToast(props.error); else if (props.busy) setToast(props.busy); else if (props.notice) setToast(props.notice); }, [props.error, props.busy, props.notice]);
  useEffect(() => {
    if ((props.selected && !numberSearch) || watching || searchOpen || (!usesTvPlayer && !menu && !numberSearch)) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (numberSearch) setNumberSearch(undefined); else if (menu) setMenu(false); else setFocus({ zone: 'nav', index: screen === 'guide' ? 0 : 1 }); return true; });
    return () => sub.remove();
  });
  if (props.selected) {
    const previous = previousChannel({ ...props.library, channels: visibleChannels }, props.selected.id);
    return <View style={s.fullscreen}><StatusBar hidden /><TvKeysSuspended.Provider value={!!numberSearch}><LivePlayer key={props.selected.id} channel={props.selected} profile={props.library.profile} fullscreen onFullscreenChange={props.onClose} onClose={props.onClose}
      programme={nowAndNext(view.guide?.programmes[view.matcher(props.selected, props.library.mappings) || ''], now).now} onFirstPlaying={props.onFirstPlaying} onOpenChannelNumber={() => openNumberSearch()} onOpenGuide={props.onClose}
      onNextChannel={adjacentChannel(visibleChannels, props.selected.id, 1) ? () => { const channel = adjacentChannel(visibleChannels, props.selected!.id, 1); if (channel) void props.onWatch(channel); } : undefined}
      onPreviousInLineup={adjacentChannel(visibleChannels, props.selected.id, -1) ? () => { const channel = adjacentChannel(visibleChannels, props.selected!.id, -1); if (channel) void props.onWatch(channel); } : undefined}
      previousChannelName={previous?.name} onPreviousChannel={previous ? () => void props.onWatch(previous) : undefined} /></TvKeysSuspended.Provider>{numberPad}</View>;
  }
  if (watching) return <TvRecordingPlayer recording={watching} onClose={() => setWatching(undefined)} />;
  const totalGb = storage ? (storage.totalBytes / 1_000_000_000).toFixed(1) : '—';
  const usedGb = ((storage ? storage.totalBytes - storage.freeBytes : recordings.reduce((sum, r) => sum + r.bytes, 0)) / 1_000_000_000).toFixed(1);
  const state: TvDashboardState = { screen, now, clock: new Date(now).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    dayLabel: query ? `Search: ${query}` : category !== 'all' ? category : browseMode !== 'all' ? CHANNEL_BROWSE_MODES.find(m => m.id === browseMode)!.label : new Date(cursor.windowStart).toDateString() === new Date(now).toDateString() ? 'Today' : new Date(cursor.windowStart).toLocaleDateString('en-US', { weekday: 'long' }),
    rows, cursor: selectedCursor, marks, dvrTab, items, itemIndex, summary: `${usedGb} of ${totalGb} GB used · ${recordings.some(r => r.status === 'recording') ? 1 : 0} of 1 streams in use`,
    conflict: recordingConflict(recordings, plans, now), toast, focus, guideEmpty: props.busy || (!props.loaded ? 'Loading your channels…' : !rows.length ? `No channels match. Use Menu to clear filters or restore hidden channels.` : usesTvPlayer ? 'No schedule is available. Press OK to watch this channel live.' : 'No schedule is available. Tap the channel to watch live.') };
  return <View style={s.fullscreen}><StatusBar hidden /><View style={s.fullscreen}><TvDashboard state={state} onScreen={onScreen}
    onMenu={() => { setMenu(true); setBrowseMenu(false); setMenuIndex(0); }}
    contentInsets={!usesTvPlayer ? insets : undefined} favorites={props.library.favorites} hiddenChannels={props.library.hiddenChannels} seriesRules={rules}
    onJumpToLive={() => { const liveNow = Date.now(); setCursor(c => ({ ...c, windowStart: Math.floor(liveNow / 1_800_000) * 1_800_000, programme: programmeAt(rows[selectedCursor.channel]?.programmes || [], liveNow) })); setFocus({ zone: 'grid', index: 0 }); }}
    onWatchChannel={index => { const target = rows[index]; if (!target) return; setCursor(c => ({ ...c, channel: index, programme: programmeAt(target.programmes, Date.now()) })); setFocus({ zone: 'grid', index: 0 }); void props.onWatch(target.channel); }}
    onChannelAction={(action, index) => { const target = rows[index]?.channel; if (!target) return; if (action === 'favorite') props.onFavorite(target); else { props.onHiddenChannels(toggleHiddenChannel(props.library.hiddenChannels || [], target)); setToast(isChannelHidden(target, props.library.hiddenChannels) ? 'Channel restored to the guide.' : 'Channel hidden. Restore it in Menu → Hidden channels.'); } }}
    onProgramme={(channel, programme) => {
      if (!usesTvPlayer) {
        const target = rows[channel]; if (!target) return;
        setCursor(c => ({ ...c, channel, programme })); setFocus({ zone: 'grid', index: 0 });
        const airing = target.programmes[programme];
        if (!airing || airing.start <= Date.now() && airing.stop > Date.now()) void props.onWatch(target.channel);
      } else if (selectedCursor.channel === channel && selectedCursor.programme === programme && focus.zone === 'grid') guideAction('watch');
      else { setCursor(guideWindow({ ...cursor, channel, programme }, rows)); setFocus({ zone: 'grid', index: 0 }); }
    }}
    onGuideAction={guideAction} onTab={tab => { setDvrTab(tab); setItemIndex(0); setFocus({ zone: 'dvrList', index: 0 }); }} onItem={index => { setItemIndex(index); setFocus({ zone: 'dvrList', index: 0 }); }} onDvrAction={onDvrAction} /></View>
    {menu && <View style={[s.menu, !usesTvPlayer && { left: insets.left + 12, right: insets.right + 12, top: insets.top + 12, bottom: insets.bottom + 12, padding: 12 }]}><ScrollView ref={menuList}>{menuActions.map((action, i) => <TvButton key={`${i}:${action.label}`} label={action.label} focused={i === Math.min(menuIndex, menuActions.length - 1)} onPress={action.run} />)}</ScrollView></View>}
    {numberPad}
    {searchOpen && <TvChannelSearch categories={categories} query={query} category={category} onApply={applySearch} onClose={() => setSearchOpen(false)} />}
  </View>;
}
const s = StyleSheet.create({ fullscreen: { flex: 1, backgroundColor: '#000' }, menu: { position: 'absolute', left: '25%', right: '25%', top: '12%', bottom: '12%', backgroundColor: DVR_COLORS.panel, borderColor: DVR_COLORS.line, borderWidth: 1, padding: 20 } });
