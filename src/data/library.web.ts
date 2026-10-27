import { EMPTY_LIBRARY, type Library } from '../types';
import { createLibraryWriter } from '../core/libraryWriter';
import { restoreLibrary } from '../core/playlists';

// Web is a development preview. Use the native app for private provider sources.
export async function loadLibrary(): Promise<Library> {
  const value = localStorage.getItem('stillwave-library-v1');
  if (!value) return { ...EMPTY_LIBRARY };
  const library = JSON.parse(value) as Library;
  const channels = localStorage.getItem('stillwave-channels-v1');
  const guide = localStorage.getItem('stillwave-guide-v1');
  const sources = localStorage.getItem('stillwave-guides-v1');
  if (channels) library.channels = JSON.parse(channels);
  if (guide) library.guide = JSON.parse(guide) ?? undefined;
  if (sources) library.guideSources = JSON.parse(sources) ?? [];
  const loaded = restoreLibrary(library);
  saveLibrary.seed(loaded);
  return loaded;
}

export const saveLibrary = createLibraryWriter(async (name, data) => {
  localStorage.setItem(`stillwave-${name}-v1`, JSON.stringify(data));
});

const cacheKey = (id: string) => id === 'legacy-guide' ? 'stillwave-guide-source' : `stillwave-guide-source:${id}`;
export async function cacheGuideSource(text: string, id = 'legacy-guide'): Promise<void> {
  localStorage.setItem(cacheKey(id), text);
}

export async function loadGuideSource(id = 'legacy-guide'): Promise<string | undefined> {
  return localStorage.getItem(cacheKey(id)) ?? undefined;
}
export async function removeGuideCache(id: string): Promise<void> { localStorage.removeItem(cacheKey(id)); }
