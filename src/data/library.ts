import { File, Paths } from 'expo-file-system';
import { EMPTY_LIBRARY, type Library } from '../types';
import { createLibraryWriter } from '../core/libraryWriter';
import { restoreLibrary } from '../core/playlists';

// This is app-private local storage, not encrypted storage. See README privacy notes.
const libraryFile = () => new File(Paths.document, 'library-v1.json');

export async function loadLibrary(): Promise<Library> {
  const file = libraryFile();
  if (!file.exists) return { ...EMPTY_LIBRARY };
  const data = JSON.parse(await file.text()) as Library;
  const channels = new File(Paths.document, 'channels-v1.json');
  const guide = new File(Paths.document, 'guide-v1.json');
  const sources = new File(Paths.document, 'guides-v1.json');
  if (channels.exists) data.channels = JSON.parse(await channels.text());
  if (guide.exists) data.guide = JSON.parse(await guide.text()) ?? undefined;
  if (sources.exists) data.guideSources = JSON.parse(await sources.text()) ?? [];
  const library = restoreLibrary(data);
  saveLibrary.seed(library);
  return library;
}

export const saveLibrary = createLibraryWriter(async (name, data) => {
    const temporary = new File(Paths.document, `${name}-v1.next.json`);
    await temporary.write(JSON.stringify(data));
    // Copy replaces the previous snapshot only after the complete temp file exists.
    await temporary.copy(new File(Paths.document, `${name}-v1.json`), { overwrite: true });
    temporary.delete();
});

function cacheFile(id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Invalid guide identifier.');
  return new File(Paths.document, id === 'legacy-guide' ? 'guide-source.xml' : `guide-source-${id}.xml`);
}
export async function cacheGuideSource(text: string, id = 'legacy-guide'): Promise<void> {
  await cacheFile(id).write(text);
}
export async function loadGuideSource(id = 'legacy-guide'): Promise<string | undefined> {
  const file = cacheFile(id);
  return file.exists ? file.text() : undefined;
}
export async function removeGuideCache(id: string): Promise<void> { const file = cacheFile(id); if (file.exists) file.delete(); }
