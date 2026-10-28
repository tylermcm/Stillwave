// Isolated interaction fixture. No user library or real stream is opened.
import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TvShell } from '../src/components/tv/TvDvrShell';
import { SleepTimerProvider, useSleepPlayback } from '../src/components/SleepTimer';
import { EMPTY_LIBRARY, type Library } from '../src/types';
import { restoreLibrary } from '../src/core/playlists';

const start = Math.floor(Date.now() / 1_800_000) * 1_800_000;
const channels = Array.from({ length: 28 }, (_, i) => ({ id: `fixture:${i}`, sourceId: String(i), playlistId: 'fixture', tvgId: `guide${i}`, name: `Channel ${String(i + 1).padStart(2, '0')}`, group: 'Preview', number: String(i + 101), kind: 'hls' as const, url: 'https://example.invalid/live', headers: {} }));
const guide = { importedAt: start, channels: Object.fromEntries(channels.map(c => [c.tvgId, [c.name]])), programmes: Object.fromEntries(channels.map(c => [c.tvgId, Array.from({ length: 76 }, (_, i) => ({ channelId: c.tvgId, title: `Show ${i + 1}`, start: start + i * 3600_000, stop: start + (i + 1) * 3600_000 }))])) };
function Preview() {
  const [library, setLibrary] = useState<Library>(() => {
    const saved = localStorage.getItem('stillwave-personalization-fixture');
    return saved ? restoreLibrary(JSON.parse(saved)) : { ...EMPTY_LIBRARY, channels, playlists: [{ id: 'fixture', name: 'Preview' }], favorites: [channels[2]!.id], guide };
  });
  const [stopped, setStopped] = useState(0);
  const [watched, setWatched] = useState('');
  useSleepPlayback(() => setStopped(n => n + 1));
  useEffect(() => localStorage.setItem('stillwave-personalization-fixture', JSON.stringify(library)), [library]);
  return <View style={{ flex: 1 }}><TvShell library={library} loaded busy="" error="" notice="" onWatch={async channel => { setWatched(channel.id); return true; }} onClose={() => {}} onFirstPlaying={() => {}}
    onFavorite={channel => setLibrary(l => ({ ...l, favorites: l.favorites.includes(channel.id) ? l.favorites.filter(id => id !== channel.id) : [...l.favorites, channel.id] }))}
    onPreferences={preferences => setLibrary(l => ({ ...l, preferences }))} onChannelOrder={channelOrder => setLibrary(l => ({ ...l, channelOrder }))} onHiddenChannels={hiddenChannels => setLibrary(l => ({ ...l, hiddenChannels }))} onDefaults={() => {}} onRefreshPlaylist={() => {}} onRefreshGuide={() => {}} />
    <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}><Text testID="sleep-stopped-count">{stopped}</Text><Text testID="fixture-watched">{watched}</Text></View>
  </View>;
}
registerRootComponent(() => <SafeAreaProvider style={{ height: '100%' }}><SleepTimerProvider><Preview /></SleepTimerProvider></SafeAreaProvider>);
