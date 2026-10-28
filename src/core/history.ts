import type { Library } from '../types';

export function rememberChannel(library: Library, channelId: string, now = Date.now()): Library {
  if (!library.channels.some(c => c.id === channelId)) return library;
  return { ...library, recents: [{ channelId, watchedAt: now }, ...library.recents.filter(r => r.channelId !== channelId)].slice(0, 30) };
}
export function previousChannel(library: Pick<Library, 'channels' | 'recents'>, selectedId?: string) {
  for (const recent of library.recents) {
    if (recent.channelId === selectedId) continue;
    const channel = library.channels.find(c => c.id === recent.channelId);
    if (channel) return channel;
  }
  return undefined;
}

export function adjacentChannel(channels: Library['channels'], selectedId: string | undefined, direction: -1 | 1, preserveOrder = false) {
  if (channels.length < 2 || !selectedId) return undefined;
  const sorted = preserveOrder ? channels : [...channels].sort((a, b) => Number(a.number || 99999) - Number(b.number || 99999) || a.name.localeCompare(b.name));
  const index = sorted.findIndex(c => c.id === selectedId);
  return index < 0 ? undefined : sorted[(index + direction + sorted.length) % sorted.length];
}
