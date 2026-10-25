import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetch as probeFetch } from 'expo/fetch';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Network from 'expo-network';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { BufferProfile, Channel } from '../types';
import { classifyFailure, failureMessage, HEALTHY_RESET_MS, MAX_RETRIES, retryDelay, STALL_TIMEOUT_MS } from '../core/recovery';
import { diagnosePlayback, type Diagnosis, type PlaybackEvidence } from '../core/diagnostics';

const buffers = {
  fast: { preferredForwardBufferDuration: 8, minBufferForPlayback: 1 },
  balanced: { preferredForwardBufferDuration: 20, minBufferForPlayback: 2 },
  stable: { preferredForwardBufferDuration: 40, minBufferForPlayback: 4 },
};

type Props = {
  channel: Channel;
  profile: BufferProfile;
  fullscreen: boolean;
  onFullscreen: () => void;
  onClose: () => void;
};

// A new session owns a single native player. Changing channel or retrying unmounts
// it completely, preventing late errors from a previous stream from leaking in.
export function LivePlayer(props: Props) {
  const [generation, setGeneration] = useState(0);
  const attempts = useRef(0);
  const [diagnosis, setDiagnosis] = useState<Diagnosis>();
  const recordDiagnosis = useCallback((value: Diagnosis) => setDiagnosis(value), []);
  const restart = useCallback((reset: boolean) => {
    if (reset) attempts.current = 0;
    setGeneration(g => g + 1);
  }, []);
  return <PlayerSession {...props} key={generation} attempts={attempts} restart={restart} diagnosis={diagnosis} recordDiagnosis={recordDiagnosis} />;
}

