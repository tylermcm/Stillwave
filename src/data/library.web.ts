import { EMPTY_LIBRARY, type Library } from '../types';
import { createLibraryWriter } from '../core/libraryWriter';

// Web is a development preview. Use the native app for private provider sources.
export async function loadLibrary(): Promise<Library> {
  const value = localStorage.getItem('stillwave-library-v1');
  if (!value) return { ...EMPTY_LIBRARY };
  const library = JSON.parse(value) as Library;
  const channels = localStorage.getItem('stillwave-channels-v1');
  const guide = localStorage.getItem('stillwave-guide-v1');
  if (channels) library.channels = JSON.parse(channels);
  if (guide) library.guide = JSON.parse(guide) ?? undefined;
  if (library.version !== 1 || !Array.isArray(library.channels) || !Array.isArray(library.favorites)) throw new Error('Saved library is invalid.');
  const loaded = { ...EMPTY_LIBRARY, ...library };
  saveLibrary.seed(loaded);
  return loaded;
}

export const saveLibrary = createLibraryWriter(async (name, data) => {
  localStorage.setItem(`stillwave-${name}-v1`, JSON.stringify(data));
});

export async function cacheGuideSource(text: string): Promise<void> {
  localStorage.setItem('stillwave-guide-source', text);
}

export async function loadGuideSource(): Promise<string | undefined> {
  return localStorage.getItem('stillwave-guide-source') ?? undefined;
}
