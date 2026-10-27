import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Recording } from '../../core/dvr';
import { clock } from '../../core/dvr';
import { dvr } from '../../data/dvr';
import { TvPlayerControls, type TvAction } from './TvPlayerControls';
export function TvRecordingPlayer({ recording, onClose }: { recording: Recording & { uri: string }; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState(recording.position);
  const [message, setMessage] = useState('');
  const savedPosition = useRef(recording.position);
  const player = useVideoPlayer(null, p => { p.timeUpdateEventInterval = 1; });
  useEffect(() => {
    let restored = false;
    const load = player.addListener('sourceLoad', () => { if (!restored) { restored = true; player.currentTime = Math.max(0, Math.min(recording.position, Math.max(0, player.duration - 0.5))); player.play(); } setReady(true); });
    const tick = player.addListener('timeUpdate', event => { savedPosition.current = event.currentTime; setPosition(event.currentTime); });
    const playing = player.addListener('playingChange', event => setPaused(!event.isPlaying));
    const status = player.addListener('statusChange', event => { if (event.status === 'error') setMessage('This recording could not play. Some captured segments may be incomplete.'); });
    const ended = player.addListener('playToEnd', () => setPaused(true));
    void player.replaceAsync({ uri: recording.uri, contentType: 'hls', useCaching: false }).catch(() => setMessage('Could not open this recording.'));
    const save = () => void dvr?.savePosition(recording.id, savedPosition.current).catch(() => {});
    const timer = setInterval(save, 3000);
    return () => { clearInterval(timer); save(); load.remove(); tick.remove(); playing.remove(); status.remove(); ended.remove(); };
  }, [player, recording]);
  const pause = () => { if (player.playing) player.pause(); else player.play(); };
  const seek = (seconds: number) => { player.currentTime = Math.max(0, Math.min(player.currentTime + seconds, Math.max(0, player.duration - 0.25))); };
  const actions: TvAction[] = [
    { id: 'rewind', label: 'Rewind 30s', icon: 'play-back', run: () => seek(-30) },
    { id: 'pause', label: paused ? 'Resume' : 'Pause', icon: paused ? 'play' : 'pause', run: pause },
    { id: 'forward', label: 'Forward 30s', icon: 'play-forward', run: () => seek(30) },
    { id: 'close', label: 'Recordings', icon: 'film-outline', run: onClose },
  ];
  return <View style={s.fullscreen}><StatusBar hidden /><VideoView player={player} nativeControls={false} contentFit="contain" style={StyleSheet.absoluteFill} />
    <TvPlayerControls title={recording.title} subtitle={recording.channel} badge={`${clock(position)} / ${clock(recording.duration)}`} message={message} settled={ready} paused={paused} actions={actions} onClose={onClose} onPause={pause} onSeek={seek} />
  </View>;
}
const s=StyleSheet.create({fullscreen:{flex:1,backgroundColor:'#000'}});
