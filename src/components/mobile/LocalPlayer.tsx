import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { classifyPlaybackError, formatDuration, resumePosition, type LocalItem, type LocalProblem } from '../../core/localMedia';
import { meshFor } from '../../core/mobileHub';
import type { MobileInsets } from '../../core/mobileDashboard';
import { MeshArt, Scrim } from '../../ui/MeshArt';
import { FONT, R, T, TYPE } from '../../ui/theme';

const SAVE_EVERY_MS = 5000;
const HIDE_AFTER_MS = 3600;

/** Plays one chosen video or audio file. Back always returns to Local Media with progress saved. */
export function LocalPlayer({ item, insets, onClose, onProgress, onProblem, onChooseAgain }: {
  item: LocalItem; insets: MobileInsets; onClose: () => void;
  onProgress: (id: string, positionMs: number, durationMs?: number) => void;
  onProblem: (id: string, problem: LocalProblem) => void; onChooseAgain: () => void;
}) {
  const player = useVideoPlayer({ uri: item.uri }, p => { p.timeUpdateEventInterval = 1; p.play(); });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [clock, setClock] = useState({ position: 0, duration: 0 });
  const [shown, setShown] = useState(true);
  const [barWidth, setBarWidth] = useState(0);
  const [failure, setFailure] = useState<LocalProblem>();
  const latest = useRef({ position: 0, duration: 0, onProgress, onProblem });
  latest.current = { ...latest.current, ...clock, onProgress, onProblem };
  const resumed = useRef(false);
  const progressKey = useRef(item.id);

  // Resume once the media is ready, unless it was nearly finished.
  useEffect(() => {
    if (status !== 'readyToPlay' || resumed.current) return;
    resumed.current = true;
    const start = resumePosition(item) / 1000;
    if (start > 0) player.currentTime = start;
  }, [status]);
  useEffect(() => {
    if (status !== 'error' || failure) return;
    const kind = classifyPlaybackError(error?.message);
    setFailure(kind); latest.current.onProblem(item.id, kind);
  }, [status, error]);
  useEffect(() => {
    const timer = setInterval(() => {
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      setClock({ position: player.currentTime, duration });
    }, 500);
    return () => clearInterval(timer);
  }, [player]);
  useEffect(() => {
    const save = () => { const c = latest.current; if (c.duration > 0 && c.position > 0) c.onProgress(progressKey.current, c.position * 1000, c.duration * 1000); };
    const timer = setInterval(save, SAVE_EVERY_MS);
    return () => { clearInterval(timer); save(); };
  }, []);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    if (Platform.OS !== 'web') return () => back.remove();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => { back.remove(); window.removeEventListener('keydown', key, true); };
  }, [onClose]);
  useEffect(() => {
    if (!shown || !isPlaying) return;
    const timer = setTimeout(() => setShown(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown, isPlaying]);

  const seekBy = (seconds: number) => { player.seekBy(seconds); setShown(true); };
  const seekTo = (fraction: number) => { if (clock.duration > 0) { player.currentTime = Math.max(0, Math.min(clock.duration, fraction * clock.duration)); setShown(true); } };
  const toggle = () => { if (isPlaying) player.pause(); else player.play(); setShown(true); };
  const onBar = (event: LayoutChangeEvent) => setBarWidth(event.nativeEvent.layout.width);
  const fraction = clock.duration > 0 ? Math.max(0, Math.min(1, clock.position / clock.duration)) : 0;
  const pad = { paddingLeft: insets.left + 20, paddingRight: insets.right + 24, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 12 };
  const loading = !failure && status !== 'readyToPlay' && status !== 'error';

  return <View style={s.root}>
    {item.kind === 'video' ? <VideoView player={player} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} contentFit="contain" nativeControls={false} playsInline />
      : <MeshArt id={meshFor(item.name)} style={StyleSheet.absoluteFill}><View style={s.audioIcon}><Ionicons name="musical-notes" size={64} color="rgba(246,243,236,0.85)" /></View>
        {/* The web player only loads media once a view exists; native audio plays without one. */}
        {Platform.OS === 'web' && <VideoView player={player} nativeControls={false} style={{ width: 1, height: 1, opacity: 0 }} />}</MeshArt>}
    <Pressable accessibilityRole="button" accessibilityLabel={shown ? 'Hide controls' : 'Show controls'} onPress={() => setShown(v => !v)} style={StyleSheet.absoluteFill} />
    {shown && !failure && <>
      <Scrim from={0.6} to={0} start={0} style={{ bottom: '55%' }} />
      <Scrim from={0} to={0.85} start={0.5} style={{ top: '45%' }} />
    </>}
    {shown && !failure && <View style={[s.top, pad]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Local Media" onPress={onClose} style={s.round}><Ionicons name="chevron-back" size={24} color={T.text} /></Pressable>
      <View style={{ flex: 1 }}><Text style={s.name} numberOfLines={1}>{item.name}</Text><Text style={s.where}>On this phone</Text></View>
    </View>}
    {shown && !failure && <View pointerEvents="box-none" style={s.mid}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back 10 seconds" onPress={() => seekBy(-10)} style={s.round}><Ionicons name="play-back" size={22} color={T.text} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} onPress={toggle} style={s.main}><Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={T.lightInk} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Forward 10 seconds" onPress={() => seekBy(10)} style={s.round}><Ionicons name="play-forward" size={22} color={T.text} /></Pressable>
    </View>}
    {shown && !failure && <View style={[s.bottom, pad]}>
      <Pressable accessibilityRole="adjustable" accessibilityLabel="Seek" accessibilityValue={{ text: `${formatDuration(clock.position * 1000)} of ${formatDuration(clock.duration * 1000)}` }} onLayout={onBar} onPress={event => barWidth > 0 && seekTo(event.nativeEvent.locationX / barWidth)} style={s.scrub}>
        <View style={s.bar}><View style={[s.barFill, { width: `${fraction * 100}%` }]} /></View>
        <View style={[s.thumb, { left: `${fraction * 100}%` }]} />
      </Pressable>
      <View style={s.times}><Text style={s.time}>{formatDuration(clock.position * 1000) || '0:00'}</Text><Text style={s.time}>{clock.duration > 0 ? `-${formatDuration((clock.duration - clock.position) * 1000)}` : ''}</Text></View>
    </View>}
    {loading && <View pointerEvents="none" style={s.center}><Text style={s.state}>Opening…</Text></View>}
    {!!failure && <View style={[s.failure, pad]}>
      <View style={s.failIcon}><Ionicons name="alert-circle-outline" size={28} color={T.warn} /></View>
      <Text style={s.failTitle}>{failure === 'moved' ? 'Can’t open this file' : 'This format isn’t supported'}</Text>
      <Text style={s.failBody}>{failure === 'moved' ? `${item.name} was moved, or access to it expired. Choose it again to restore access.` : `${item.name} uses a format this phone can’t play. Try another file.`}</Text>
      <View style={s.failActions}>
        {failure === 'moved' && <Pressable accessibilityRole="button" accessibilityLabel="Choose again" onPress={() => { onClose(); onChooseAgain(); }} style={({ pressed }) => [s.primary, pressed && { opacity: 0.8 }]}><Text style={s.primaryText}>Choose again</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Local Media" onPress={onClose} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.8 }]}><Text style={s.ghostText}>Back</Text></Pressable>
      </View>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  audioIcon: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 30 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: FONT, color: T.text, ...TYPE.headline },
  where: { fontFamily: FONT, color: T.text2, ...TYPE.caption },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,15,29,0.6)' },
  mid: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 },
  main: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: T.light },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  scrub: { height: 36, justifyContent: 'center' },
  bar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  barFill: { height: 5, backgroundColor: T.mint },
  thumb: { position: 'absolute', width: 16, height: 16, borderRadius: 8, marginLeft: -8, backgroundColor: T.mint },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontFamily: FONT, color: T.text2, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  state: { fontFamily: FONT, color: T.text2, ...TYPE.body },
  failure: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.ink },
  failIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: T.mat2 },
  failTitle: { fontFamily: FONT, color: T.text, ...TYPE.title, fontSize: 22, lineHeight: 26 },
  failBody: { fontFamily: FONT, color: T.text2, ...TYPE.body, textAlign: 'center', maxWidth: 380 },
  failActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primary: { minHeight: 46, paddingHorizontal: 22, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.light },
  primaryText: { fontFamily: FONT, color: T.lightInk, fontSize: 15, fontWeight: '700' },
  ghost: { minHeight: 46, paddingHorizontal: 22, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.glassLight },
  ghostText: { fontFamily: FONT, color: T.text, fontSize: 15, fontWeight: '700' },
});
