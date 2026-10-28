import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, AppState, BackHandler, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetch as probeFetch } from 'expo/fetch';
import { isPictureInPictureSupported, VideoView, useVideoPlayer } from 'expo-video';
import * as Network from 'expo-network';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { BufferProfile, Channel } from '../types';
import { classifyFailure, failureMessage, HEALTHY_RESET_MS, MAX_RETRIES, retryDelay, STALL_TIMEOUT_MS } from '../core/recovery';
import { diagnosePlayback, type Diagnosis, type PlaybackEvidence } from '../core/diagnostics';
import { PipHandoff } from '../core/pipHandoff';
import { bufferWarning, clock, dvrSeekTarget, playbackWindow, type DvrSnapshot } from '../core/dvr';
import { dvr } from '../data/dvr';
import { useDvrSession } from './useDvrSession';
import { isTv, usesTvPlayer } from '../data/tv';
import { TvPlayerControls, type TvAction } from './tv/TvPlayerControls';
import { MobilePlayerControls, type MobileShortcut } from './MobilePlayerControls';
import { mobilePlaybackTimeline, mobileSeekFraction } from '../core/mobilePlayback';
import { useSleepPlayback, useSleepTimer } from './SleepTimer';

const buffers = {
  fast: { preferredForwardBufferDuration: 8, minBufferForPlayback: 1 },
  balanced: { preferredForwardBufferDuration: 20, minBufferForPlayback: 2 },
  stable: { preferredForwardBufferDuration: 40, minBufferForPlayback: 4 },
};

type Props = {
  channel: Channel;
  profile: BufferProfile;
  paddingAfter?: number;
  fullscreen: boolean;
  onFullscreenChange: (value: boolean) => void;
  onClose: () => void;
  programme?: { title: string; stop: number };
  onFirstPlaying?: (channelId: string) => void;
  onOpenGuide?: () => void;
  onOpenChannelNumber?: () => void;
  previousChannelName?: string;
  onPreviousChannel?: () => void;
  onNextChannel?: () => void;
  onPreviousInLineup?: () => void;
};

