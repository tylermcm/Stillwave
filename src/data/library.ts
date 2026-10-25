import { File, Paths } from 'expo-file-system';
import { EMPTY_LIBRARY, type Library } from '../types';
import { createLibraryWriter } from '../core/libraryWriter';

// This is app-private local storage, not encrypted storage. See README privacy notes.
const libraryFile = () => new File(Paths.document, 'library-v1.json');

export async function loadLibrary(): Promise<Library> {
  const file = libraryFile();
  if (!file.exists) return { ...EMPTY_LIBRARY };
  const data = JSON.parse(await file.text()) as Library;
  const channels = new File(Paths.document, 'channels-v1.json');
  const guide = new File(Paths.document, 'guide-v1.json');
  if (channels.exists) data.channels = JSON.parse(await channels.text());
  if (guide.exists) data.guide = JSON.parse(await guide.text()) ?? undefined;
  if (data.version !== 1 || !Array.isArray(data.channels) || !Array.isArray(data.favorites)) {
    throw new Error('The saved library could not be read. Import your playlist again.');
  }
  const library = { ...EMPTY_LIBRARY, ...data };
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

export async function cacheGuideSource(text: string): Promise<void> {
  await new File(Paths.document, 'guide-source.xml').write(text);
}

export async function loadGuideSource(): Promise<string | undefined> {
  const file = new File(Paths.document, 'guide-source.xml');
  return file.exists ? file.text() : undefined;
}
