import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Recording } from '../../core/dvr';
import { clock } from '../../core/dvr';
import { dvr } from '../../data/dvr';
import { TvPlayerControls, type TvAction } from './TvPlayerControls';
import { MobilePlayerControls } from '../MobilePlayerControls';
import { usesTvPlayer } from '../../data/tv';
import { useSleepPlayback } from '../SleepTimer';
export function TvRecordingPlayer({ recording, onClose }: { recording: Recording & { uri: string }; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState(recording.position);
  const [message, setMessage] = useState('');
  const [screenReader, setScreenReader] = useState(false);
  const [visible, setVisible] = useState(true);
  const [interaction, setInteraction] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [fit, setFit] = useState<'contain' | 'cover' | 'fill'>('contain');
  const opacity = useRef(new Animated.Value(1)).current;
  const touch = () => { setVisible(true); setInteraction(i => i + 1); };
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(enabled => { if (mounted) setScreenReader(enabled); });
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { mounted = false; listener.remove(); };
  }, []);
  useEffect(() => { opacity.setValue(visible || screenReader ? 1 : 0); }, [visible, screenReader, opacity]);
  useEffect(() => {
    if (usesTvPlayer || screenReader || paused || !ready || !visible) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible, interaction, screenReader, paused, ready]);
  useEffect(() => { if (paused) setVisible(true); }, [paused]);
  const savedPosition = useRef(recording.position);
  const player = useVideoPlayer(null, p => { p.timeUpdateEventInterval = 1; });
  const sleep = useSleepPlayback(() => { player.pause(); onClose(); });
  useEffect(() => {
    let restored = false;
    const load = player.addListener('sourceLoad', () => { if (!restored) { restored = true; player.currentTime = Math.max(0, Math.min(recording.position, Math.max(0, player.duration - 0.5))); player.play(); } setReady(true); });
    const tick = player.addListener('timeUpdate', event => { savedPosition.current = event.currentTime; setPosition(event.currentTime); });
    const playing = player.addListener('playingChange', event => setPaused(!event.isPlaying));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') setMessage('This recording could not play. Some captured segments may be incomplete.'); });
    const ended = player.addListener('playToEnd', () => {
      savedPosition.current = player.duration || recording.duration; setPosition(savedPosition.current); setPaused(true);
      void dvr?.savePosition(recording.id, savedPosition.current).catch(() => {});
    });
    void player.replaceAsync({ uri: recording.uri, contentType: 'hls', useCaching: false }).catch(() => setMessage('Could not open this recording.'));
    const save = () => void dvr?.savePosition(recording.id, savedPosition.current).catch(() => {});
    const timer = setInterval(save, 3000);
    return () => { clearInterval(timer); save(); dvr?.releaseRecording(recording.id); load.remove(); tick.remove(); playing.remove(); status.remove(); ended.remove(); };
  }, [player, recording]);
  const pause = () => { if (player.playing) player.pause(); else player.play(); };
  const seek = (seconds: number) => { player.currentTime = Math.max(0, Math.min(player.currentTime + seconds, Math.max(0, player.duration - 0.25))); };
  const actions: TvAction[] = [
    { id: 'rewind', label: 'Rewind 30s', icon: 'play-back', run: () => seek(-30) },
    { id: 'pause', label: paused ? 'Resume' : 'Pause', icon: paused ? 'play' : 'pause', run: pause },
    { id: 'forward', label: 'Forward 30s', icon: 'play-forward', run: () => seek(30) },
    { id: 'close', label: 'Recordings', icon: 'film-outline', run: onClose },
  ];
  return <View style={s.fullscreen}><StatusBar hidden /><VideoView player={player} nativeControls={false} contentFit={fit} style={StyleSheet.absoluteFill} />
    {usesTvPlayer ? <TvPlayerControls title={recording.title} subtitle={recording.channel} badge={`${clock(position)} / ${clock(recording.duration)}`} message={message} settled={ready} paused={paused} actions={actions} options={[{ id: 'sleep', label: sleep.label, run: () => sleep.open() }]} onClose={onClose} onPause={pause} onSeek={seek} /> : <>
      {!!message && <Text accessibilityRole="alert" style={{ color: '#fff', position: 'absolute', top: 80, left: 20, right: 20 }}>{message}</Text>}
      <MobilePlayerControls title={recording.title} programme={recording.channel} badge={ready ? 'RECORDING' : 'LOADING'} fullscreen paused={paused} failed={!!message} visible={visible} screenReader={screenReader} opacity={opacity}
        media={{ duration: player.duration || recording.duration, position }} hasCc={false} cc={false} onCaptions={() => {}}
        shortcuts={[
          { id: 'sleep', label: 'Sleep timer', icon: 'moon-outline', run: () => sleep.open() },
          { id: 'speed', label: `${speed}× Speed`, icon: 'speedometer-outline', run: () => { const next = speed >= 2 ? .5 : speed + .5; player.playbackRate = next; setSpeed(next); } },
          { id: 'loop', label: 'Loop', icon: 'repeat', selected: loop, run: () => { player.loop = !loop; setLoop(!loop); } },
          { id: 'recordings', label: 'My DVR', icon: 'film-outline', run: onClose },
        ]}
        onToggleControls={() => setVisible(v => !v)} onInteract={touch} onPause={pause} onSeek={seek}
        onSeekFraction={fraction => { player.currentTime = fraction * Math.max(0, (player.duration || recording.duration) - .25); }}
        onGoLive={() => { player.currentTime = 0; player.play(); }} onOptions={() => Alert.alert(recording.title, message || `${recording.channel}\n${clock(position)} / ${clock(recording.duration)}`)}
        onAspectRatio={() => setFit(fit === 'contain' ? 'cover' : fit === 'cover' ? 'fill' : 'contain')} onClose={onClose} />
    </>}
  </View>;
}
const s=StyleSheet.create({fullscreen:{flex:1,backgroundColor:'#000'}});
