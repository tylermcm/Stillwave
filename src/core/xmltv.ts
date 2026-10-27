import { SaxesParser } from 'saxes';
import type { Channel, Guide, Programme } from '../types';

export function parseXmltvTime(value: string): number | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(Z|[+-]\d{4})?$/.exec(value.trim());
  if (!match) return undefined;
  const [, y, m, d, h, min, sec = '00', zone] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return undefined;
  const utc = Date.UTC(year, month - 1, day, Number(h), Number(min), Number(sec));
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  if (!zone || zone === 'Z') return utc; // XMLTV specifies UTC when no offset is present.
  const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(3, 5));
  if (hours > 23 || minutes > 59) return undefined;
  return utc - (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes) * 60_000;
}

export const normalizeName = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Public Pluto guides use the provider's station ID, while iptv-org uses its
// own ID. The stream link identifies the exact station without guessing names.
export function guideIds(channel: Channel): string[] {
  const ids = channel.tvgId ? [channel.tvgId] : [];
  try {
    const url = new URL(channel.url);
    const providerId = url.hostname === 'jmp2.uk' ? /^\/plu-([a-f\d]{24})\.m3u8$/i.exec(url.pathname)?.[1]
      : (url.hostname === 'pluto.tv' || url.hostname.endsWith('.pluto.tv')) ? /\/channel\/([a-f\d]{24})(?:\/|$)/i.exec(url.pathname)?.[1] : undefined;
    if (providerId && !ids.includes(providerId)) ids.push(providerId);
  } catch { /* Invalid stream addresses are rejected by the playlist parser. */ }
  return ids;
}

export function createGuideMatcher(guide: Guide | undefined) {
  const names = new Map<string, Set<string>>();
  for (const [id, labels] of Object.entries(guide?.channels ?? {})) {
    for (const name of labels) {
      const key = normalizeName(name);
      const ids = names.get(key) ?? new Set<string>();
      ids.add(id); names.set(key, ids);
    }
  }
  return (channel: Channel, mappings: Record<string, string> = {}): string | undefined => {
    if (!guide) return undefined;
    const manual = mappings[channel.id];
    if (manual && Object.hasOwn(guide.channels, manual)) return manual;
    for (const id of guideIds(channel)) if (Object.hasOwn(guide.channels, id) || Object.hasOwn(guide.programmes, id)) return id;
    for (const name of [channel.tvgName, channel.name]) {
      if (!name) continue;
      const ids = names.get(normalizeName(name));
      if (ids?.size === 1) return ids.values().next().value;
    }
    return undefined;
  };
}

export function nowAndNext(programmes: Programme[] = [], now = Date.now()) {
  // Binary search for the first programme whose start is in the future.
  let lo = 0, hi = programmes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (programmes[mid]!.start <= now) lo = mid + 1;
    else hi = mid;
  }
  const candidate = programmes[lo - 1];
  return { now: candidate && candidate.stop > now ? candidate : undefined, next: programmes[lo] };
}

