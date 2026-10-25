import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { decodeFeed, MAX_FEED_BYTES } from '../core/feedBytes';
import { normalizeFeedUrl } from '../core/m3u';

export async function downloadFeed(input: string, limit = MAX_FEED_BYTES): Promise<string> {
  const url = normalizeFeedUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The server returned HTTP ${response.status}. Check the feed address and access.`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('This feed is too large. Choose a smaller feed.');
    const reader = response.body?.getReader();
    if (!reader) return decodeFeed(new Uint8Array(await response.arrayBuffer()), limit);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) { await reader.cancel(); throw new Error('This feed is too large. Choose a smaller feed.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return decodeFeed(bytes, limit);
  } catch (error) {
    // Native networking errors can include credentials from feed URLs. Never surface them.
    if (error instanceof Error && /^(The server returned HTTP|This feed|This file|The expanded)/.test(error.message)) throw error;
    throw new Error(controller.signal.aborted ? 'The feed took too long to download. Try again on a better connection.' : 'Could not download the feed. Check its direct URL and your connection.');
  } finally { clearTimeout(timeout); }
}

export async function pickFeed(limit = MAX_FEED_BYTES): Promise<{ text: string; name: string } | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return undefined;
  const asset = result.assets[0]!;
  if (Platform.OS === 'web' && asset.file) {
    if (asset.file.size > limit) throw new Error('This file is too large. Choose a smaller feed.');
    return { text: decodeFeed(new Uint8Array(await asset.file.arrayBuffer()), limit), name: asset.name };
  }
  const file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size ?? 0) > limit) throw new Error('This file is too large. Choose a smaller feed.');
    return { text: decodeFeed(await file.bytes(), limit), name: asset.name };
  } finally { if (file.exists) file.delete(); }
}
