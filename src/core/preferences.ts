import type { AppPreferences, Channel, GuideSize, Library, Programme } from '../types';
import { channelHiddenKey, isChannelHidden } from './channelBrowsing';
import type { TvGuideRow } from './tvGuide';

export const DEFAULT_PREFERENCES: AppPreferences = {
  guideSize: 'comfortable', startup: 'guide', paddingBefore: 0, paddingAfter: 0, autoDeleteWatchedDays: 0,
};
export const PADDING_MINUTES = [0, 1, 2, 5, 10, 15, 30] as const;
export function preferences(value?: Partial<AppPreferences>): AppPreferences {
  return {
    guideSize: ['compact', 'comfortable', 'large'].includes(value?.guideSize || '') ? value!.guideSize! : 'comfortable',
    startup: ['guide', 'favorites', 'lastChannel'].includes(value?.startup || '') ? value!.startup! : 'guide',
    paddingBefore: PADDING_MINUTES.includes(value?.paddingBefore as never) ? value!.paddingBefore! : 0,
    paddingAfter: PADDING_MINUTES.includes(value?.paddingAfter as never) ? value!.paddingAfter! : 0,
    autoDeleteWatchedDays: value?.autoDeleteWatchedDays === 7 || value?.autoDeleteWatchedDays === 30 ? value.autoDeleteWatchedDays : 0,
  };
}
export function guideMetrics(size: GuideSize = 'comfortable') {
  return size === 'compact' ? { zoom: .9, fontScale: .95, rowHeight: 72 }
    : size === 'large' ? { zoom: 1.2, fontScale: 1.2, rowHeight: 104 }
    : { zoom: 1, fontScale: 1, rowHeight: 84 };
}
export function orderedChannels(channels: Channel[], order: readonly string[] = []): Channel[] {
  const ranks = new Map(order.map((key, i) => [key, i]));
  return [...channels].sort((a, b) => (ranks.get(channelHiddenKey(a)) ?? ranks.get(a.id) ?? Infinity) - (ranks.get(channelHiddenKey(b)) ?? ranks.get(b.id) ?? Infinity));
}
export function moveChannel(channels: Channel[], order: readonly string[], id: string, destination: number): string[] {
  const sorted = orderedChannels(channels, order);
  const index = sorted.findIndex(c => c.id === id);
  if (index < 0) return [...order];
  const [channel] = sorted.splice(index, 1);
  sorted.splice(Math.max(0, Math.min(sorted.length, destination)), 0, channel!);
  return [...new Set(sorted.map(channelHiddenKey))];
}
export function startupChannel(library: Library): Channel | undefined {
  for (const recent of library.recents) {
    const channel = library.channels.find(c => c.id === recent.channelId && !isChannelHidden(c, library.hiddenChannels));
    if (channel) return channel;
  }
}
export function captureWindow(programme: Programme, padding: Pick<AppPreferences, 'paddingBefore' | 'paddingAfter'>) {
  return { captureStart: programme.start - padding.paddingBefore * 60_000, captureStop: programme.stop + padding.paddingAfter * 60_000 };
}
export type GuideDateTarget = { label: string; at: number };
/** Use local calendar dates, including programmes crossing midnight and DST boundaries. */
export function guideDateTargets(rows: TvGuideRow[], now: number): GuideDateTarget[] {
  const programmes = rows.flatMap(r => r.programmes).filter(p => Number.isFinite(p.start) && Number.isFinite(p.stop) && p.stop > now && p.stop > p.start);
  const dates = new Set<number>();
  for (const programme of programmes) {
    const date = new Date(Math.max(now, programme.start)); date.setHours(0, 0, 0, 0);
    for (let i = 0; i < 32 && date.getTime() < programme.stop; i++, date.setDate(date.getDate() + 1)) dates.add(date.getTime());
  }
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const targets: GuideDateTarget[] = [];
  for (const start of [...dates].sort((a, b) => a - b)) {
    const evening = new Date(start); evening.setHours(18);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const available = programmes.filter(p => p.stop > Math.max(now, start) && p.start < end.getTime());
    const first = available.reduce((earliest, p) => Math.min(earliest, Math.max(p.start, now, start)), Infinity);
    if (start === today.getTime()) {
      targets.push({ label: 'Today · now', at: now });
      const at = Math.max(now, evening.getTime());
      if (available.some(p => p.stop > at)) targets.push({ label: 'Tonight', at });
    } else targets.push({ label: new Date(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      at: available.some(p => p.start <= evening.getTime() && p.stop > evening.getTime()) ? evening.getTime() : first });
  }
  return targets;
}
export function sleepDeadline(minutes: number | 'programme', now: number, programmeEnd?: number) {
  if (minutes === 'programme') return programmeEnd && programmeEnd > now ? programmeEnd : undefined;
  return [15, 30, 60].includes(minutes) ? now + minutes * 60_000 : undefined;
}