export async function parseXmltv(
  text: string,
  channels: Channel[],
  mappings: Record<string, string> = {},
  now = Date.now(),
): Promise<Guide> {
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  const wanted = new Set([...channels.flatMap(guideIds), ...Object.values(mappings)]);
  const wantedNames = new Set(channels.flatMap(c => [c.name, c.tvgName].filter((s): s is string => !!s)).map(normalizeName));
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0;
  let root = '';
  let currentChannel: { id: string; names: string[] } | undefined;
  let currentProgramme: Partial<Programme> | undefined;
  let capture: 'display-name' | 'title' | 'desc' | 'episode-num' | undefined;
  let episodeSystem = '';
  let captured = '';
  let captureDepth = 0;
  let count = 0;
  let retained = 0;
  // Saxes never fetches external DTDs. Allow the standard XMLTV declaration,
  // but reject internal entity declarations; guide imports never resolve entities.
  parser.on('doctype', value => { if (value.includes('[')) throw new Error('XML guides containing internal document type declarations are not supported.'); });
  parser.on('opentag', tag => {
    depth++;
    if (depth === 1) root = tag.name;
    if (root !== 'tv') return;
    if (depth === 2 && tag.name === 'channel') currentChannel = { id: String(tag.attributes.id ?? ''), names: [] };
    if (depth === 2 && tag.name === 'programme') {
      count++;
      const id = String(tag.attributes.channel ?? '');
      const start = parseXmltvTime(String(tag.attributes.start ?? ''));
      const stop = parseXmltvTime(String(tag.attributes.stop ?? ''));
      if (wanted.has(id) && start !== undefined && stop !== undefined && stop > start && stop > now - 86_400_000 && start < now + 7 * 86_400_000) {
        currentProgramme = { channelId: id, start, stop };
      }
    }
    if (depth === 3 && ((currentChannel && tag.name === 'display-name') || (currentProgramme && ['title', 'desc', 'episode-num'].includes(tag.name)))) {
      capture = tag.name as typeof capture; captured = ''; captureDepth = depth;
      if (tag.name === 'episode-num') episodeSystem = String(tag.attributes.system || '');
    }
  });
  const append = (value: string) => { if (capture && captured.length < 4000) captured += value.slice(0, 4000 - captured.length); };
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', tag => {
    if (capture && depth === captureDepth) {
      const value = captured.trim();
      if (capture === 'display-name' && currentChannel && value) currentChannel.names.push(value);
      if (capture === 'title' && currentProgramme && !currentProgramme.title) currentProgramme.title = value;
      if (capture === 'desc' && currentProgramme && !currentProgramme.description) currentProgramme.description = value;
      if (capture === 'episode-num' && currentProgramme && !currentProgramme.episode) {
        if (episodeSystem === 'onscreen') currentProgramme.episode = value.slice(0, 80);
        else if (episodeSystem === 'xmltv_ns') {
          const parts = /^(\d+)(?:\/\d+)?\.(\d+)(?:\/\d+)?/.exec(value);
          if (parts) currentProgramme.episode = `S${Number(parts[1]) + 1} E${Number(parts[2]) + 1}`;
        }
      }
      capture = undefined;
    }
    if (depth === 2 && tag.name === 'channel' && currentChannel) {
      if (currentChannel.id) {
        guide.channels[currentChannel.id] = currentChannel.names;
        if (currentChannel.names.some(n => wantedNames.has(normalizeName(n)))) wanted.add(currentChannel.id);
      }
      currentChannel = undefined;
    }
    if (depth === 2 && tag.name === 'programme') {
      if (currentProgramme?.title) {
        if (++retained > 250_000) throw new Error('This guide is too large. Import a guide for fewer channels.');
        const programme = currentProgramme as Programme;
        (guide.programmes[programme.channelId] ??= []).push(programme);
      }
      currentProgramme = undefined;
    }
    depth--;
  });
  try {
    // Yield between chunks so large guides do not lock the phone's interface.
    for (let offset = 0; offset < text.length; offset += 65_536) {
      parser.write(text.slice(offset, offset + 65_536));
      if (offset % 524_288 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    parser.close();
  } catch (error) {
    if (error instanceof Error && /too large|document type/.test(error.message)) throw error;
    throw new Error('The guide contains invalid XML. Download the generated XMLTV guide.xml file again.');
  }
  if (root !== 'tv') throw new Error('Choose an XMLTV guide.xml file. A GitHub repo page or .channels.xml configuration is not a program guide.');
  if (!Object.keys(guide.channels).length && !count) throw new Error('This XMLTV file contains no channels or programs.');
  for (const [id, programmes] of Object.entries(guide.programmes)) {
    programmes.sort((a, b) => a.start - b.start);
    guide.programmes[id] = programmes.filter((p, i) => i === 0 || p.start !== programmes[i - 1]!.start || p.title !== programmes[i - 1]!.title);
  }
  return guide;
}
