import type { Channel, Programme, RecentChannel } from '../types';
import { isChannelHidden } from './channelBrowsing';
import type { TvGuideRow } from './tvGuide';

/** Destinations reachable from the phone navigation drawer. */
export type HubDestination = 'home' | 'guide' | 'dvr' | 'discover';

export const MESH_IDS = ['dusk', 'stadium', 'court', 'cinema', 'mountain', 'music', 'coast', 'forest', 'aurora', 'nebula', 'fire', 'ocean'] as const;
export type MeshId = typeof MESH_IDS[number];

/** The same channel always gets the same artwork, without needing channel logos. */
export function meshFor(seed: string): MeshId {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return MESH_IDS[(hash >>> 0) % MESH_IDS.length]!;
}

export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const alpha = words.filter(w => /\p{L}/u.test(w));
  if (alpha.length >= 2) return alpha.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const only = alpha[0] ?? words[0];
  return only ? only.slice(0, 3).toUpperCase() : '·';
}

export function greeting(now: number): string {
  const hour = new Date(now).getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export interface HomeItem {
  row: TvGuideRow;
  /** Missing when the guide has nothing airing; the channel can still be watched. */
  now?: Programme;
  progress: number;
  minutesLeft: number;
}
export interface HomeModel {
  featured?: HomeItem;
  shelf: HomeItem[];
  hasChannels: boolean;
  hasGuide: boolean;
}

function itemFor(row: TvGuideRow, now: number): HomeItem {
  const airing = row.programmes.find(p => p.start <= now && p.stop > now);
  if (!airing) return { row, progress: 0, minutesLeft: 0 };
  return { row, now: airing, progress: Math.max(0, Math.min(1, (now - airing.start) / (airing.stop - airing.start))), minutesLeft: Math.max(1, Math.ceil((airing.stop - now) / 60_000)) };
}

/**
 * Home leads with one live item: the channel last watched, else a favorite that is on now,
 * else anything on now. Hidden channels never appear.
 */
export function homeModel(rows: TvGuideRow[], favorites: readonly string[], recents: readonly RecentChannel[], now: number, hidden?: string[], shelfSize = 8): HomeModel {
  const visible = rows.filter(r => !isChannelHidden(r.channel, hidden));
  const items = visible.map(r => itemFor(r, now));
  const hasGuide = items.some(i => i.now);
  const favoriteSet = new Set(favorites);
  const recentRank = new Map(recents.map((r, index) => [r.channelId, index]));
  const live = items.filter(i => i.now);
  const byRecent = [...visible.filter(r => recentRank.has(r.channel.id))].sort((a, b) => recentRank.get(a.channel.id)! - recentRank.get(b.channel.id)!);
  const lastWatched = byRecent[0] && itemFor(byRecent[0], now);
  const featured = (lastWatched?.now ? lastWatched : undefined)
    ?? live.find(i => favoriteSet.has(i.row.channel.id)) ?? live[0] ?? lastWatched ?? items[0];
  const shelf = live.filter(i => i !== featured && i.row.channel.id !== featured?.row.channel.id)
    .sort((a, b) => Number(favoriteSet.has(b.row.channel.id)) - Number(favoriteSet.has(a.row.channel.id)) || (recentRank.get(a.row.channel.id) ?? Infinity) - (recentRank.get(b.row.channel.id) ?? Infinity))
    .slice(0, shelfSize);
  return { featured, shelf, hasChannels: visible.length > 0, hasGuide };
}

export type HubModuleId = 'sports' | 'radio' | 'dashboard' | 'local' | 'world' | 'ambient';
export interface HubModule { /** False until the module is built; Discover then says so plainly. */ available: boolean; id: HubModuleId; title: string; summary: string; mesh: MeshId; icon: 'football-outline' | 'radio-outline' | 'partly-sunny-outline' | 'folder-open-outline' | 'earth-outline' | 'moon-outline' }
const MODULES: Record<HubModuleId, HubModule> = {
  sports: { available: false, id: 'sports', title: 'Sports Center', summary: 'Scores, schedules and standings, with Watch when a channel in your guide carries the game.', mesh: 'stadium', icon: 'football-outline' },
  radio: { available: false, id: 'radio', title: 'Radio & Podcasts', summary: 'Stations and shows, with episode resume and controls that stay with you.', mesh: 'music', icon: 'radio-outline' },
  dashboard: { available: false, id: 'dashboard', title: 'Daily Dashboard', summary: 'Weather, headlines, tonight’s games and the astronomy picture of the day.', mesh: 'coast', icon: 'partly-sunny-outline' },
  local: { available: true, id: 'local', title: 'Local Media', summary: 'Play videos and audio you choose from this phone. Nothing is scanned or uploaded.', mesh: 'aurora', icon: 'folder-open-outline' },
  world: { available: false, id: 'world', title: 'Live World', summary: 'Public city, coastal, wildlife and mountain cameras.', mesh: 'mountain', icon: 'earth-outline' },
  ambient: { available: false, id: 'ambient', title: 'Ambient Mode', summary: 'Quiet scenery with a clock and optional sound.', mesh: 'fire', icon: 'moon-outline' },
};
const BY_PLATFORM: Record<'phone' | 'tv', HubModuleId[]> = {
  phone: ['sports', 'radio', 'dashboard', 'local'],
  tv: ['sports', 'radio', 'dashboard', 'world', 'ambient'],
};
/** Each device only offers its own modules; hidden ones are removed from Discover. */
export function discoverModules(platform: 'phone' | 'tv', hidden: readonly string[] = []): HubModule[] {
  return BY_PLATFORM[platform].filter(id => !hidden.includes(id)).map(id => MODULES[id]);
}
export function hubModule(id: string): HubModule | undefined { return (MODULES as Record<string, HubModule | undefined>)[id]; }

/** Programme time range, e.g. `7:30 – 9:00 PM`. */
export function timeRange(programme: Pick<Programme, 'start' | 'stop'>): string {
  const t = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${t(programme.start)} – ${t(programme.stop)}`;
}
export type { Channel };
