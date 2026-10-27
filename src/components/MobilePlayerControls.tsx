import { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clock } from '../core/dvr';

export type MobileShortcut = { id: string; label: string; icon: keyof typeof Ionicons.glyphMap; run: () => void; disabled?: boolean; selected?: boolean };
type Props = {
  title: string; number?: string; programme?: string; badge: string; fullscreen: boolean;
  paused: boolean; failed: boolean; visible: boolean; screenReader: boolean; opacity: Animated.Value;
  dvr?: { duration: number; progress: number; delay: number; delayed: boolean };
  media?: { duration: number; position: number }; shortcuts: MobileShortcut[];
  hasCc: boolean; cc: boolean; onCaptions: () => void;
  onToggleControls: () => void; onInteract: () => void; onPause: () => void; onSeek: (seconds: number) => void;
  onSeekFraction: (fraction: number) => void; onGoLive: () => void; onOptions: () => void; onClose: () => void;
  onPrevious?: () => void; onNext?: () => void; onAspectRatio: () => void;
};
function IconButton({ label, icon, onPress, disabled, prominent, seconds, reverse }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; prominent?: boolean; seconds?: string; reverse?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [s.iconButton, prominent && s.play, pressed && s.pressed, disabled && s.disabled]}>
    <Ionicons name={icon} size={prominent ? 34 : 27} color="#fff" style={reverse ? { transform: [{ scaleX: -1 }] } : undefined} />
    {!!seconds && <Text pointerEvents="none" style={s.seconds}>{seconds}</Text>}
  </Pressable>;
}
/** Reference layout: shortcuts across the top; timeline and transport on the video. */
export function MobilePlayerControls(p: Props) {
  const insets = useSafeAreaInsets();
  const [timelineWidth, setTimelineWidth] = useState(1), [width, setWidth] = useState(390), [locked, setLocked] = useState(false);
  const lastScrub = useRef(0);
  const act = (fn: () => void) => () => { p.onInteract(); fn(); };
  const side = p.fullscreen ? Math.max(8, insets.left, insets.right) : 4;
  const bottom = p.fullscreen ? Math.max(8, insets.bottom) : 4;
  const duration = p.dvr?.duration ?? p.media?.duration ?? 0;
  const elapsed = p.dvr ? p.dvr.progress * duration : p.media?.position ?? 0;
  const progress = Math.max(0, Math.min(1, duration ? elapsed / duration : 0));
  const seekable = duration > 0 && !p.failed;
  const seek = (x: number) => { p.onInteract(); if (seekable) p.onSeekFraction(Math.max(0, Math.min(1, x / timelineWidth))); };
  const visible = p.visible || p.screenReader;
  if (locked) return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <View style={[s.unlock, { left: side, bottom }]}><IconButton label="Unlock player controls" icon="lock-closed" onPress={act(() => setLocked(false))} /></View>
  </View>;
  return <View testID="mobile-player-controls" onLayout={e => setWidth(e.nativeEvent.layout.width)} style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <Pressable accessibilityRole="button" accessibilityLabel={p.visible ? 'Hide video controls' : 'Show video controls'} onPress={p.onToggleControls} style={StyleSheet.absoluteFill} />
    <Animated.View pointerEvents={visible ? 'box-none' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[s.chrome, { opacity: p.opacity }]}>
      <View testID="mobile-player-topbar" style={[s.top, { left: side, right: side, top: p.fullscreen ? Math.max(4, insets.top) : 2 }]}>
        <View style={s.edgeButton}><IconButton label="Back to channels" icon="arrow-back" onPress={act(p.onClose)} /></View>
        <Text accessibilityLabel={`Channel ${p.number || ''} ${p.title}`} numberOfLines={1} style={[s.channel, !p.number && { width: 70, fontSize: 13 }]}>{p.number || p.title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.shortcuts} contentContainerStyle={s.shortcutContent}>
          {p.shortcuts.map(action => <Pressable key={action.id} accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{ disabled: !!action.disabled, selected: !!action.selected }} disabled={action.disabled}
            onPress={act(action.run)} style={({ pressed }) => [s.shortcut, action.disabled && s.disabled, pressed && s.pressed]}>
            <View style={s.shortcutCircle}><Ionicons name={action.icon} size={23} color={action.selected ? '#a7eccb' : '#fff'} /></View><Text numberOfLines={1} style={s.shortcutLabel}>{action.label}</Text>
          </Pressable>)}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle captions" accessibilityState={{ disabled: !p.hasCc, selected: p.cc }} disabled={!p.hasCc} onPress={act(p.onCaptions)} style={[s.ccButton, !p.hasCc && s.disabled]}><Text style={[s.cc, p.cc && { color: '#a7eccb' }]}>CC</Text></Pressable>
        <View style={s.edgeButton}><IconButton label="Player options" icon="ellipsis-vertical" onPress={act(p.onOptions)} /></View>
      </View>
      <View testID="mobile-player-timeline" style={[s.timeline, { left: side + 8, right: side + 8, bottom: bottom + 66 }]}>
        <Text style={s.time}>{seekable ? clock(elapsed) : p.failed ? '—' : 'LIVE'}</Text>
        {seekable ? <Pressable accessibilityRole="adjustable" accessibilityLabel="Playback timeline"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(elapsed), text: p.dvr ? `${clock(p.dvr.delay)} behind live` : `${clock(elapsed)} of ${clock(duration)}` }}
          accessibilityActions={[{ name: 'increment', label: 'Forward 10 seconds' }, { name: 'decrement', label: 'Rewind 10 seconds' }]}
          onAccessibilityAction={e => { p.onInteract(); p.onSeek(e.nativeEvent.actionName === 'increment' ? 10 : -10); }}
          onLayout={e => setTimelineWidth(Math.max(1, e.nativeEvent.layout.width))} onPress={e => seek(e.nativeEvent.locationX)}
          onTouchMove={e => { if (Date.now() - lastScrub.current < 150) return; lastScrub.current = Date.now(); seek(e.nativeEvent.locationX); }} style={s.timelineTouch}>
          <View pointerEvents="none" style={s.track}><View style={[s.fill, { width: `${progress * 100}%` }]} /><View style={[s.thumb, { left: `${progress * 100}%` }]} /></View>
        </Pressable> : <View accessibilityLabel="Seeking unavailable for this live stream" style={s.unavailableTrack}><View style={s.track} /></View>}
        {p.dvr ? <Pressable accessibilityRole="button" accessibilityLabel="Go live" onPress={act(p.onGoLive)} style={s.liveButton}><Text style={[s.time, !p.dvr.delayed && !p.paused && { color: '#a7eccb' }]}>LIVE</Text></Pressable> : <Text style={s.time}>{seekable ? clock(duration) : p.badge}</Text>}
      </View>
      <View testID="mobile-player-transport" style={[s.transport, { left: side, right: side, bottom }]}>
        <IconButton label="Lock player controls" icon="lock-open-outline" onPress={act(() => setLocked(true))} />
        {width >= 340 && <IconButton label="Previous channel" icon="play-skip-back" disabled={!p.onPrevious} onPress={act(() => p.onPrevious?.())} />}
        <IconButton label="Rewind 10 seconds" icon="refresh-outline" seconds="10" reverse disabled={!seekable} onPress={act(() => p.onSeek(-10))} />
        <IconButton prominent label={p.failed ? 'Retry stream' : p.paused ? 'Resume live TV' : 'Pause live TV'} icon={p.failed ? 'refresh' : p.paused ? 'play' : 'pause'} onPress={act(p.failed ? p.onGoLive : p.onPause)} />
        <IconButton label="Forward 10 seconds" icon="refresh" seconds="10" disabled={!seekable} onPress={act(() => p.onSeek(10))} />
        {width >= 340 && <IconButton label="Next channel" icon="play-skip-forward" disabled={!p.onNext} onPress={act(() => p.onNext?.())} />}
        <IconButton label="Change aspect ratio" icon="crop" onPress={act(p.onAspectRatio)} />
      </View>
    </Animated.View>
  </View>;
}
const s = StyleSheet.create({
  chrome: { ...StyleSheet.absoluteFill, backgroundColor: '#0003' }, top: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2, height: 64 },
  channel: { color: '#fff', fontSize: 21, width: 45, textShadowColor: '#000', textShadowRadius: 4 }, edgeButton: { width: 44 },
  iconButton: { minWidth: 44, minHeight: 56, alignItems: 'center', justifyContent: 'center', flex: 1 }, play: { flex: 0, minWidth: 62, width: 62, height: 62, minHeight: 62, borderRadius: 31, borderColor: '#fff', borderWidth: 3 },
  shortcuts: { flex: 1, minWidth: 0 }, shortcutContent: { flexGrow: 1, justifyContent: 'center', gap: 3, alignItems: 'center', paddingHorizontal: 3 }, shortcut: { width: 59, alignItems: 'center', gap: 3 },
  shortcutCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#06101288', alignItems: 'center', justifyContent: 'center' }, shortcutLabel: { color: '#fff', fontSize: 10 },
  ccButton: { minWidth: 44, minHeight: 56, justifyContent: 'center', alignItems: 'center' }, cc: { color: '#fff', fontSize: 17, fontWeight: '800', borderWidth: 1.5, borderColor: '#fff', borderRadius: 3, paddingHorizontal: 3 },
  pressed: { opacity: .65 }, disabled: { opacity: .35 }, seconds: { position: 'absolute', fontSize: 9, fontWeight: '600', color: '#fff' },
  transport: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2, height: 64 },
  timeline: { position: 'absolute', height: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }, time: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'] },
  timelineTouch: { flex: 1, height: 44, justifyContent: 'center' }, track: { height: 3, backgroundColor: '#ffffffb0' }, fill: { height: 3, backgroundColor: '#a7eccb' },
  thumb: { position: 'absolute', top: -5, width: 13, height: 13, borderRadius: 7, marginLeft: -6, backgroundColor: '#a7eccb' },
  unavailableTrack: { flex: 1, opacity: .3 }, liveButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' }, unlock: { position: 'absolute', backgroundColor: '#06101299', width: 56, borderRadius: 28 },
});
