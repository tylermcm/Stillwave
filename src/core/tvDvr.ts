import type { Recording } from './dvr';
import type { RecordingPlan, SeriesRule } from '../data/recordingPlanner';
import type { TvDvrItem, TvDvrTab, TvGuideRow } from './tvGuide';
import type { Programme } from '../types';
import { tvDuration, tvTime } from './tvGuide';

export const seriesTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export type DvrAction = 'play' | 'delete' | 'stop' | 'cancel' | 'guide' | 'protect' | 'extend';
export function dvrItemActions(item?: TvDvrItem): { label: string; action: DvrAction }[] {
  if (!item) return [];
  if (item.kind === 'saved') return [{ label: item.progress && item.progress < 1 ? 'Resume' : 'Play', action: 'play' }, { label: item.protected ? 'Unprotect' : 'Protect', action: 'protect' }, ...(!item.protected ? [{ label: 'Delete', action: 'delete' as const }] : [])];
  if (item.kind === 'recording') return [{ label: 'Watch from start', action: 'play' }, { label: 'Stop', action: 'stop' }, { label: 'Add 30 minutes', action: 'extend' }];
  return [{ label: item.kind === 'series' ? 'Remove rule' : 'Cancel', action: 'cancel' }, { label: 'Show in guide', action: 'guide' }];
}
export function recordingMatchesProgramme(record: Recording, channelId: string, programme: Programme, now: number): boolean {
  return record.status === 'recording' && record.channelId === channelId && (record.programmeStart ? record.programmeStart === programme.start : programme.start <= now && programme.stop > now);
}
export function seriesEpisodes(rules: SeriesRule[], rows: TvGuideRow[], plans: RecordingPlan[], now: number) {
  const existing = new Set(plans.map(p => JSON.stringify([p.channelId, p.start, p.title])));
  return rules.flatMap(rule => {
    const row = rows.find(row => row.channel.id === rule.channelId);
    return (row?.programmes || []).filter(p => p.stop > now && seriesTitle(p.title) === seriesTitle(rule.title) && !existing.has(JSON.stringify([rule.channelId, p.start, p.title])))
      .map(programme => ({ channel: row!.channel, programme, ruleId: rule.id, paddingBefore: rule.paddingBefore, paddingAfter: rule.paddingAfter }));
  }).slice(0, 200);
}
export function recordingConflict(recordings: Recording[], plans: RecordingPlan[], now: number): string | undefined {
  const active = recordings.find(r => r.status === 'recording');
  if (!active) return undefined;
  const next = plans.filter(p => p.status === 'scheduled' && (p.captureStop ?? p.stop) > now && (!active.stopAt || (p.captureStart ?? p.start) < active.stopAt)).sort((a,b) => (a.captureStart ?? a.start) - (b.captureStart ?? b.start))[0];
  return next ? `${next.title} captures from ${tvTime(next.captureStart ?? next.start)}, before ${active.title} ends. Only one stream is available.` : undefined;
}
const gb = (bytes: number) => (bytes / 1_000_000_000).toFixed(1);
const day = (ms: number, now: number) => {
  const date = new Date(ms), today = new Date(now);
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'long' });
};
export function tvDvrItems(tab: TvDvrTab, recordings: Recording[], plans: RecordingPlan[], rules: SeriesRule[], now: number): TvDvrItem[] {
  if (tab === 'series') return rules.map(rule => ({ id: rule.id, ruleId: rule.id, kind: 'series', title: rule.title, channel: rule.channelName, channelId: rule.channelId,
    right: `${plans.filter(p => p.seriesId === rule.id && p.status === 'scheduled').length} upcoming`, meta: rule.channelName, description: rule.description || 'Record matching episodes on this channel as they appear in the downloaded guide.' }));
  if (tab === 'scheduled') return plans.filter(p => !['recording', 'completed', 'interrupted', 'cancelled'].includes(p.status)).sort((a,b) => a.start - b.start).map(p => ({
    id: p.id, kind: 'scheduled', channel: p.channelName, channelId: p.channelId, title: p.title,
    right: p.status === 'scheduled' ? `${tvTime(p.start)} · in ${tvDuration(Math.max(0, (p.start - now) / 1000))}` : p.status === 'starting' ? 'Starting…' : p.status,
    meta: `${p.channelName} · ${tvTime(p.start)} – ${tvTime(p.stop)}`, description: [p.error || p.description, p.paddingBefore || p.paddingAfter ? `Capture: ${tvTime(p.captureStart ?? p.start)} – ${tvTime(p.captureStop ?? p.stop)} (includes padding).` : ''].filter(Boolean).join('\n'),
    programme: { channelId: p.channelId, title: p.title, start: p.start, stop: p.stop, description: p.description, episode: p.episode },
  }));
  return [...recordings].sort((a,b) => Number(b.status === 'recording') - Number(a.status === 'recording') || b.createdAt - a.createdAt).map(r => {
    const active = r.status === 'recording', progress = r.duration > 0 ? Math.min(1, r.position / r.duration) : 0;
    const when = day(r.createdAt, now), length = tvDuration(r.duration), watched = progress >= 0.98;
    return { id: r.id, recordingId: r.id, channelId: r.channelId, kind: active ? 'recording' : 'saved', title: r.title, channel: r.channel,
      subtitle: active ? 'recording' : r.episode,
      right: active ? `${Math.floor(r.duration / 60)} min captured${r.stopAt ? ` · ends ${tvTime(r.stopAt)}` : ''}` : `${when} · ${length}`,
      meta: active ? `${r.channel} · ${tvTime(r.programmeStart || r.createdAt)}${r.stopAt ? ` – ${tvTime(r.stopAt)}` : ''}` : `${r.channel} · ${when} · ${length} · ${gb(r.bytes)} GB`,
      description: active ? 'Recording now. Watch from the start, or stop and keep what has been captured.' : r.note || (watched ? 'Watched.' : progress > 0 ? `Stopped at ${Math.round(r.position / 60)} min.` : 'Not watched yet.'),
      progress, watched, unwatched: !r.position, protected: r.protected,
    };
  });
}
