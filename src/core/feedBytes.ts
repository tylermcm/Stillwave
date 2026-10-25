import { Gunzip } from 'fflate';

export const MAX_FEED_BYTES = 64 * 1024 * 1024;
export const MAX_PLAYLIST_BYTES = 12 * 1024 * 1024;

export function decodeFeed(bytes: Uint8Array, limit = MAX_FEED_BYTES): string {
  if (bytes.length > limit) throw new Error('This file is too large. Choose a smaller channel or country guide.');
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let total = 0;
  const unzip = new Gunzip((chunk, final) => {
    total += chunk.length;
    if (total > limit) throw new Error('The expanded guide is too large. Use a smaller channel or country guide.');
    parts.push(decoder.decode(chunk, { stream: !final }));
  });
  for (let offset = 0; offset < bytes.length; offset += 1024) unzip.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  return parts.join('');
}
