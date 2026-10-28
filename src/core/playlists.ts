import { EMPTY_LIBRARY, type Library, type Playlist, type SavedPlaylist } from '../types';
import { withChannelNumbers } from './channelNumbers';
import { preferences } from './preferences';

// Keep legacy channel IDs intact so existing favorites and guide mappings survive
// the update. New sources get namespaced IDs, even when their streams overlap.
export function restoreLibrary(value: unknown): Library {
  const data = value as Library;
  if (!data || data.version !== 1 || !Array.isArray(data.channels) || !Array.isArray(data.favorites)) {
    throw new Error('The saved library could not be read. Import your playlists again.');
  }
  const library = { ...EMPTY_LIBRARY, ...data };
  library.guideSources = Array.isArray(data.guideSources) ? data.guideSources : [];
  library.recents = Array.isArray(data.recents) ? data.recents : [];
  library.hiddenChannels = Array.isArray(data.hiddenChannels) ? [...new Set(data.hiddenChannels.filter(id => typeof id === 'string'))] : [];
  library.reminders = Array.isArray(data.reminders) ? data.reminders : [];
  library.preferences = preferences(data.preferences);
  library.channelOrder = Array.isArray(data.channelOrder) ? [...new Set(data.channelOrder.filter(key => typeof key === 'string'))] : [];
  if (!Array.isArray(data.playlists) || (!data.playlists.length && data.channels.length)) {
    const id = 'legacy-playlist';
    library.playlists = data.channels.length ? [{ id, name: data.playlistName || 'My playlist', url: data.playlistUrl, updatedAt: data.playlistUpdatedAt }] : [];
    library.channels = data.channels.map(c => ({ ...c, playlistId: id, sourceId: c.id }));
  }
  return withChannelNumbers(library);
}

function retainReferences(library: Library, channels: Library['channels']): Library {
  const ids = new Set(channels.map(c => c.id));
  return withChannelNumbers({ ...library, channels, favorites: library.favorites.filter(id => ids.has(id)),
    recents: library.recents.filter(r => ids.has(r.channelId)), reminders: library.reminders.filter(r => ids.has(r.channelId)),
    mappings: Object.fromEntries(Object.entries(library.mappings).filter(([id]) => ids.has(id))) });
}

export function addPlaylist(library: Library, parsed: Playlist, source: SavedPlaylist): Library {
  // Reimporting the same URL refreshes that source rather than duplicating it.
  const existing = library.playlists.find(p => p.id === source.id) ??
    (source.url ? library.playlists.find(p => p.url === source.url) : undefined);
  const id = existing?.id ?? source.id;
  const previous = new Map(library.channels.filter(c => c.playlistId === id).map(c => [c.sourceId ?? c.id, c]));
  const added = parsed.channels.map(c => ({ ...c, playlistId: id, sourceId: c.id, id: previous.get(c.id)?.id ?? `${id}:${c.id}` }));
  const channels = [...library.channels.filter(c => c.playlistId !== id), ...added];
  const metadata = { ...source, id, guideUrl: parsed.guideUrls[0] ?? existing?.guideUrl };
  return retainReferences({ ...library, playlists: existing ? library.playlists.map(p => p.id === id ? metadata : p) : [...library.playlists, metadata],
    guideUrl: library.guideUrl || metadata.guideUrl }, channels);
}

export function removePlaylist(library: Library, id: string): Library {
  const guideSources = library.guideSources.filter(s => !s.playlistIds.length || s.playlistIds.some(p => p !== id)).map(s => s.playlistIds.includes(id) ? { ...s, playlistIds: s.playlistIds.filter(p => p !== id) } : s);
  return retainReferences({ ...library, guideSources, playlists: library.playlists.filter(p => p.id !== id) }, library.channels.filter(c => c.playlistId !== id));
}

export function newPlaylistId(): string {
  return `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
