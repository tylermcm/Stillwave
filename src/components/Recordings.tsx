import { useEffect, useRef, useState } from 'react';
import { useSleepPlayback } from './SleepTimer';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { clock, type Recording } from '../core/dvr';
import { dvr, dvrUnavailableReason } from '../data/dvr';

export function Recordings() {
  const [items, setItems] = useState<Recording[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [watching, setWatching] = useState<Recording & { uri: string }>();
  const refresh = async () => { if (dvr) { const list = await dvr.listRecordings(); setItems(list); } setLoaded(true); };
  useEffect(() => {
    let mounted = true; let pending = false;
    const poll = async () => {
      if (!dvr || pending) { if (!dvr) setLoaded(true); return; }
      pending = true;
      try { const list = await dvr.listRecordings(); if (mounted) { setItems(list); setLoaded(true); } }
      catch { if (mounted) { setError('Could not read saved recordings.'); setLoaded(true); } }
      finally { pending = false; }
    };
    void poll(); const timer = setInterval(() => void poll(), 2500);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  const run = async (id: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(id); setError('');
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The recording action failed.'); }
    finally { setBusy(''); }
  };
  return <View style={s.screen}>
    <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={s.content} ListHeaderComponent={<View style={s.heading}>
      <Text style={s.eyebrow}>YOUR DVR</Text><Text style={s.title}>Recordings.</Text><Text style={s.body}>{dvr ? 'Saved on this device. Record a channel from the player, then watch it here.' : dvrUnavailableReason}</Text>
      {!loaded && <ActivityIndicator color="#a7eccb" />}{!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </View>} renderItem={({ item }) => <View style={s.card}>
      <View style={s.row}><Ionicons name={item.status === 'recording' ? 'radio-button-on' : 'film-outline'} size={23} color={item.status === 'recording' ? '#ff7777' : '#a7eccb'} /><Text style={s.status}>{item.status === 'recording' ? 'RECORDING NOW' : item.status === 'interrupted' ? 'PARTIAL RECORDING' : 'SAVED'}</Text></View>
      <Text style={s.name}>{item.title}</Text><Text style={s.body}>{item.channel} · {new Date(item.createdAt).toLocaleString()}</Text>
      <Text style={s.body}>{clock(item.duration)} · {(item.bytes / 1024 / 1024).toFixed(1)} MiB{item.position > 2 ? ` · Resume at ${clock(item.position)}` : ''}</Text>
      {!!item.note && <Text style={s.body}>{item.note}</Text>}
      <View style={s.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Play recording ${item.title}`} disabled={!!busy || item.duration <= 0} onPress={() => void run(item.id, async () => { if (dvr) setWatching(await dvr.recordingSource(item.id)); })} style={[s.button, item.duration <= 0 && { opacity: 0.4 }]}><Ionicons name="play" color="#09241b" size={17} /><Text style={s.buttonLabel}>{item.position > 2 ? 'Resume' : 'Watch'}</Text></Pressable>
        {item.status === 'recording' ? <Pressable accessibilityRole="button" accessibilityLabel={`Stop recording ${item.title}`} disabled={!!busy} onPress={() => void run(item.id, async () => { await dvr?.stopRecording(item.id); })} style={s.secondary}><Text style={s.secondaryLabel}>Stop & save</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Delete recording ${item.title}`} disabled={!!busy} onPress={() => Alert.alert('Delete recording?', `Delete “${item.title}” from this device?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(item.id, async () => { await dvr?.deleteRecording(item.id); }) }])} style={s.secondary}><Ionicons name="trash-outline" color="#adc4b8" size={19} /></Pressable>}
      </View>
    </View>} ListEmptyComponent={loaded ? <View style={s.empty}><Ionicons name="videocam-outline" size={44} color="#648477" /><Text style={s.name}>Your next watch starts here.</Text><Text style={s.body}>Open a supported HLS channel and tap the record button. Recordings remain when the rewind buffer clears.</Text></View> : undefined} />
    {watching && <RecordingPlayer recording={watching} onClose={() => { setWatching(undefined); void refresh().catch(() => setError('Could not refresh recordings.')); }} />}
  </View>;
}

function RecordingPlayer({ recording, onClose }: { recording: Recording & { uri: string }; onClose: () => void }) {
  const [error, setError] = useState('');
  const position = useRef(recording.position);
  const player = useVideoPlayer(null, p => { p.timeUpdateEventInterval = 1; p.staysActiveInBackground = false; });
  useSleepPlayback(() => { player.pause(); onClose(); });
  useEffect(() => {
    let mounted = true; let restored = false;
    const source = player.addListener('sourceLoad', () => {
      if (restored) return;
      restored = true; player.currentTime = Math.max(0, Math.min(recording.position, player.duration - 0.5)); player.play();
    });
    const tick = player.addListener('timeUpdate', event => { position.current = event.currentTime; });
    const ended = player.addListener('playToEnd', () => { position.current = player.duration || recording.duration; void dvr?.savePosition(recording.id, position.current).catch(() => {}); });
    const status = player.addListener('statusChange', event => { if (mounted && event.status === 'error') setError('This recording could not play. Captured segments may be incomplete or unsupported by this device.'); });
    // expo-video's native lifecycle pauses hidden playback while preserving
    // the fullscreen Activity handoff. An AppState pause here interrupts it.
    void player.replaceAsync({ uri: recording.uri, contentType: 'hls', useCaching: false }).catch(() => { if (mounted) setError('Could not open the recording.'); });
    const save = () => { void dvr?.savePosition(recording.id, position.current).catch(() => {}); };
    const timer = setInterval(save, 3000);
    return () => { mounted = false; clearInterval(timer); save(); dvr?.releaseRecording(recording.id); source.remove(); tick.remove(); ended.remove(); status.remove(); };
  }, [player, recording]);
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={s.screen}>
    <View style={[s.row, { padding: 18 }]}><View style={{ flex: 1 }}><Text style={s.name}>{recording.title}</Text><Text style={s.body}>{recording.channel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close recording" onPress={onClose} style={s.secondary}><Ionicons name="close" size={25} color="#d7e6e0" /></Pressable></View>
    <VideoView player={player} nativeControls contentFit="contain" style={{ flex: 1, backgroundColor: '#000' }} fullscreenOptions={{ enable: true, orientation: 'landscape' }} />
    {!!error && <Text accessibilityRole="alert" style={[s.error, { padding: 18 }]}>{error}</Text>}
    {recording.status === 'recording' && <Text style={[s.body, { padding: 18 }]}>Recording is still running. You can watch from the beginning while new footage is saved.</Text>}
  </SafeAreaView></Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#091315' }, content: { padding: 20, gap: 16, paddingBottom: 35 }, heading: { gap: 9, marginBottom: 5 }, eyebrow: { color: '#8baf9f', fontSize: 10, letterSpacing: 1.5, fontWeight: '700' }, title: { color: '#ecf5f2', fontSize: 29, fontWeight: '600' }, body: { color: '#9bb4a8', fontSize: 12, lineHeight: 19 }, error: { color: '#edbd9b', fontSize: 13, lineHeight: 20 }, card: { borderRadius: 17, backgroundColor: '#132421', padding: 17, gap: 10 }, row: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }, status: { color: '#abc9b7', fontSize: 10, fontWeight: '700', letterSpacing: 1 }, name: { color: '#e7f3ec', fontSize: 17, fontWeight: '600' }, button: { backgroundColor: '#a7eccb', minHeight: 43, borderRadius: 11, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 7 }, buttonLabel: { color: '#09241b', fontWeight: '700', fontSize: 12 }, secondary: { backgroundColor: '#243a32', minHeight: 43, minWidth: 44, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, secondaryLabel: { color: '#d7e6e0', fontSize: 12, fontWeight: '600' }, empty: { padding: 24, paddingTop: 45, alignItems: 'center', gap: 15 },
});
