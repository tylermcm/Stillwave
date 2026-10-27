import type { Channel, Guide, GuideSource, Library, Programme, ProgramReminder } from '../types';
import { createGuideMatcher } from './xmltv';

export const guideKey = (sourceId: string, channelId: string) => `${encodeURIComponent(sourceId)}::${encodeURIComponent(channelId)}`;
export function splitGuideKey(value: string): [string, string] | undefined {
  const index = value.indexOf('::');
  if (index < 0) return undefined;
  try { return [decodeURIComponent(value.slice(0, index)), decodeURIComponent(value.slice(index + 2))]; } catch { return undefined; }
}

/** Legacy guide remains readable until the first multi-source edit commits it. */
export function getGuideSources(library: Pick<Library, 'guideSources' | 'guide' | 'guideUrl'>): GuideSource[] {
  return library.guideSources?.length ? library.guideSources : library.guide ? [{ id: 'legacy-guide', name: 'Imported guide', url: library.guideUrl, playlistIds: [], guide: library.guide, refreshHours: 12 }] : [];
}

export function sourceChannels(source: Pick<GuideSource, 'playlistIds'>, channels: Channel[]) {
  return source.playlistIds.length ? channels.filter(c => c.playlistId && source.playlistIds.includes(c.playlistId)) : channels;
}

export function sourceMappings(sourceId: string, mappings: Record<string, string>) {
  return Object.fromEntries(Object.entries(mappings).flatMap(([id, value]) => {
    const key = splitGuideKey(value);
    return key ? key[0] === sourceId ? [[id, key[1]]] : [] : [[id, value]];
  }));
}

export function withGuideSources(library: Library, sources: GuideSource[]): Library {
  return { ...library, guideSources: sources, guide: undefined, guideUrl: undefined };
}

export function createGuideView(library: Pick<Library, 'guideSources' | 'guide' | 'guideUrl' | 'mappings'>) {
  const sources = getGuideSources(library);
  const merged: Guide | undefined = sources.length ? { channels: Object.create(null), programmes: Object.create(null), importedAt: Math.max(...sources.map(s => s.guide.importedAt)) } : undefined;
  const matchers = new Map(sources.map(s => [s.id, createGuideMatcher(s.guide)]));
  for (const source of sources) {
    for (const [id, names] of Object.entries(source.guide.channels)) merged!.channels[guideKey(source.id, id)] = names;
    for (const [id, programmes] of Object.entries(source.guide.programmes)) merged!.programmes[guideKey(source.id, id)] = programmes;
  }
  const applicable = (channel: Channel) => sources.filter(s => !s.playlistIds.length || !!channel.playlistId && s.playlistIds.includes(channel.playlistId))
    .sort((a, b) => Number(!!b.playlistIds.length) - Number(!!a.playlistIds.length));
  const matcher = (channel: Channel, mappings = library.mappings): string | undefined => {
    const candidates = applicable(channel);
    const manual = mappings[channel.id];
    const explicit = manual ? splitGuideKey(manual) : undefined;
    if (explicit) {
      const source = candidates.find(s => s.id === explicit[0]);
      if (source && (Object.hasOwn(source.guide.channels, explicit[1]) || Object.hasOwn(source.guide.programmes, explicit[1]))) return guideKey(source.id, explicit[1]);
    }
    // Specific playlist guides take priority over shared guides, then list order.
    for (const source of candidates) {
      const id = matchers.get(source.id)!(channel, manual && !explicit ? { [channel.id]: manual } : {});
      if (id) return guideKey(source.id, id);
    }
    return undefined;
  };
  const choices = (channel: Channel) => applicable(channel).flatMap(s => Object.entries(s.guide.channels).map(([id, names]) => ({ id: guideKey(s.id, id), names, sourceName: s.name })));
  return { guide: merged, matcher, sources, choices };
}
export type GuideView = ReturnType<typeof createGuideView>;

export function reminderKey(channelId: string, programme: Pick<Programme, 'start' | 'title'>) {
  return JSON.stringify([channelId, programme.start, programme.title]);
}
export function makeReminder(channel: Channel, programme: Programme, notify: boolean, now = Date.now()): ProgramReminder {
  if (programme.start <= now || programme.stop <= programme.start) throw new Error('This program has already started.');
  return { id: reminderKey(channel.id, programme), channelId: channel.id, channelName: channel.name, title: programme.title, start: programme.start, stop: programme.stop, fireAt: Math.max(now + 1000, programme.start - 5 * 60_000), notify };
}

export interface ProgramResult { channel: Channel; programme: Programme; key: string }
export function programIndex(channels: Channel[], view: GuideView): ProgramResult[] {
  return channels.flatMap(channel => {
    const id = view.matcher(channel);
    return (id ? view.guide?.programmes[id] ?? [] : []).map(programme => ({ channel, programme, key: reminderKey(channel.id, programme) }));
  });
}
export function searchPrograms(index: ProgramResult[], query: string, range: 'now' | 'soon' | 'week' | 'saved', now: number, reminders: ProgramReminder[], favorites?: Set<string>) {
  const tokens = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const saved = new Set(reminders.map(r => r.id));
  return index.filter(row => row.programme.stop > now && (!favorites || favorites.has(row.channel.id)) &&
    (range === 'saved' ? saved.has(row.key) : range === 'now' ? row.programme.start <= now : range === 'soon' ? row.programme.start > now && row.programme.start <= now + 3 * 3600_000 : true) &&
    tokens.every(token => `${row.programme.title} ${row.programme.description ?? ''} ${row.channel.name} ${row.channel.group}`.toLocaleLowerCase().includes(token)))
    .sort((a, b) => a.programme.start - b.programme.start || a.channel.name.localeCompare(b.channel.name));
}
