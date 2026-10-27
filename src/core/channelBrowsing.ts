import type { Channel } from '../types';
import type { TvGuideRow } from './tvGuide';
import snapshot from '../data/usChannelLanguages.json';

const languageHints: Record<string, string[]> = snapshot.languages;
export const CHANNEL_BROWSE_MODES = [
  { id: 'all', label: 'All channels' }, { id: 'sports', label: 'Sports' },
  { id: 'animation', label: 'Animation' }, { id: 'movies', label: 'Movies' },
  { id: 'withGuide', label: 'With guide' }, { id: 'noGuide', label: 'No guide' }, { id: 'favorites', label: 'Favorites' },
] as const;
export type ChannelBrowseMode = typeof CHANNEL_BROWSE_MODES[number]['id'];

function network(channel: Channel) {
  const name = channel.name.toLowerCase();
  const id = channel.tvgId?.split('@')[0]?.toLowerCase() || '';
  if (/^espn(?:\d|u|news|deportes|classic)?\.us$/.test(id) || /^espn(?:\b|\d|u\b|news\b|deportes\b)/.test(name)) return 'sports';
  if (/^(fox|foxsports[12]?)\.us$/.test(id) || /^(fox sports\b|fs[12]\b|fox \(united states\))/.test(name)) return 'sports';
  if (/crunchyroll|hidive/i.test(`${id} ${name}`)) return 'animation';
  return undefined;
}
export function channelCategory(channel: Channel): 'sports' | 'animation' | 'movies' | undefined {
  const preferred = network(channel);
  if (preferred) return preferred;
  const groups = channel.group.toLowerCase().split(';').map(s => s.trim());
  if (groups.includes('sports')) return 'sports';
  if (groups.includes('animation')) return 'animation';
  if (groups.includes('movies')) return 'movies';
  return undefined;
}
function languageRank(channel: Channel) {
  const languages = channel.languages?.length ? channel.languages : languageHints[channel.tvgId || ''];
  if (!languages?.length) return 1; // Unknown is not assumed to mean English.
  return languages.some(l => /^(en(?:g|glish)?|en[-_].+)$/i.test(l)) ? 0 : 2;
}
function contentRank(channel: Channel) {
  const category = channelCategory(channel);
  const base = category === 'sports' ? 0 : category === 'animation' ? 10 : category === 'movies' ? 20 : 30;
  const foxAffiliate = /^fox\.us@/i.test(channel.tvgId || '') || /^fox \(united states\)/i.test(channel.name);
  return base + (foxAffiliate ? 2 : network(channel) ? 0 : category === 'sports' && /\b(nfl|nba|football|basketball)\b/i.test(channel.name) ? 1 : 3);
}
/** Retains every channel and its identity; guide coverage never affects priority. */
export function comparePreferredChannels(a: Channel, b: Channel) {
  return languageRank(a) - languageRank(b) || contentRank(a) - contentRank(b) || a.name.localeCompare(b.name);
}
export function browseChannelRows(rows: TvGuideRow[], mode: ChannelBrowseMode, favorites: string[], now: number): TvGuideRow[] {
  const saved = new Set(favorites);
  return rows.filter(row => mode === 'all' || (mode === 'favorites' ? saved.has(row.channel.id)
    : mode === 'withGuide' ? row.programmes.some(p => p.stop > now) : mode === 'noGuide' ? !row.programmes.some(p => p.stop > now) : channelCategory(row.channel) === mode))
    .map(row => mode === 'noGuide' ? { ...row, programmes: [] } : row);
}
