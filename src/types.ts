export type StreamKind = 'auto' | 'hls' | 'dash' | 'progressive';

export interface Channel {
  id: string;
  name: string;
  tvgId?: string;
  tvgName?: string;
  group: string;
  logo?: string;
  url: string;
  headers: Record<string, string>;
  kind: StreamKind;
  playlistId?: string;
  sourceId?: string;
  number?: string;
}

export interface SavedPlaylist {
  id: string;
  name: string;
  url?: string;
  updatedAt?: number;
  guideUrl?: string;
}

export interface Playlist {
  channels: Channel[];
  guideUrls: string[];
  warnings: string[];
}

export interface Programme {
  channelId: string;
  title: string;
  description?: string;
  start: number;
  stop: number;
  episode?: string;
}

export interface Guide {
  channels: Record<string, string[]>;
  programmes: Record<string, Programme[]>;
  importedAt: number;
}

export interface GuideSource {
  id: string;
  name: string;
  url?: string;
  /** Empty means shared across all playlists. */
  playlistIds: string[];
  guide: Guide;
  lastAttemptAt?: number;
  lastError?: string;
  refreshHours: number;
}

export interface RecentChannel { channelId: string; watchedAt: number }
export interface ProgramReminder {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  start: number;
  stop: number;
  fireAt: number;
  notify: boolean;
}

export type BufferProfile = 'fast' | 'balanced' | 'stable';

export interface Library {
  version: 1;
  channels: Channel[];
  favorites: string[];
  playlists: SavedPlaylist[];
  playlistName: string;
  playlistUrl?: string;
  playlistUpdatedAt?: number;
  guideUrl?: string;
  guide?: Guide;
  guideSources: GuideSource[];
  recents: RecentChannel[];
  reminders: ProgramReminder[];
  mappings: Record<string, string>;
  profile: BufferProfile;
}

export const EMPTY_LIBRARY: Library = {
  version: 1, channels: [], favorites: [], playlists: [], playlistName: '', mappings: {}, profile: 'balanced', guideSources: [], recents: [], reminders: [],
};