// A new session owns a single native player. Changing channel or retrying unmounts
// it completely, preventing late errors from a previous stream from leaking in.
export function LivePlayer(props: Props) {
  useSleepPlayback(props.onClose);
  const capture = useDvrSession(props.channel);
  const [generation, setGeneration] = useState(0);
  const attempts = useRef(0);
  const anchor = useRef<{ positionMs: number; paused: boolean } | undefined>(undefined);
  const [diagnosis, setDiagnosis] = useState<Diagnosis>();
  const recordDiagnosis = useCallback((value: Diagnosis) => setDiagnosis(value), []);
  const restart = useCallback((reset: boolean) => {
    if (reset) attempts.current = 0;
    setGeneration(g => g + 1);
  }, []);
  if (usesTvPlayer && (capture.error || capture.pending)) return <View style={[s.container, s.fullscreen]}><TvPlayerControls title={props.channel.name} badge={capture.error ? 'UNAVAILABLE' : 'CONNECTING'} message={capture.error || 'Preparing playback…'} settled={false} paused={false} onClose={props.onClose}
    actions={[...(capture.error ? [{ id: 'retry', label: 'Retry', run: capture.retry }] : []), { id: 'close', label: 'Channels', run: props.onClose }]}
    options={props.onOpenChannelNumber ? [{ id: 'number', label: 'Find channel by number', run: props.onOpenChannelNumber }] : []} /></View>;
  if (capture.error || capture.pending) return <View style={[s.container, props.fullscreen && s.fullscreen, { padding: 20, gap: 12 }]}>
    <Text style={s.title}>{props.channel.name}</Text>{capture.pending && <ActivityIndicator color="#a7eccb" />}
    <Text style={s.detail}>{capture.error || 'Preparing pause, rewind, and recording…'}</Text>
    <View style={s.controls}>{!!capture.error && <Pressable accessibilityRole="button" accessibilityLabel="Retry DVR" onPress={capture.retry} style={s.control}><Text style={s.controlText}>Retry</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Close player" onPress={props.onClose} style={s.control}><Text style={s.controlText}>Close</Text></Pressable></View>
  </View>;
  return <PlayerSession {...props} key={`${capture.snapshot?.sessionId ?? 'direct'}:${generation}`} capture={capture.fallback ? undefined : capture.snapshot} dvrUnavailable={capture.fallback} anchor={anchor} attempts={attempts} restart={restart} diagnosis={diagnosis} recordDiagnosis={recordDiagnosis} />;
}

function PlayerSession({ channel, profile, paddingAfter = 0, fullscreen, onFullscreenChange, onClose, programme, onFirstPlaying, onOpenGuide, onOpenChannelNumber, previousChannelName, onPreviousChannel, onNextChannel, onPreviousInLineup, attempts, restart, diagnosis, recordDiagnosis, capture, dvrUnavailable, anchor }: Props & {
  attempts: React.RefObject<number>;
  restart: (reset: boolean) => void;
  diagnosis?: Diagnosis;
  recordDiagnosis: (value: Diagnosis) => void;
  capture?: DvrSnapshot;
  dvrUnavailable: string;
  anchor: React.RefObject<{ positionMs: number; paused: boolean } | undefined>;
}) {
  const sleep = useSleepTimer();
  const [media, setMedia] = useState<{ duration: number; position: number }>();
  const [speed, setSpeed] = useState(1);
  const [looping, setLooping] = useState(false);
  const [contentFit, setContentFit] = useState<'contain' | 'cover' | 'fill'>('contain');
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
  const [settled, setSettled] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [panelHeight, setPanelHeight] = useState(100);
  const [screenReader, setScreenReader] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [dvrNotice, setDvrNotice] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const [interaction, setInteraction] = useState(0);
  const reportedPlaying = useRef(false);
  const [recordingId, setRecordingId] = useState(capture?.recordingId);
  useEffect(() => setRecordingId(capture?.recordingId), [capture?.recordingId]);
  const pausedAt = useRef<number | undefined>(anchor.current?.paused ? anchor.current.positionMs : undefined);
  const initialAnchor = useRef(anchor.current);
  const liveDelay = capture && positionMs ? Math.max(0, (capture.endMs - positionMs) / 1000) : 0;
  const delayed = !!capture && liveDelay > 12;
  const [mobileTimeshifted, setMobileTimeshifted] = useState(!!anchor.current && (anchor.current.paused || !!capture && capture.endMs - anchor.current.positionMs > 12_000));
  const warning = capture && paused ? bufferWarning(pausedAt.current ?? positionMs, capture) : '';
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const panelExpansion = useRef(new Animated.Value(1)).current;
  const compact = settled && playing && !paused && !failed;
  useEffect(() => {
    let mounted = true;
    // React Native Web reports true unconditionally; it cannot detect a reader.
    // Keep the reveal button accessible there, and honor native reader status.
    if (Platform.OS !== 'web') void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (mounted) setScreenReader(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; reader.remove(); motion.remove(); };
  }, []);
  useEffect(() => { setControlsVisible(!compact || screenReader); }, [compact, screenReader]);
  useEffect(() => {
    if (!compact || !controlsVisible || showOptions || showDiagnosis || screenReader) return;
    const hide = setTimeout(() => setControlsVisible(false), 2200);
    return () => clearTimeout(hide);
  }, [compact, controlsVisible, showOptions, showDiagnosis, screenReader, interaction]);
  useEffect(() => {
    const fade = Animated.timing(chromeOpacity, { toValue: controlsVisible || screenReader ? 1 : 0, duration: reduceMotion ? 0 : 220, useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [chromeOpacity, controlsVisible, reduceMotion, screenReader]);
  useEffect(() => {
    const collapse = Animated.timing(panelExpansion, { toValue: compact ? 0 : 1, duration: reduceMotion ? 0 : 260, useNativeDriver: false });
    collapse.start();
    return () => collapse.stop();
  }, [compact, panelExpansion, reduceMotion]);
  const probeController = useRef<AbortController | undefined>(undefined);
  const evidence = useRef<PlaybackEvidence>({ online: true, state: 'idle', bufferSeconds: null, stalledMs: 0, eventLoopDelayMs: 0, hasProgress: false });
  const intended = useRef(!anchor.current?.paused);
  const active = useRef(AppState.currentState === 'active');
  const online = useRef(true);
  const retrying = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const videoView = useRef<VideoView>(null);
  const nativeFullscreen = useRef(false);
  const resetWatchdog = useRef(false);
  const pip = useRef(new PipHandoff());
  const pipRequestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [pipSupported] = useState(() => Platform.OS === 'android' && isPictureInPictureSupported());
  const canMinimize = pipSupported && playing && !paused && !failed;
  const autoPipEnabled = canMinimize && Number(Platform.Version) >= 31;
  const autoPip = useRef(false);
  autoPip.current = autoPipEnabled;
  // Web's <video src> must agree with the first React render: imperatively
  // replacing a null source and then rendering its URL reloads/pauses the tag.
  // Native keeps deferred loading so listeners capture immediate source errors.
  const player = useVideoPlayer(Platform.OS === 'web' ? { uri: channel.url, headers: channel.headers, contentType: channel.kind } : null, p => {
    p.bufferOptions = { ...buffers[profile], waitsToMinimizeStalling: true, prioritizeTimeOverSizeThreshold: true, maxBufferBytes: 48 * 1024 * 1024 };
    p.timeUpdateEventInterval = 1;
    p.staysActiveInBackground = false;
  });
  const currentPosition = useCallback(() => {
    const c = captureRef.current;
    if (!c) return 0;
    return player.currentLiveTimestamp ?? c.startMs + player.currentTime * 1000;
  }, [player]);
  const seekPosition = (targetMs: number) => {
    const c = captureRef.current;
    if (!c) return;
    const start = playbackWindow(player.currentLiveTimestamp, player.currentTime, c.startMs);
    // expo-video caches duration at track/state changes; it can be much older
    // than a growing HLS window. Clamp against captured footage instead, or
    // a later pause position gets incorrectly truncated to that old duration.
    const target = dvrSeekTarget(Math.max(c.startMs, Math.min(c.endMs - 250, targetMs)), start, Math.max(0, (c.endMs - start) / 1000));
    player.currentTime = target.seconds;
    const chosen = start + target.seconds * 1000;
    if (!intended.current) pausedAt.current = chosen;
    anchor.current = { positionMs: chosen, paused: !intended.current };
    setPositionMs(chosen); resetWatchdog.current = true; setControlsVisible(true); setInteraction(value => value + 1);
  };
  const goLive = () => {
    if (!captureRef.current) { restart(true); return; }
    seekPosition(captureRef.current.endMs - 3000);
    setMobileTimeshifted(false);
    pausedAt.current = undefined; intended.current = true; setPaused(false); player.play(); setControlsVisible(true);
  };
  const reconcilePlayback = useCallback(() => {
    setPlaying(player.playing);
    // Buffering or a native error is not evidence of a user pause.
    if (player.status === 'readyToPlay' && !stopped.current && !retrying.current) {
      intended.current = player.playing;
      setPaused(!player.playing);
      if (!player.playing) {
        setState('Paused');
        setDetail(captureRef.current ? 'Resume continues from your paused position.' : 'Resume continues if the provider still has this footage.');
      }
    }
  }, [player]);

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
      setSettled(false);
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
      else if (event.status === 'loading') { healthySince = 0; setSettled(false); setState('Buffering'); setDetail('Building a playback buffer…'); }
      else if (event.status === 'readyToPlay') {
        const saved = initialAnchor.current;
        if (saved && captureRef.current) {
          const c = captureRef.current;
          const start = playbackWindow(player.currentLiveTimestamp, player.currentTime, c.startMs);
          const target = dvrSeekTarget(saved.positionMs, start, Math.max(0, (c.endMs - start) / 1000));
          player.currentTime = target.seconds;
          if (saved.positionMs < c.startMs) setDvrNotice('Your saved position expired. Playback starts at the oldest available footage.');
          setPaused(saved.paused); intended.current = !saved.paused;
          if (saved.paused) player.pause();
          initialAnchor.current = undefined;
        }
        setHasCc(player.availableSubtitleTracks.length > 0);
        setAudioCount(player.availableAudioTracks.length);
      }
    });
    const playingSubscription = player.addListener('playingChange', event => { if (mounted) { setPlaying(event.isPlaying); if (!event.isPlaying) setSettled(false); } });
    const ended = player.addListener('playToEnd', () => {
      if (captureRef.current?.ended) { intended.current = false; setPaused(true); setSettled(false); setState('Ended'); setDetail('End of the saved video. Rewind to watch it again.'); }
      else recover('Live stream ended');
    });
    const app = AppState.addEventListener('change', next => {
      // Android presents a separate native fullscreen Activity. Its lifecycle
      // owns background pausing while React Native's Activity/JS is suspended.
      // Treating that handoff as leaving the app pauses the fullscreen video.
      if (Platform.OS === 'android' && nativeFullscreen.current) return;
      active.current = next === 'active';
      lastTick = Date.now();
      if (!active.current) {
        clearRetry(); retrying.current = false; healthySince = 0;
        // Android's PiP event can arrive after AppState's background event.
        // Let the native lifecycle own this handoff; onStop pauses the player
        // if PiP is denied, dismissed, or the screen is locked.
        if (!pip.current.background(autoPip.current)) {
          if (captureRef.current && pausedAt.current == null) pausedAt.current = currentPosition();
          player.pause();
        }
      } else if (pip.current.foreground()) {
        resetWatchdog.current = true;
        // Keep the same stream when expanding the floating window.
        if (player.status === 'error' && intended.current && online.current) restart(false);
        else reconcilePlayback();
      } else if (captureRef.current) {
        resetWatchdog.current = true;
        if (intended.current && player.status !== 'error') {
          if (pausedAt.current != null) {
            if (pausedAt.current < captureRef.current.startMs) setDvrNotice('Your saved position expired. Resuming at the oldest available footage.');
            seekPosition(pausedAt.current); pausedAt.current = undefined;
          }
          setPaused(false); player.play();
        } else reconcilePlayback();
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
        if (captureRef.current) { setDvrNotice('Connection lost. Saved footage can still play while capture reconnects.'); return; }
        clearRetry(); retrying.current = false; healthySince = 0;
        player.pause(); setSettled(false); setState('Offline'); setDetail('Playback will reconnect when your connection returns.');
        recordDiagnosis(diagnosePlayback(evidence.current));
      } else if (!wasOnline && intended.current && active.current && !stopped.current) {
        if (captureRef.current) { resetWatchdog.current = true; player.play(); }
        else restart(true);
      }
    };
    const network = Network.addNetworkStateListener(onNetwork);
    void Network.getNetworkStateAsync().then(onNetwork).catch(() => {});
    const tick = setInterval(() => {
      if (Platform.OS === 'android' && (nativeFullscreen.current || pip.current.inPip)) return;
      if (captureRef.current) {
        const position = pausedAt.current ?? currentPosition();
        if (position > 0) { setPositionMs(position); anchor.current = { positionMs: position, paused: !intended.current }; }
      } else if (channel.kind === 'progressive' && !player.isLive && Number.isFinite(player.duration) && player.duration > 0) {
        setMedia({ duration: player.duration, position: player.currentTime });
      }
      const tickTime = Date.now();
      // Android suspends JS in native fullscreen. Time spent there is neither
      // a playback stall nor a delayed app-controls timer.
      if (resetWatchdog.current) {
        lastPosition = player.currentTime;
        lastProgress = lastTick = tickTime;
        healthySince = 0;
        evidence.current.stalledMs = 0;
        evidence.current.eventLoopDelayMs = 0;
        resetWatchdog.current = false;
      }
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
        if (now - healthySince >= 2000) {
          setSettled(true);
          if (!reportedPlaying.current) { reportedPlaying.current = true; onFirstPlaying?.(channel.id); }
        }
        if (now - healthySince >= HEALTHY_RESET_MS) attempts.current = 0;
        setState('Playing'); setDetail(''); setPlaying(player.playing);
        setLive(player.isLive);
        const offset = player.currentOffsetFromLive;
        const track = player.videoTrack;
        const buffer = Math.max(0, player.bufferedPosition - position);
        setMetrics([track?.size?.height ? `${track.size.height}p` : '', `${Math.round(buffer)}s buffered`, offset != null && offset >= 0 ? `~${Math.round(offset)}s live delay` : ''].filter(Boolean).join(' · '));
      } else {
        healthySince = 0;
        if (now - lastProgress >= 2500) setSettled(false);
        if (now - lastProgress >= STALL_TIMEOUT_MS) recover('Playback stalled');
      }
    }, 1000);
    // Attach listeners before asynchronous source loading so even immediate
    // authentication/codec failures are classified and shown accurately.
    const source = captureRef.current ? { uri: captureRef.current.uri, contentType: 'hls' as const } : { uri: channel.url, headers: channel.headers, contentType: channel.kind };
    void player.replaceAsync({ ...source, useCaching: false }).then(() => {
      if (mounted && intended.current && active.current && online.current && !stopped.current && !retrying.current) player.play();
    }).catch(error => recover(error instanceof Error ? error.message : 'Playback failed'));
    return () => {
      // The hook may already have released the native object during unmount.
      // The last observed anchor is sufficient for recovery if it has.
      if (captureRef.current) try { anchor.current = { positionMs: pausedAt.current ?? currentPosition(), paused: !intended.current }; } catch { }
      mounted = false; clearRetry(); clearInterval(tick);
      if (pipRequestTimer.current) clearTimeout(pipRequestTimer.current);
      probeController.current?.abort();
      probeController.current = undefined;
      status.remove(); playingSubscription.remove(); ended.remove(); app.remove(); network.remove();
    };
  }, [player, attempts, restart, channel, recordDiagnosis, reconcilePlayback, anchor, currentPosition, onFirstPlaying]);

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
    if (!intended.current) {
      const c = captureRef.current;
      if (c && pausedAt.current != null) {
        if (pausedAt.current < c.startMs) setDvrNotice('Your paused position expired. Resuming at the oldest available footage.');
        seekPosition(pausedAt.current);
      }
      pausedAt.current = undefined; intended.current = true; setPaused(false); resetWatchdog.current = true; player.play(); return;
    }
    if (captureRef.current) { pausedAt.current = currentPosition(); if (!usesTvPlayer) setMobileTimeshifted(true); }
    intended.current = false;
    if (timer.current) clearTimeout(timer.current);
    player.pause(); setSettled(false); setPaused(true); setPlaying(false); setState('Paused'); setDetail(captureRef.current ? 'Resume continues from your paused position.' : 'Resume continues if the provider still has this footage.');
  };
  const toggleRecording = async (stopAt = 0) => {
    if (!dvr || !capture || recordingBusy) return;
    setRecordingBusy(true); setDvrNotice('');
    try {
      if (recordingId) { await dvr.stopRecording(recordingId); setRecordingId(undefined); setDvrNotice('Recording saved. Find it in Recordings.'); }
      else {
        if (Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        const result = await dvr.startRecording(capture.sessionId, programme?.title || channel.name, stopAt); setRecordingId(result.id); setDvrNotice('Recording started. It continues when you close the player.');
      }
    } catch (e) { setDvrNotice(e instanceof Error ? e.message : 'Recording could not start.'); }
    finally { setRecordingBusy(false); }
  };
  const toggleCc = () => {
    const next = !cc;
    player.subtitleTrack = next ? player.availableSubtitleTracks[0] ?? null : null;
    setCc(next);
  };
  const extendRecording = async () => {
    if (!dvr || !recordingId || recordingBusy) return;
    setRecordingBusy(true);
    try { const end = await dvr.extendRecording(recordingId); setDvrNotice(`Recording extended until ${new Date(end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Check upcoming conflicts in My DVR.`); }
    catch (error) { setDvrNotice(error instanceof Error ? error.message : 'Could not extend the recording.'); }
    finally { setRecordingBusy(false); }
  };
  const cycleAudio = () => {
    const tracks = player.availableAudioTracks;
    const index = tracks.findIndex(track => track.id === player.audioTrack?.id);
    player.audioTrack = tracks[(index + 1) % tracks.length] ?? null;
    setDetail(`Audio: ${player.audioTrack?.label || player.audioTrack?.language || 'Default'}`);
  };
  const enterFullscreen = async () => {
    if (Platform.OS === 'android') { onFullscreenChange(!fullscreen); return; }
    if (!videoView.current || nativeFullscreen.current) return;
    nativeFullscreen.current = true;
    try {
      await videoView.current.enterFullscreen();
    } catch {
      nativeFullscreen.current = false;
      setDetail('Fullscreen could not open. Please try again.');
    }
  };
  const exitFullscreen = () => {
    nativeFullscreen.current = false;
    resetWatchdog.current = true;
    active.current = AppState.currentState === 'active';
    reconcilePlayback();
  };
  const minimize = useCallback(async () => {
    if (!pipSupported || !videoView.current || !player.playing || !intended.current || stopped.current || retrying.current || pip.current.requested || pip.current.inPip) return;
    pip.current.request();
    const unavailable = () => {
      pip.current.cancelRequest();
      setDetail('Could not minimize. Allow picture-in-picture for Stillwave in Android settings, then try again.');
    };
    try {
      await videoView.current.startPictureInPicture();
      // Android can decline PiP without rejecting the native API call.
      if (!pip.current.inPip) pipRequestTimer.current = setTimeout(() => {
        if (!pip.current.inPip && active.current) unavailable();
      }, 1500);
    } catch { unavailable(); }
  }, [player, pipSupported]);
  useEffect(() => {
    if (Platform.OS !== 'android' || isTv) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fullscreen) { onFullscreenChange(false); return true; }
      if (!pipSupported) return false;
      if (nativeFullscreen.current || !player.playing || !intended.current || stopped.current || retrying.current) return false;
      void minimize();
      return true;
    });
    return () => back.remove();
  }, [player, pipSupported, minimize, fullscreen, onFullscreenChange]);
  const startPip = () => {
    pip.current.enter();
    if (pipRequestTimer.current) clearTimeout(pipRequestTimer.current);
    resetWatchdog.current = true;
  };
  const stopPip = () => {
    pip.current.stop();
    resetWatchdog.current = true;
    // Do not infer dismissal from AppState here: Android can deliver PiP stop
    // before the foreground event when expanding. Native onStop owns dismissal.
    if (AppState.currentState === 'active') reconcilePlayback();
  };
  const badge = paused ? 'PAUSED' : failed ? 'UNAVAILABLE' : state === 'Playing' ? delayed ? `${clock(liveDelay)} BEHIND LIVE` : live ? 'LIVE' : 'PLAYING' : state.toUpperCase();
  const tvSeek = (seconds: number) => { if (captureRef.current) seekPosition((pausedAt.current ?? currentPosition()) + seconds * 1000); else setDvrNotice('Pause and rewind are unavailable for this stream.'); };
  const tvActions: TvAction[] = [
    ...(capture ? [{ id: 'rewind', label: 'Rewind 30s', icon: 'play-back' as const, run: () => tvSeek(-30) }] : []),
    { id: 'pause', label: paused ? 'Resume' : 'Pause', icon: paused ? 'play' : 'pause', run: togglePause, disabled: failed },
    ...(capture ? [{ id: 'forward', label: 'Forward 30s', icon: 'play-forward' as const, run: () => tvSeek(30) }] : []),
    { id: 'live', label: failed ? 'Retry' : capture ? 'Go live' : 'Refresh', icon: 'refresh', run: failed ? () => restart(true) : goLive },
    ...(capture ? [{ id: 'record', label: recordingId ? 'Stop recording' : 'Record', icon: recordingId ? 'stop-circle' as const : 'radio-button-on' as const, run: () => void toggleRecording(), disabled: recordingBusy || capture.ended && !recordingId }] : []),
    { id: 'channels', label: 'Channels', icon: 'list-outline', run: onClose },
  ];
  const tvOptions: TvAction[] = [
    { id: 'sleep', label: sleep.label, run: () => sleep.open(programme?.stop) },
    ...(recordingId ? [{ id: 'extend', label: 'Add 30 minutes to recording', run: () => void extendRecording(), disabled: recordingBusy }] : []),
    ...(onOpenChannelNumber ? [{ id: 'number', label: 'Find channel by number', run: onOpenChannelNumber }] : []),
    ...(onPreviousChannel ? [{ id: 'previous', label: `Previous: ${previousChannelName}`, icon: 'swap-horizontal' as const, run: onPreviousChannel }] : []),
    ...(capture && !recordingId && !capture.ended ? [{ id: 'record30', label: 'Record 30 minutes', run: () => void toggleRecording(Date.now() + 30 * 60_000), disabled: recordingBusy },
      ...(programme && programme.stop > Date.now() ? [{ id: 'recordShow', label: `Record until program ends${paddingAfter ? ` + ${paddingAfter} min` : ''}`, run: () => void toggleRecording(programme.stop + paddingAfter * 60_000), disabled: recordingBusy }] : [])] : []),
    ...(hasCc ? [{ id: 'cc', label: `Captions: ${cc ? 'On' : 'Off'}`, run: toggleCc }] : []),
    ...(audioCount > 1 ? [{ id: 'audio', label: 'Change audio language', run: cycleAudio }] : []),
    { id: 'diagnose', label: 'Diagnose playback', run: () => { const result = diagnosePlayback(evidence.current); setDvrNotice(`${result.title}. ${result.explanation}`); } },
    { id: 'probe', label: probing ? 'Checking server…' : 'Check server response', run: () => void checkSource(), disabled: probing },
  ];
  const touchInteraction = () => { setControlsVisible(true); setInteraction(value => value + 1); };
  const mobileSeek = (seconds: number) => {
    if (capture) {
      if (seconds > 0 && mobilePlaybackTimeline({ progress: 1, delayed: delayed || mobileTimeshifted, ended: capture.ended }, paused, 0).atLive) return;
      if (seconds < 0) setMobileTimeshifted(true);
      const target = (pausedAt.current ?? currentPosition()) + seconds * 1000;
      if (!paused && seconds > 0 && target >= capture.endMs - 3000) { goLive(); return; }
      tvSeek(seconds);
    }
    else if (media) { const position = Math.max(0, Math.min(media.duration, player.currentTime + seconds)); player.currentTime = position; setMedia({ ...media, position }); resetWatchdog.current = true; }
  };
  const mobileShortcuts: MobileShortcut[] = [
    { id: 'rotation', label: 'Rotation', icon: 'phone-landscape-outline', run: () => void enterFullscreen(), disabled: isTv },
    { id: 'speed', label: `${speed}× Speed`, icon: 'speedometer-outline', run: () => { const rates = [.5, .75, 1, 1.25, 1.5, 2]; const next = rates[(rates.indexOf(speed) + 1) % rates.length]!; player.playbackRate = next; setSpeed(next); } },
    { id: 'pip', label: 'PiP Play', icon: 'browsers-outline', run: () => void minimize(), disabled: !canMinimize },
    { id: 'audio', label: 'Audio', icon: 'headset-outline', run: cycleAudio, disabled: audioCount < 2 },
    { id: 'loop', label: 'Loop', icon: 'repeat', run: () => { player.loop = !looping; setLooping(!looping); }, selected: looping, disabled: !media || !!capture },
    { id: 'live', label: failed ? 'Retry' : capture ? 'Go live' : 'Refresh', icon: 'refresh', run: failed ? () => restart(true) : goLive },
    { id: 'record', label: recordingId ? 'Stop rec' : 'Record', icon: recordingId ? 'stop-circle' : 'radio-button-on', run: () => void toggleRecording(), selected: !!recordingId, disabled: !capture || recordingBusy || !!capture.ended && !recordingId },
    { id: 'guide', label: 'Guide', icon: 'list-outline', run: () => onOpenGuide?.(), disabled: !onOpenGuide },
  ];
  return <View style={[s.container, fullscreen && s.fullscreen]}>
    <View style={[s.videoArea, fullscreen && s.fullscreenVideo]}>
      <VideoView ref={videoView} player={player} nativeControls={false} playsInline contentFit={usesTvPlayer ? 'contain' : contentFit} style={s.video}
        fullscreenOptions={{ enable: true, orientation: 'landscape', autoExitOnRotate: false }}
        onFullscreenExit={exitFullscreen} controllerAutoShow={false}
        allowsPictureInPicture={pipSupported} startsPictureInPictureAutomatically={autoPipEnabled}
        onPictureInPictureStart={startPip} onPictureInPictureStop={stopPip}
        buttonOptions={{ showSeekBackward: false, showSeekForward: false, showNext: false, showPrevious: false }}
        requiresLinearPlayback={!capture} showsTimecodes={false} allowsVideoFrameAnalysis={false} />
      {!playing && !paused && !failed && <View pointerEvents="none" style={s.loading}><ActivityIndicator color="#a8eece" /><Text style={s.overlayText}>{state}</Text></View>}
      {usesTvPlayer ? <TvPlayerControls title={channel.name} subtitle={programme?.title} badge={`${recordingId ? 'REC · ' : ''}${badge}`} message={warning || dvrNotice || probe || (failed ? detail : '')}
        actions={tvActions} options={tvOptions} settled={settled} paused={paused} onClose={onClose} onPause={togglePause} onSeek={tvSeek} /> : <MobilePlayerControls title={channel.name} number={channel.number} programme={programme?.title} badge={badge} fullscreen={fullscreen}
        paused={paused} failed={failed} visible={controlsVisible} screenReader={screenReader} opacity={chromeOpacity}
        dvr={capture ? { duration: capture.duration, progress: Math.max(0, Math.min(1, (positionMs - capture.startMs) / Math.max(1, capture.endMs - capture.startMs))), delay: liveDelay, delayed: delayed || mobileTimeshifted, ended: capture.ended } : undefined}
        media={media} shortcuts={mobileShortcuts} hasCc={hasCc} cc={cc} onCaptions={toggleCc} onPrevious={onPreviousInLineup || onPreviousChannel} onNext={onNextChannel}
        onAspectRatio={() => { const fits = ['contain', 'cover', 'fill'] as const; setContentFit(fits[(fits.indexOf(contentFit) + 1) % fits.length]!); }}
        onToggleControls={() => { setControlsVisible(value => !value); setInteraction(value => value + 1); }} onInteract={touchInteraction}
        onPause={togglePause} onSeek={mobileSeek} onSeekFraction={fraction => {
          const c = captureRef.current;
          if (c) {
            const position = pausedAt.current ?? currentPosition();
            const current = { progress: (position - c.startMs) / Math.max(1, c.endMs - c.startMs), delayed: delayed || mobileTimeshifted, ended: c.ended };
            const chosen = mobileSeekFraction(fraction, current, paused);
            const target = c.startMs + chosen * (c.endMs - c.startMs);
            if (!paused && !c.ended && !mobilePlaybackTimeline(current, paused, 0).atLive && chosen >= 1) { goLive(); return; }
            if (target < position - 250) setMobileTimeshifted(true);
            seekPosition(target);
          } else if (media) { const position = media.duration * fraction; player.currentTime = position; setMedia({ ...media, position }); resetWatchdog.current = true; }
        }}
        onGoLive={failed ? () => restart(true) : goLive} onOptions={() => setShowOptions(true)} onClose={onClose} />}
    </View>
    {!usesTvPlayer && <>
    {!!(warning || dvrNotice) && <Pressable accessibilityRole="button" accessibilityLabel="Dismiss DVR message" onPress={() => setDvrNotice('')} style={s.dvrNotice}><Text accessibilityRole="alert" style={s.detail}>{warning || dvrNotice}</Text></Pressable>}
    <Animated.View testID="player-status-panel" pointerEvents={compact || fullscreen ? 'none' : 'auto'} accessibilityElementsHidden={compact || fullscreen} importantForAccessibility={compact || fullscreen ? 'no-hide-descendants' : 'auto'} style={{ height: fullscreen ? 0 : panelExpansion.interpolate({ inputRange: [0, 1], outputRange: [0, panelHeight] }), opacity: panelExpansion, overflow: 'hidden' }}>
      <View onLayout={event => setPanelHeight(Math.ceil(event.nativeEvent.layout.height))} style={s.statusPanel}>
        <Text style={s.statusName} numberOfLines={1}>{channel.name}</Text><Text style={s.detail}>{detail || metrics || channel.group}</Text>
        {(failed || state === 'Reconnecting' || state === 'Offline') && <Pressable accessibilityRole="button" accessibilityLabel="Why is this channel not playing?" onPress={inspect} style={s.textAction}><Ionicons name="pulse-outline" size={18} color="#a8eece" /><Text style={s.controlText}>{diagnosis?.title ?? 'Playback check'} · Diagnose</Text></Pressable>}
      </View>
    </Animated.View>
    <Modal visible={showOptions} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowOptions(false)}><SafeAreaView style={s.diagnosticScreen}><ScrollView contentContainerStyle={s.diagnosticContent}>
      <View style={s.titleRow}><Text style={s.title}>Player options</Text><Pressable accessibilityRole="button" accessibilityLabel="Close player options" onPress={() => setShowOptions(false)} style={s.icon}><Ionicons name="close" size={25} color="#d6e4e1" /></Pressable></View>
      <Text style={s.diagnosticTitle}>{channel.name}</Text><Text style={s.diagnosticBody}>{detail || metrics || channel.group}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={sleep.label} onPress={() => { setShowOptions(false); sleep.open(programme?.stop); }} style={s.control}><Text style={s.controlText}>{sleep.label}</Text></Pressable>
      {!!recordingId && <Pressable accessibilityRole="button" disabled={recordingBusy} onPress={() => void extendRecording()} style={s.control}><Text style={s.controlText}>Add 30 minutes to recording</Text></Pressable>}
      {onOpenChannelNumber && <Pressable accessibilityRole="button" accessibilityLabel="Find channel by number" onPress={() => { setShowOptions(false); onOpenChannelNumber(); }} style={s.control}><Text style={s.controlText}>Find channel by number</Text></Pressable>}
      {onOpenGuide && <Pressable accessibilityRole="button" accessibilityLabel="Open mini guide" onPress={() => { setShowOptions(false); onOpenGuide(); }} style={s.control}><Text style={s.controlText}>Mini guide · browse without leaving the video</Text></Pressable>}
      {previousChannelName && <Pressable accessibilityRole="button" accessibilityLabel={`Previous channel ${previousChannelName}`} onPress={() => { setShowOptions(false); onPreviousChannel?.(); }} style={s.control}><Text style={s.controlText}>Previous · {previousChannelName}</Text></Pressable>}
      {!!dvrUnavailable && <Text style={s.diagnosticBody}>{dvrUnavailable}</Text>}
      {capture && <View style={s.diagnosticBox}><Text style={s.diagnosticLabel}>PAUSE, REWIND & RECORD</Text><Text style={s.diagnosticBody}>{clock(capture.duration)} saved · up to 30 minutes or 512 MiB. Resume stays behind live. Go live returns to the broadcast.</Text>
        {!!capture.error && <Text style={s.diagnosticBody}>{capture.error}</Text>}
        <View style={s.controls}><Pressable accessibilityRole="button" disabled={recordingBusy || capture.ended && !recordingId} onPress={() => void toggleRecording()} style={s.control}><Text style={s.controlText}>{recordingId ? 'Stop and save recording' : 'Record until I stop'}</Text></Pressable>
          {!recordingId && !capture.ended && <><Pressable accessibilityRole="button" disabled={recordingBusy} onPress={() => void toggleRecording(Date.now() + 30 * 60_000)} style={s.control}><Text style={s.controlText}>Record 30 minutes</Text></Pressable>{programme && programme.stop > Date.now() && <Pressable accessibilityRole="button" disabled={recordingBusy} onPress={() => void toggleRecording(programme.stop + paddingAfter * 60_000)} style={s.control}><Text style={s.controlText}>Record until program ends{paddingAfter ? ` + ${paddingAfter} min` : ''}</Text></Pressable>}</>}
        </View><Text style={s.diagnosticBody}>Recordings save the incoming live broadcast, even while you watch behind live. Recording continues when you leave the player. Stop it in Recordings. This release captures one channel at a time. Android may limit background recording time.</Text></View>}
      <View style={s.controls}>
        {hasCc ? <Pressable accessibilityRole="button" accessibilityLabel="Toggle captions" accessibilityState={{ selected: cc }} onPress={toggleCc} style={s.control}><Text style={[s.controlText, cc && { color: '#a8eece' }]}>CC · {cc ? 'On' : 'Off'}</Text></Pressable> : <Text style={s.diagnosticBody}>No caption track is available for this stream.</Text>}
        {audioCount > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Change audio language" onPress={cycleAudio} style={s.control}><Ionicons name="language-outline" size={19} color="#d6e4e1" /><Text style={s.controlText}>Audio language</Text></Pressable>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Why is this channel not playing?" onPress={() => { setShowOptions(false); inspect(); }} style={s.control}><Ionicons name="pulse-outline" size={18} color="#d6e4e1" /><Text style={s.controlText}>Diagnose playback</Text></Pressable>
      <Text style={s.diagnosticBody}>Tap the video to show its controls. They fade away once playback is running smoothly.</Text>
    </ScrollView></SafeAreaView></Modal>
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
    </>}
  </View>;
}

