import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { parseStored, type LocalItem, type PickedFile } from '../core/localMedia';

// App-private storage of the list only; the media files themselves stay where the person keeps them.
const store = () => new File(Paths.document, 'local-media-v1.json');

export async function loadLocalMedia(): Promise<LocalItem[]> {
  const file = store();
  return file.exists ? parseStored(await file.text()) : [];
}
export async function saveLocalMedia(items: readonly LocalItem[]): Promise<void> {
  const temporary = new File(Paths.document, 'local-media-v1.next.json');
  await temporary.write(JSON.stringify(items));
  await temporary.copy(store(), { overwrite: true });
  temporary.delete();
}
/** Uses the system file picker: only the files the person selects are shared with the app. */
export async function pickLocalMedia(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['video/*', 'audio/*'], multiple: true, copyToCacheDirectory: false });
  if (result.canceled) return [];
  return result.assets.map(asset => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }));
}
