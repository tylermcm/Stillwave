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
}

export interface Guide {
  channels: Record<string, string[]>;
  programmes: Record<string, Programme[]>;
  importedAt: number;
}

export type BufferProfile = 'fast' | 'balanced' | 'stable';

export interface Library {
  version: 1;
  channels: Channel[];
  favorites: string[];
  playlistName: string;
  playlistUrl?: string;
  playlistUpdatedAt?: number;
  guideUrl?: string;
  guide?: Guide;
  mappings: Record<string, string>;
  profile: BufferProfile;
}

export const EMPTY_LIBRARY: Library = {
  version: 1, channels: [], favorites: [], playlistName: '', mappings: {}, profile: 'balanced',
};
