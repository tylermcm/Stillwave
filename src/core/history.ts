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