function PlayerSession({ channel, profile, fullscreen, onFullscreen, onClose, attempts, restart, diagnosis, recordDiagnosis }: Props & {
  attempts: React.RefObject<number>;
  restart: (reset: boolean) => void;
  diagnosis?: Diagnosis;
  recordDiagnosis: (value: Diagnosis) => void;
}) {
  const [state, setState] = useState('Connecting');
  const [detail, setDetail] = useState('Opening channel…');
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cc, setCc] = useState(false);
  const [hasCc, setHasCc] = useState(false);
  const [audioCount, setAudioCount] = useState(0);
  const [live, setLive] = useState(false);
  const [metrics, setMetrics] = useState('');
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [probe, setProbe] = useState('');
  const [probing, setProbing] = useState(false);
  const probeController = useRef<AbortController | undefined>(undefined);
  const evidence = useRef<PlaybackEvidence>({ online: true, state: 'idle', bufferSeconds: null, stalledMs: 0, eventLoopDelayMs: 0, hasProgress: false });
  const intended = useRef(true);
  const active = useRef(AppState.currentState === 'active');
  const online = useRef(true);
  const retrying = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const player = useVideoPlayer(null, p => {
    p.bufferOptions = { ...buffers[profile], waitsToMinimizeStalling: true, prioritizeTimeOverSizeThreshold: true, maxBufferBytes: 48 * 1024 * 1024 };
    p.timeUpdateEventInterval = 1;
    p.staysActiveInBackground = false;
  });

  useEffect(() => {
    let lastPosition = player.currentTime;
    let lastProgress = Date.now();
    let healthySince = 0;
    let lastTick = Date.now();
    let lagAt = 0;
    let mounted = true;
    const clearRetry = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; };
    const recover = (message: string) => {
      if (!mounted || retrying.current || stopped.current || !intended.current || !active.current || !online.current) return;
      const kind = classifyFailure(message);
      const baseDelay = retryDelay(attempts.current, kind);
      const delay = baseDelay !== null && /\b429\b/.test(message) ? Math.max(30_000, baseDelay) : baseDelay;
      evidence.current.error = message;
      evidence.current.stalledMs = Date.now() - lastProgress;
      recordDiagnosis(diagnosePlayback(evidence.current));
      healthySince = 0;
      if (delay === null) {
        stopped.current = true;
        player.pause();
        setFailed(true); setState('Unavailable'); setDetail(failureMessage(kind));
        return;
      }
      retrying.current = true;
      attempts.current++;
      setState('Reconnecting');
      setDetail(`Attempt ${attempts.current} of ${MAX_RETRIES} in ${delay / 1000}s`);
      timer.current = setTimeout(() => { if (mounted && intended.current && active.current && online.current) restart(false); }, delay);
    };
    const status = player.addListener('statusChange', event => {
      if (!mounted || retrying.current || stopped.current) return;
      evidence.current.state = event.status;
      if (event.status === 'error') recover(event.error?.message ?? 'Playback failed');
      else if (event.status === 'loading') { healthySince = 0; setState('Buffering'); setDetail('Building a playback buffer…'); }
      else if (event.status === 'readyToPlay') {
        setHasCc(player.availableSubtitleTracks.length > 0);
        setAudioCount(player.availableAudioTracks.length);
      }
    });
    const playingSubscription = player.addListener('playingChange', event => { if (mounted) setPlaying(event.isPlaying); });
    const ended = player.addListener('playToEnd', () => recover('Live stream ended'));
    const app = AppState.addEventListener('change', next => {
      active.current = next === 'active';
      lastTick = Date.now();
      if (!active.current) {
        clearRetry(); retrying.current = false; healthySince = 0; player.pause();
      } else if (intended.current && !stopped.current && online.current) {
        // Rejoin the current broadcast rather than resuming an old live window.
        restart(false);
      }
    });
    const onNetwork = (next: Network.NetworkState) => {
      if (!mounted) return;
      const wasOnline = online.current;
      online.current = next.isConnected !== false && next.isInternetReachable !== false;
      evidence.current.online = online.current;
      if (!online.current) {
        clearRetry(); retrying.current = false; healthySince = 0;
        player.pause(); setState('Offline'); setDetail('Playback will reconnect when your connection returns.');
        recordDiagnosis(diagnosePlayback(evidence.current));
      } else if (!wasOnline && intended.current && active.current && !stopped.current) restart(true);
    };
    const network = Network.addNetworkStateListener(onNetwork);
    void Network.getNetworkStateAsync().then(onNetwork).catch(() => {});
    const tick = setInterval(() => {
      const tickTime = Date.now();
      const lag = Math.max(0, tickTime - lastTick - 1000);
      lastTick = tickTime;
      if (active.current && lag >= 1500) { evidence.current.eventLoopDelayMs = lag; lagAt = tickTime; }
      else if (tickTime - lagAt > 30_000) evidence.current.eventLoopDelayMs = 0;
      if (!mounted || !intended.current || !active.current || !online.current || retrying.current || stopped.current) return;
      const now = Date.now();
      const position = player.currentTime;
      evidence.current.state = player.status;
      evidence.current.bufferSeconds = player.bufferedPosition >= 0 ? Math.max(0, player.bufferedPosition - position) : null;
      evidence.current.stalledMs = now - lastProgress;
      // A moving clock is evidence of progress. A "playing" flag alone is not.
      if (Math.abs(position - lastPosition) > 0.05) {
        lastProgress = now; lastPosition = position;
        evidence.current.stalledMs = 0; evidence.current.error = undefined; evidence.current.hasProgress = true;
        healthySince ||= now;
        if (now - healthySince >= HEALTHY_RESET_MS) attempts.current = 0;
        setState('Playing'); setDetail(''); setPlaying(player.playing);
        setLive(player.isLive);
        const offset = player.currentOffsetFromLive;
        const track = player.videoTrack;
        const buffer = Math.max(0, player.bufferedPosition - position);
        setMetrics([track?.size?.height ? `${track.size.height}p` : '', `${Math.round(buffer)}s buffered`, offset != null && offset >= 0 ? `~${Math.round(offset)}s live delay` : ''].filter(Boolean).join(' · '));
      } else {
        healthySince = 0;
        if (now - lastProgress >= STALL_TIMEOUT_MS) recover('Playback stalled');
      }
    }, 1000);
    // Attach listeners before asynchronous source loading so even immediate
    // authentication/codec failures are classified and shown accurately.
    void player.replaceAsync({ uri: channel.url, headers: channel.headers, contentType: channel.kind, useCaching: false }).then(() => {
      if (mounted && intended.current && active.current && online.current && !stopped.current && !retrying.current) player.play();
    }).catch(error => recover(error instanceof Error ? error.message : 'Playback failed'));
    return () => {
      mounted = false; clearRetry(); clearInterval(tick);
      probeController.current?.abort();
      probeController.current = undefined;
      status.remove(); playingSubscription.remove(); ended.remove(); app.remove(); network.remove();
    };
  }, [player, attempts, restart, channel, recordDiagnosis]);

  const inspect = () => {
    recordDiagnosis(diagnosePlayback(evidence.current));
    setShowDiagnosis(true);
  };
  const checkSource = async () => {
    if (probing) return;
    setProbing(true); setProbe('Checking the channel address…');
    const controller = new AbortController();
    probeController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      // A HEAD request checks response headers without downloading a second stream.
      // Success proves only this URL answered, not that its media segments work.
      const response = await probeFetch(channel.url, { method: 'HEAD', headers: channel.headers, signal: controller.signal });
      if (probeController.current !== controller) return;
      if (response.status === 405 || response.status === 501) setProbe('This server does not support a quick header check. Its playback health is still unknown.');
      else if (response.ok) setProbe(`The channel address answered (HTTP ${response.status}). This does not verify video segments, codecs, or sustained speed.`);
      else {
        const finding = diagnosePlayback({ ...evidence.current, error: `HTTP ${response.status}` });
        setProbe(`Header check returned HTTP ${response.status}: ${finding.title}. Some servers handle checks differently from playback requests; this does not replace the playback diagnosis.`);
      }
    } catch {
      if (probeController.current === controller) setProbe('The header check could not finish. This alone cannot distinguish a server, network, or browser restriction.');
    } finally {
      clearTimeout(timeout);
      if (probeController.current === controller) setProbing(false);
    }
  };

  const togglePause = () => {
    if (!intended.current) { restart(true); return; }
    intended.current = false;
    if (timer.current) clearTimeout(timer.current);
    player.pause(); setPaused(true); setPlaying(false); setState('Paused'); setDetail('Resume will return to live TV.');
  };
  const toggleCc = () => {
    const next = !cc;
    player.subtitleTrack = next ? player.availableSubtitleTracks[0] ?? null : null;
    setCc(next);
  };
  const cycleAudio = () => {
    const tracks = player.availableAudioTracks;
    const index = tracks.findIndex(track => track.id === player.audioTrack?.id);
    player.audioTrack = tracks[(index + 1) % tracks.length] ?? null;
    setDetail(`Audio: ${player.audioTrack?.label || player.audioTrack?.language || 'Default'}`);
  };
  const badge = paused ? 'PAUSED' : failed ? 'UNAVAILABLE' : state === 'Playing' ? live ? 'LIVE' : 'PLAYING' : state.toUpperCase();
  return <View style={[s.container, fullscreen && s.fullscreen]}>
    <View style={[s.videoArea, fullscreen && { aspectRatio: undefined, flex: 1 }]}>
      <VideoView player={player} nativeControls={false} contentFit="contain" style={s.video} fullscreenOptions={{ enable: false }} allowsVideoFrameAnalysis={false} />
      {!playing && !paused && !failed && <View pointerEvents="none" style={s.loading}><ActivityIndicator color="#a8eece" /><Text style={s.overlayText}>{state}</Text></View>}
      <View style={s.videoTop}>
        <View style={s.badge}><View style={[s.dot, { backgroundColor: badge === 'LIVE' || badge === 'PLAYING' ? '#8ce4b7' : '#d8b983' }]} /><Text style={s.badgeText}>{badge}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close player" onPress={onClose} style={s.icon}><Ionicons name="close" size={22} color="white" /></Pressable>
      </View>
    </View>
    <View style={s.bottom}>
      <View style={s.titleRow}><Text numberOfLines={1} style={s.title}>{channel.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onPress={onFullscreen} style={s.icon}><Ionicons name={fullscreen ? 'contract-outline' : 'expand-outline'} size={21} color="#d6e4e1" /></Pressable></View>
      <Text style={s.detail}>{detail || metrics || channel.group}</Text>
      <View style={s.controls}>
        {!failed && <Pressable accessibilityRole="button" accessibilityLabel={paused ? 'Resume live TV' : 'Pause live TV'} onPress={togglePause} style={s.control}><Ionicons name={paused ? 'play' : 'pause'} size={17} color="#d6e4e1" /><Text style={s.controlText}>{paused ? 'Resume' : 'Pause'}</Text></Pressable>}
        <Pressable accessibilityRole="button" onPress={() => restart(true)} style={[s.control, s.primary]}><Ionicons name="radio-outline" size={18} color="#a8eece" /><Text style={[s.controlText, { color: '#a8eece' }]}>{failed ? 'Retry' : 'Go live'}</Text></Pressable>
        {hasCc && <Pressable accessibilityRole="button" accessibilityLabel="Toggle captions" accessibilityState={{ selected: cc }} onPress={toggleCc} style={s.control}><Text style={[s.controlText, cc && { color: '#a8eece' }]}>CC</Text></Pressable>}
        {audioCount > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Change audio language" onPress={cycleAudio} style={s.control}><Ionicons name="language-outline" size={19} color="#d6e4e1" /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Why is this channel not playing?" onPress={inspect} style={s.control}><Ionicons name="pulse-outline" size={18} color="#d6e4e1" /><Text style={s.controlText}>Diagnose</Text></Pressable>
      </View>
      {(failed || state === 'Reconnecting') && diagnosis && <Pressable accessibilityRole="button" onPress={() => setShowDiagnosis(true)}><Text style={s.failure}>{diagnosis.title} · See why</Text></Pressable>}
      {Platform.OS === 'web' && <Text style={s.webNote}>Browser preview · verify playback on your phone</Text>}
    </View>
    <Modal visible={showDiagnosis} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDiagnosis(false)}><SafeAreaView style={s.diagnosticScreen}><ScrollView contentContainerStyle={s.diagnosticContent}>
      <View style={s.titleRow}><Text style={s.title}>Playback check</Text><Pressable accessibilityRole="button" accessibilityLabel="Close playback check" onPress={() => setShowDiagnosis(false)} style={s.icon}><Ionicons name="close" size={25} color="#d6e4e1" /></Pressable></View>
      <Text style={s.diagnosticLabel}>{diagnosis?.area.toUpperCase()} · {diagnosis?.confidence === 'observed' ? 'OBSERVED' : diagnosis?.confidence === 'likely' ? 'POSSIBLE CAUSE' : 'CAUSE UNCERTAIN'}</Text>
      <Text style={s.diagnosticTitle}>{diagnosis?.title}</Text><Text style={s.diagnosticBody}>{diagnosis?.explanation}</Text>
      <View style={s.diagnosticBox}><Text style={s.diagnosticLabel}>WHAT YOU CAN DO</Text><Text style={s.diagnosticBody}>{diagnosis?.action}</Text></View>
      <Text style={s.diagnosticLabel}>WHAT WE MEASURED</Text>{diagnosis?.evidence.map((line, index) => <Text style={s.evidence} key={index}>{line}</Text>)}
      <Text style={s.diagnosticBody}>App responsiveness is measured by its own foreground timer. A normal timer does not rule out a native decoder or graphics problem.</Text>
      <View style={s.controls}><Pressable accessibilityRole="button" onPress={inspect} style={s.control}><Text style={s.controlText}>Refresh check</Text></Pressable><Pressable accessibilityRole="button" disabled={probing} onPress={() => void checkSource()} style={s.control}><Text style={s.controlText}>{probing ? 'Checking…' : 'Check server response'}</Text></Pressable></View>
      {!!probe && <Text style={s.diagnosticBody}>{probe}</Text>}
    </ScrollView></SafeAreaView></Modal>
  </View>;
}

