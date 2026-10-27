import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Channel } from '../../types';
import { enterChannelDigit, findNumberedChannel } from '../../core/channelNumbers';
import { useTvKeys } from '../../data/tv';
import { TvButton } from './TvUi';
import { DVR_COLORS as C } from './TvDashboard';

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'Clear'];
export function ChannelNumberPad({ channels, initial, onWatch, onGuide, onClose }: {
  channels: Channel[]; initial: string; onWatch: (channel: Channel) => void; onGuide: (channel: Channel) => void; onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const viewport = useWindowDimensions();
  const [focus, setFocus] = useState(initial ? 12 : 0);
  const channel = findNumberedChannel(channels, value);
  const press = (index: number) => {
    if (index < 12) { const key = keys[index]!; setValue(v => key === '←' ? v.slice(0, -1) : key === 'Clear' ? '' : enterChannelDigit(v, key)); }
    else if (index === 12 && channel) onWatch(channel);
    else if (index === 13 && channel) onGuide(channel);
    else if (index === 14) onClose();
  };
  useTvKeys(key => {
    if (key.startsWith('digit')) { setValue(v => enterChannelDigit(v, key.slice(5))); setFocus(12); }
    else if (key === 'back' || key === 'menu') onClose();
    else if (key === 'select') press(focus);
    else if (key === 'down') setFocus(i => i < 9 ? i + 3 : i < 12 ? 12 : Math.min(14, i + 1));
    else if (key === 'up') setFocus(i => i < 3 ? i : i < 12 ? i - 3 : i === 12 ? 10 : i - 1);
    else if (key === 'left') setFocus(i => i < 12 && i % 3 ? i - 1 : i);
    else if (key === 'right') setFocus(i => i < 12 && i % 3 < 2 ? i + 1 : i);
  });
  return <View style={s.backdrop}><View accessibilityViewIsModal style={[s.panel, { transform: [{ scale: Math.min(1, (viewport.height - 24) / 580, (viewport.width - 24) / 420) }] }]}>
    <Text style={s.title}>Find channel by number</Text>
    <Text accessibilityLabel="Channel number" style={s.number}>{value || '—'}</Text>
    <Text accessibilityLiveRegion="polite" style={s.result}>{channel ? `${channel.number} · ${channel.name}` : value ? `No channel ${Number(value)}. Enter a different number.` : 'Enter a number using the remote or this number pad.'}</Text>
    <View style={s.keys}>{keys.map((key, i) => <TvButton key={key} label={key === '←' ? 'Backspace' : key} focused={focus === i} style={s.key} onPress={() => { setFocus(i); press(i); }} />)}</View>
    <TvButton label="Watch channel" focused={focus === 12} disabled={!channel} onPress={() => press(12)} />
    <TvButton label="Show in guide" focused={focus === 13} disabled={!channel} onPress={() => press(13)} />
    <TvButton label="Cancel" focused={focus === 14} onPress={onClose} />
  </View></View>;
}
const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000b', alignItems: 'center', justifyContent: 'center' },
  panel: { width: 420, height: 580, padding: 16, backgroundColor: C.panel, borderColor: C.line, borderWidth: 1 },
  title: { color: C.text, fontSize: 22, fontWeight: '600' }, number: { color: C.accent, fontSize: 38, fontVariant: ['tabular-nums'], marginVertical: 4 },
  result: { color: C.muted, fontSize: 15, minHeight: 38, marginBottom: 8 }, keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, key: { width: '32%', justifyContent: 'center' },
});
