import type { Channel, Programme } from '../types';

export const TV_DESIGN = { width: 1920, height: 1080, channelWidth: 324, pixelsPerMinute: 276 / 30, rowHeight: 84, gridHeight: 587, tickMinutes: 30 };
export interface TvGuideRow { channel: Channel; number: string; programmes: Programme[] }
export interface TvGuideCursor { channel: number; programme: number; windowStart: number; rowTop: number }
export function guideProgrammeKey(channelId: string, programme: Programme) { return JSON.stringify([channelId, programme.start, programme.title]); }

export function programmeAt(programmes: Programme[], timestamp: number): number {
  const found = programmes.findIndex(p => p.start <= timestamp && p.stop > timestamp);
  if (found >= 0) return found;
  const next = programmes.findIndex(p => p.start > timestamp);
  return next < 0 ? Math.max(0, programmes.length - 1) : next;
}
export function guideWindow(cursor: TvGuideCursor, rows: TvGuideRow[]): TvGuideCursor {
  const channel = Math.max(0, Math.min(cursor.channel, rows.length - 1));
  const programmes = rows[channel]?.programmes || [];
  const programme = Math.max(0, Math.min(cursor.programme, programmes.length - 1));
  const selected = programmes[programme];
  const visibleRows = Math.floor(TV_DESIGN.gridHeight / TV_DESIGN.rowHeight);
  let rowTop = Math.max(0, cursor.rowTop);
  if (channel < rowTop) rowTop = channel;
  if (channel >= rowTop + visibleRows) rowTop = channel - visibleRows + 1;
  let windowStart = cursor.windowStart;
  if (selected) {
    const step = TV_DESIGN.tickMinutes * 60_000;
    const windowMs = (TV_DESIGN.width - TV_DESIGN.channelWidth) / TV_DESIGN.pixelsPerMinute * 60_000;
    if (selected.start < windowStart) windowStart = Math.floor(selected.start / step) * step;
    if (selected.stop > windowStart + windowMs) windowStart = Math.ceil((selected.stop - windowMs) / step) * step;
    // Very long programs keep their beginning visible rather than scrolling
    // the title offscreen just to fit an episode longer than the viewport.
    if (selected.start < windowStart && selected.stop - selected.start >= windowMs) windowStart = Math.floor(selected.start / step) * step;
  }
  return { channel, programme, windowStart, rowTop };
}
export function moveGuide(cursor: TvGuideCursor, rows: TvGuideRow[], dx: number, dy: number): TvGuideCursor {
  if (!rows.length) return cursor;
  const current = guideWindow(cursor, rows);
  if (dy) {
    const channel = Math.max(0, Math.min(rows.length - 1, current.channel + dy));
    const p = rows[current.channel]?.programmes[current.programme];
    const anchor = Math.max(current.windowStart, p?.start ?? current.windowStart) + 1;
    return guideWindow({ ...current, channel, programme: programmeAt(rows[channel]!.programmes, anchor) }, rows);
  }
  const programme = Math.max(0, Math.min(rows[current.channel]!.programmes.length - 1, current.programme + dx));
  return guideWindow({ ...current, programme }, rows);
}

export const tvTime = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function tvDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}

export interface TvDvrItem {
  id: string; kind: 'recording' | 'saved' | 'scheduled' | 'series'; title: string; channel: string;
  subtitle?: string; right: string; meta: string; description: string;
  progress?: number; watched?: boolean; unwatched?: boolean;
  channelId?: string; programme?: Programme; recordingId?: string; ruleId?: string;
}
export type TvDvrTab = 'recordings' | 'scheduled' | 'series';
export type TvMark = 'recording' | 'scheduled' | 'series';
export interface TvDashboardState {
  screen: 'guide' | 'dvr'; now: number; clock: string; dayLabel: string; rows: TvGuideRow[]; cursor: TvGuideCursor;
  marks: Record<string, TvMark>; dvrTab: TvDvrTab; items: TvDvrItem[]; itemIndex: number;
  summary: string; conflict?: string; toast?: string;
  focus: { zone: 'grid' | 'nav' | 'guideActions' | 'dvrList' | 'dvrActions' | 'dvrTabs'; index: number };
  guideEmpty?: string;
  rulerOrigin?: number;
}