const s = StyleSheet.create({
  dvrCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, left: '50%', marginLeft: -100, width: 200, marginTop: -22 },
  skipText: { color: '#fff', fontSize: 8, position: 'absolute', bottom: 3 },
  timeline: { position: 'absolute', top: 28, left: 60, right: 60 }, timelineTouch: { height: 16, justifyContent: 'center' }, timelineTrack: { height: 4, backgroundColor: '#ffffff55', borderRadius: 2 }, timelineFill: { height: 4, backgroundColor: '#a7eccb', borderRadius: 2 }, timelineLabels: { flexDirection: 'row', justifyContent: 'space-between' }, timelineText: { color: '#fff', fontSize: 10, textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }, dvrNotice: { padding: 10, backgroundColor: '#19342b' },
  fullscreen: { flex: 1, marginBottom: 0, borderRadius: 0, backgroundColor: '#000' }, fullscreenVideo: { flex: 1, aspectRatio: undefined },
  videoChrome: { ...StyleSheet.absoluteFill, backgroundColor: '#0003' }, videoHeading: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 5 }, overlayName: { color: '#fff', fontSize: 12, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }, topSide: { width: 44 }, videoButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#061012aa' }, centerControl: { position: 'absolute', top: '50%', left: '50%', marginLeft: -26, marginTop: -26 }, refreshButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#061012aa', justifyContent: 'center', alignItems: 'center' }, videoBottom: { position: 'absolute', left: 8, right: 8, bottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, bottomSide: { flex: 1 }, statusPanel: { position: 'absolute', left: 0, right: 0, top: 0, padding: 14, gap: 5 }, statusName: { color: '#e0eee7', fontSize: 15, fontWeight: '600' }, textAction: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 },
  container: { backgroundColor: '#0e1a1c', borderRadius: 20, overflow: 'hidden', marginBottom: 18 },
  videoArea: { aspectRatio: 16 / 9, minHeight: isTv ? 188 : 224, backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#0006' },
  overlayText: { color: '#d6e4e1', fontSize: 12 },
  videoTop: { position: 'absolute', top: 6, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#071012cc', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottom: { padding: 15, paddingTop: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#ecf5f2', fontSize: 18, fontWeight: '700', flex: 1 },
  detail: { color: '#93a9a7', fontSize: 12, lineHeight: 18 },
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
