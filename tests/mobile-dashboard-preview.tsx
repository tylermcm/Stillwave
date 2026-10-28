// Isolated fixtures: no user library, stream requests, or native DVR operations.
import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TvDashboard } from '../src/components/tv/TvDashboard';
import type { TvDashboardState, TvGuideRow } from '../src/core/tvGuide';

function Preview() {
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
  return <TvDashboard state={state} onScreen={screen => setState(v => ({ ...v, screen }))} onMenu={() => message('Menu reached')}
    onProgramme={(channel, programme) => setState(v => ({ ...v, cursor: { ...v.cursor, channel, programme } }))}
    onGuideAction={action => message(`${action} reached`)} onDvrAction={action => message(`${action} reached`)}
    onTab={dvrTab => setState(v => ({ ...v, dvrTab }))} onItem={itemIndex => setState(v => ({ ...v, itemIndex }))} />;
}
registerRootComponent(() => <SafeAreaProvider style={{ height: '100%' }}><Preview /></SafeAreaProvider>);
