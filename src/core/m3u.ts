import type { Channel, Playlist, StreamKind } from '../types';

export function httpUrl(value: string, base?: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(value.trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function normalizeFeedUrl(value: string): string {
  const valid = httpUrl(value);
  if (!valid) throw new Error('Enter a complete http:// or https:// address.');
  const url = new URL(valid);
  if (url.hostname === 'github.com') {
    const parts = url.pathname.split('/');
    if (parts[3] === 'blob' && parts.length >= 6) {
      return `https://raw.githubusercontent.com/${parts[1]}/${parts[2]}/${parts.slice(4).join('/')}`;
    }
  }
  return valid;
}

function attributes(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  for (const match of line.matchAll(pattern)) {
    result[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function titleSeparator(line: string): number {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === ',') return i;
  }
  return -1;
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

export function inferKind(url: string): StreamKind {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (/\.(ts|mp4|mkv|aac|mp3)$/.test(path)) return 'progressive';
  return 'auto';
}

export function parseM3u(text: string, base?: string): Playlist {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.some(line => line.trim().startsWith('#EXTM3U'))) {
    throw new Error('This is not an M3U playlist. Choose an .m3u file or its direct URL.');
  }
  if (lines.some(line => /^#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/.test(line.trim()))) {
    throw new Error('This is a single HLS stream. Import a channel playlist (.m3u), not a video manifest (.m3u8).');
  }
  const channels: Channel[] = [];
  const guideUrls: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  let info: Record<string, string> = {};
  let name = '';
  let group = '';
  let headers: Record<string, string> = {};
  let kind: StreamKind | undefined;
  let skipped = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTM3U')) {
      const meta = attributes(line);
      for (const item of (meta['x-tvg-url'] || meta['url-tvg'] || '').split(',')) {
        const url = httpUrl(item, base);
        if (url && !guideUrls.includes(url)) guideUrls.push(url);
      }
    } else if (line.startsWith('#EXTINF:')) {
      const comma = titleSeparator(line);
      info = attributes(comma >= 0 ? line.slice(0, comma) : line);
      name = comma >= 0 ? line.slice(comma + 1).trim() : '';
      group = info['group-title'] || '';
      headers = {};
      kind = undefined;
    } else if (line.startsWith('#EXTGRP:')) {
      group = line.slice(8).trim();
    } else if (line.startsWith('#EXTVLCOPT:')) {
      const match = /^#EXTVLCOPT:http-(user-agent|referrer)=(.*)$/i.exec(line);
      if (match) headers[match[1]!.toLowerCase() === 'user-agent' ? 'User-Agent' : 'Referer'] = match[2]!;
    } else if (line.startsWith('#KODIPROP:inputstream.adaptive.manifest_type=')) {
      const value = line.split('=').at(-1);
      if (value === 'hls' || value === 'mpd') kind = value === 'mpd' ? 'dash' : 'hls';
    } else if (!line.startsWith('#')) {
      const separator = line.indexOf('|');
      const url = httpUrl(separator < 0 ? line : line.slice(0, separator), base);
      if (separator >= 0) {
        const params = new URLSearchParams(line.slice(separator + 1));
        for (const [key, value] of params) {
          if (['user-agent', 'referer', 'origin', 'authorization', 'cookie'].includes(key.toLowerCase())) headers[key] = value;
        }
      }
      if (!url) skipped++;
      else if (!seen.has(url)) {
        seen.add(url);
        const channelName = name || info['tvg-name'] || `Channel ${channels.length + 1}`;
        const identity = info['tvg-id'] ? `${info['tvg-id']}|${channelName}|${group}` : url;
        let id = stableId(identity);
        if (ids.has(id)) id = `${id}-${stableId(url)}`;
        while (ids.has(id)) id += 'x';
        ids.add(id);
        channels.push({
          id,
          name: channelName,
          tvgId: info['tvg-id'] || undefined,
          tvgName: info['tvg-name'] || undefined,
            number: info['tvg-chno'] || info['channel-number'] || undefined,
          group: group || 'Other', logo: httpUrl(info['tvg-logo'] || '', base),
          url, headers: { ...headers }, kind: kind || inferKind(url),
        });
      }
      info = {}; name = ''; group = ''; headers = {}; kind = undefined;
    }
  }
  if (!channels.length) throw new Error('No supported HTTP channels were found in this playlist.');
  if (skipped) warnings.push(`${skipped} entries used unsupported addresses and were skipped.`);
  return { channels, guideUrls, warnings };
}
