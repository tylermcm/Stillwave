// Isolated fixtures: no user library, stream requests, or native DVR operations.
import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { TvDashboard } from '../src/components/tv/TvDashboard';
import type { TvDashboardState, TvGuideRow } from '../src/core/tvGuide';

function Preview() {
  const cutout = new URLSearchParams(location.search).get('cutout');
  const insets = { top: 0, bottom: 0, left: cutout === 'left' ? 48 : 0, right: cutout === 'right' ? 48 : 0 };
  const [favorites, setFavorites] = useState<string[]>([]);
  const [watchCount, setWatchCount] = useState(0);
  const [lastAction, setLastAction] = useState('');
  const now = Date.now(), start = Math.floor(now / 1_800_000) * 1_800_000;
  const rows: TvGuideRow[] = Array.from({ length: 36 }, (_, index) => ({
    channel: { id: String(index), name: ['News', 'Movies', 'Documentaries', 'Sports', 'Music', 'Local'][index % 6]! + ` ${index + 1}`, number: String(index + 101), group: 'Preview', kind: 'hls', url: 'https://example.invalid/live', headers: {} }, number: String(index + 101),
    programmes: index % 6 === 5 ? [] : Array.from({ length: 16 }, (_, i) => ({ channelId: String(index), title: ['Morning Report', 'The Long Journey Home', 'Wild Planet', 'Live Match', 'On Stage'][(index + i) % 5]!, description: 'Preview programme details. Browse the guide, choose a channel, or record a series.', start: start + (i - 1) * 3600_000, stop: start + i * 3600_000 })),
  }));
  const [state, setState] = useState<TvDashboardState>({
    screen: 'guide', now, clock: 'Wed 10:30 AM', dayLabel: 'Today', rows, cursor: { channel: 0, programme: 1, rowTop: 0, windowStart: start }, marks: {}, dvrTab: 'recordings',
    items: Array.from({ length: 24 }, (_, i) => ({ id: String(i), kind: 'saved', title: i % 2 ? 'A Long Programme Title for a Small Screen' : 'Wild Planet', channel: 'Documentaries', subtitle: 'Episode 3', right: '45 min', meta: 'Today · 45 min', description: 'A saved programme for checking touch browsing and recording actions.', progress: .4 })),
    itemIndex: 0, summary: '8.4 of 64 GB used · 0 of 1 streams in use', focus: { zone: 'grid', index: 0 },
  });
  const message = (toast: string) => setState(v => ({ ...v, toast }));
  const watch = (index: number) => { setWatchCount(n => n + 1); setLastAction(`watch:${index}`); };
  return <SafeAreaInsetsContext.Provider value={insets}><View style={{ flex: 1 }}><TvDashboard state={state} onScreen={screen => setState(v => ({ ...v, screen }))} onMenu={() => message('Menu reached')}
    contentInsets={insets} favorites={favorites} onWatchChannel={watch} onChannelAction={(action, index) => { setLastAction(`${action}:${index}`); if (action === 'favorite') setFavorites(previous => previous.includes(String(index)) ? previous.filter(id => id !== String(index)) : [...previous, String(index)]); }}
    onJumpToLive={() => setState(v => ({ ...v, toast: undefined, cursor: { ...v.cursor, windowStart: start, programme: 1 } }))}
    onProgramme={(channel, programme) => { setState(v => ({ ...v, cursor: { ...v.cursor, channel, programme } })); const p = state.rows[channel]?.programmes[programme]; if (p && p.start <= now && p.stop > now) watch(channel); }}
    onGuideAction={(action, channel, programme) => { setLastAction(`${action}:${channel ?? state.cursor.channel}:${programme ?? state.cursor.programme}`); message(`${action} reached`); }} onDvrAction={action => message(`${action} reached`)}
    onTab={dvrTab => setState(v => ({ ...v, dvrTab }))} onItem={itemIndex => setState(v => ({ ...v, itemIndex }))} />
    <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} accessibilityElementsHidden><Text testID="preview-watch-count">{watchCount}</Text><Text testID="preview-last-action">{lastAction}</Text></View>
  </View></SafeAreaInsetsContext.Provider>;
}
registerRootComponent(() => <SafeAreaProvider style={{ height: '100%' }}><Preview /></SafeAreaProvider>);
