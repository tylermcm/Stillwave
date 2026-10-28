import * as DocumentPicker from 'expo-document-picker';
import { parseStored, type LocalItem, type PickedFile } from '../core/localMedia';

// Web is a development preview: choosing a file gives a session-only address.
export async function loadLocalMedia(): Promise<LocalItem[]> { return parseStored(localStorage.getItem('stillwave-local-media-v1')); }
export async function saveLocalMedia(items: readonly LocalItem[]): Promise<void> { localStorage.setItem('stillwave-local-media-v1', JSON.stringify(items)); }
export async function pickLocalMedia(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['video/*', 'audio/*'], multiple: true, copyToCacheDirectory: false });
  if (result.canceled) return [];
  return result.assets.map(asset => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }));
}
