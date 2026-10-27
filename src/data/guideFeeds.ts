import { fetch } from 'expo/fetch';
import { GUIDE_LIMITS, importGuideBytes, serializeGuide } from '../core/guideImport';
import { normalizeFeedUrl } from '../core/m3u';
import type { Channel } from '../types';
import { parseWatchYourGuide } from '../core/providerGuides';

export async function downloadGuide(input: string, channels: Channel[], mappings: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(normalizeFeedUrl(input), { signal: controller.signal });
    if (!response.ok) throw new Error(`The server returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length')) > GUIDE_LIMITS.compressed) throw new Error('This feed is too large. Choose a smaller guide.');
    reader = response.body?.getReader();
    if (!reader) throw new Error('The guide server did not provide a readable response.');
    const stream = reader;
    async function* chunks() { while (true) { const { done, value } = await stream.read(); if (done) return; yield value; } }
    if (new URL(normalizeFeedUrl(input)).href === 'https://www.watchyour.tv/guide.json') {
      const parts: string[] = [], decoder = new TextDecoder(); let bytes = 0;
      for await (const part of chunks()) {
        bytes += part.length;
        if (bytes > 8 * 1024 * 1024) throw new Error('This feed is too large. Choose a smaller guide.');
        parts.push(decoder.decode(part, { stream: true }));
      }
      parts.push(decoder.decode());
      const guide = parseWatchYourGuide(JSON.parse(parts.join('')), channels);
      return { guide, text: serializeGuide(guide) };
    }
    const guide = await importGuideBytes(chunks(), channels, mappings);
    return { guide, text: serializeGuide(guide) };
  } catch (error) {
    // Do not leak private provider URLs from networking/parser exceptions.
    if (error instanceof Error && /^(The server returned HTTP|This feed is too large|The expanded guide|The guide contains invalid XML|Choose an XMLTV|This XMLTV|XML guides containing)/.test(error.message)) throw error;
    throw new Error(controller.signal.aborted ? 'The guide download timed out. Try again on a better connection.' : 'Could not download the guide. Check the source and your connection.');
  } finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
}