const s = StyleSheet.create({
  container: { backgroundColor: '#0e1a1c', borderRadius: 20, overflow: 'hidden', marginBottom: 18 },
  fullscreen: { flex: 1, marginBottom: 0, borderRadius: 0 },
  videoArea: { aspectRatio: 16 / 9, backgroundColor: '#000', flexGrow: 1 },
  video: { width: '100%', height: '100%' },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#0006' },
  overlayText: { color: '#d6e4e1', fontSize: 12 },
  videoTop: { position: 'absolute', top: 12, left: 12, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#071012cc', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottom: { padding: 15, paddingTop: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#ecf5f2', fontSize: 18, fontWeight: '700', flex: 1 },
  detail: { color: '#93a9a7', fontSize: 12, lineHeight: 18, marginBottom: 13 },
  controls: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  control: { paddingHorizontal: 13, minHeight: 42, borderRadius: 10, backgroundColor: '#1a2a2d', flexDirection: 'row', alignItems: 'center', gap: 7 },
  primary: { backgroundColor: '#173c31' },
  controlText: { fontSize: 12, color: '#d6e4e1', fontWeight: '600' },
  failure: { marginTop: 12, color: '#e3b78a', fontSize: 13, lineHeight: 20 },
  webNote: { color: '#93a9a7', fontSize: 10, marginTop: 10 },
  diagnosticScreen: { flex: 1, backgroundColor: '#091315' },
  diagnosticContent: { padding: 23, gap: 17 },
  diagnosticLabel: { color: '#8baf9f', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  diagnosticTitle: { color: '#e0eee7', fontSize: 25, lineHeight: 32, fontWeight: '600' },
  diagnosticBody: { color: '#a8bdb4', fontSize: 13, lineHeight: 22 },
  diagnosticBox: { padding: 16, gap: 9, backgroundColor: '#152b24', borderRadius: 12 },
  evidence: { color: '#93a9a7', fontSize: 12, lineHeight: 19 },
});
