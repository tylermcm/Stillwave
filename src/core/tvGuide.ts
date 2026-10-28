import type { Channel, Programme } from '../types';

export const TV_DESIGN = { width: 1920, height: 1080, channelWidth: 324, pixelsPerMinute: 276 / 30, rowHeight: 84, gridHeight: 587, tickMinutes: 30 };
export interface TvGuideRow { channel: Channel; number: string; programmes: Programme[] }
export interface TvGuideCursor { channel: number; programme: number; windowStart: number; rowTop: number }
export function guideProgrammeKey(channelId: string, programme: Programme) { return JSON.stringify([channelId, programme.start, programme.title]); }

/** Trim the rendered cell to the timeline, leaving published airing times intact. */
export function guideProgrammeFrame(programme: Programme, windowStart: number, laneWidth: number) {
  const start = (programme.start - windowStart) / 60_000 * TV_DESIGN.pixelsPerMinute;
  const stop = (programme.stop - windowStart) / 60_000 * TV_DESIGN.pixelsPerMinute;
  if (stop <= 0 || start >= laneWidth) return undefined;
  const left = Math.max(0, start) + 2;
  return { left, width: Math.max(1, Math.min(laneWidth, stop) - 2 - left) };
}

/** Width of the cell's visible intersection as a touch timeline scrolls. */
export function guideTitleScrollRange(left: number, width: number, viewportWidth: number) {
  const right = left + width;
  const points = [left - viewportWidth, Math.min(left, right - viewportWidth), Math.max(left, right - viewportWidth), right];
  const widths = [0, Math.min(width, viewportWidth), Math.min(width, viewportWidth), 0];
  const inputRange: number[] = [], outputRange: number[] = [];
  points.forEach((point, i) => { if (point !== inputRange.at(-1)) { inputRange.push(point); outputRange.push(widths[i]!); } });
  return { inputRange, outputRange, extrapolate: 'clamp' as const };
}

export function programmeAt(programmes: Programme[], timestamp: number): number {
  const found = programmes.findIndex(p => p.start <= timestamp && p.stop > timestamp);
  if (found >= 0) return found;
  const next = programmes.findIndex(p => p.start > timestamp);
  return next < 0 ? Math.max(0, programmes.length - 1) : next;
}
export function guideWindow(cursor: TvGuideCursor, rows: TvGuideRow[], rowHeight = TV_DESIGN.rowHeight): TvGuideCursor {
  const channel = Math.max(0, Math.min(cursor.channel, rows.length - 1));
  const programmes = rows[channel]?.programmes || [];
  const programme = Math.max(0, Math.min(cursor.programme, programmes.length - 1));
  const selected = programmes[programme];
  const visibleRows = Math.max(1, Math.floor(TV_DESIGN.gridHeight / rowHeight));
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
export function moveGuide(cursor: TvGuideCursor, rows: TvGuideRow[], dx: number, dy: number, rowHeight = TV_DESIGN.rowHeight): TvGuideCursor {
  if (!rows.length) return cursor;
  const current = guideWindow(cursor, rows, rowHeight);
  if (dy) {
    const channel = Math.max(0, Math.min(rows.length - 1, current.channel + dy));
    const p = rows[current.channel]?.programmes[current.programme];
    const anchor = Math.max(current.windowStart, p?.start ?? current.windowStart) + 1;
    return guideWindow({ ...current, channel, programme: programmeAt(rows[channel]!.programmes, anchor) }, rows, rowHeight);
  }
  const programme = Math.max(0, Math.min(rows[current.channel]!.programmes.length - 1, current.programme + dx));
  return guideWindow({ ...current, programme }, rows, rowHeight);
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
  protected?: boolean;
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
