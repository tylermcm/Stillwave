import { SaxesParser } from 'saxes';
import type { Channel, Guide, Programme } from '../types';
import stationAliases from '../data/guideStationAliases.json';

const providerStationIds = new Map<string, string[]>(Object.entries(stationAliases.stations));

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

export const canonicalGuideId = (id: string) => id
  .replace(/@(SD|HD|FHD|UHD|4K|8K|\d{3,4}p)$/i, '')
  .replace(/@(?:SD|HD|FHD|UHD|4K)(East|West)$/i, '@$1')
  .replace(/@(East|West)(?:SD|HD|FHD|UHD|4K)$/i, '@$1')
  // Plex prefixes a stable station ID with a changing guide/container ID.
  .replace(/^[a-f\d]{24}-([a-f\d]{24})$/i, 'plex:$1').toLowerCase();
export const guideName = (name: string) => name.replace(/^US\s*-\s*/i, '').replace(/\s*\[(?:Geo-blocked|Not 24\/7)\]/gi, '').replace(/\s*\((?:\d{3,4}p|United States)\)/gi, '').replace(/\s+(?:SD|HD|FHD|UHD|4K)(?=\s|$)/gi, '').trim();
export const normalizeName = (name: string): string => name.toLowerCase().replace(/\+/g, 'plus').replace(/[^\p{L}\p{N}]/gu, '');

/** Callsign aliases apply only to a main digital station, never its subchannels. */
export function guideNameKeys(name: string): string[] {
  const clean = guideName(name).replace(/^FS([12])\s+(?=Fox Sports \1$)/i, '');
  const keys = [normalizeName(clean)];
  const station = /^([KW][A-Z0-9]{2,5})-(?:DT|TV|LD)$/i.exec(clean);
  if (station) keys.push(normalizeName(station[1]!));
  return keys;
}
function channelStation(channel: Channel): string | undefined {
  const [network, variant] = (channel.tvgId || '').split('@');
  if (variant && /^[KW][A-Z0-9]{3,7}$/.test(variant) && !/^(?:ABC|CBS|NBC|Fox|CW|MyNetworkTV)\.us$/i.test(network || '')) return undefined;
  const candidate = variant && !/^(?:east|west)$/i.test(variant) && /^[KW][A-Z0-9]{3,7}$/.test(variant) ? variant : network?.match(/^([KW][A-Z0-9]{3,7})\.us$/)?.[1];
  if (!candidate) return undefined;
  return /^([KW][A-Z0-9]{3,5})(?:TV|DT|LD)$/.exec(candidate)?.[1] || candidate;
}
function channelRegion(channel: Channel): 'east' | 'west' | undefined {
  const region = /@(East|West)$/i.exec(canonicalGuideId(channel.tvgId || ''))?.[1]?.toLowerCase();
  return region as 'east' | 'west' | undefined;
}
function regionBaseNames(channel: Channel) {
  return [channel.tvgName, channel.name].filter((s): s is string => !!s).map(guideName).map(name => name.replace(/\s+(?:East|Eastern|West|Pacific)$/i, ''));
}
function regionalNameKeys(channel: Channel): string[] {
  const region = channelRegion(channel);
  return region ? regionBaseNames(channel).flatMap(name => (region === 'west' ? ['West', 'Pacific'] : ['East', 'Eastern']).map(label => normalizeName(`${name} ${label}`))) : [];
}
function channelNameKeys(channel: Channel): string[] {
  const names = [channel.tvgName, channel.name].filter((s): s is string => !!s);
  const station = channelStation(channel);
  if (station) names.push(station);
  return [...new Set([...names.flatMap(guideNameKeys), ...regionalNameKeys(channel)])];
}

// Public Pluto guides use the provider's station ID, while iptv-org uses its
// own ID. The stream link identifies the exact station without guessing names.
export function guideIds(channel: Channel): string[] {
  const ids = [`stillwave:${channel.sourceId ?? channel.id}`, ...(channel.tvgId ? [...new Set([channel.tvgId, channel.tvgId.replace(/@(SD|HD|FHD|UHD|4K|8K|\d{3,4}p)$/i, '')])] : [])];
  const station = channelStation(channel);
  if (station) {
    const network = /^(ABC|CBS|NBC|Fox|CW|MyNetworkTV)\.us@/i.exec(channel.tvgId || '')?.[1];
    if (network) ids.push(`${network}${station}.us`);
    ids.push(`${station}.us`);
  }
  try {
    const url = new URL(channel.url);
    // PBS' local guide uses bare callsigns. Verify the stream is the primary
    // PBS station; a hostname containing DT2/DT4 is a distinct subchannel.
    const pbsStation = /^PBS\.us@([KW][A-Z0-9]{3,7})$/i.exec(channel.tvgId || '')?.[1]?.replace(/(?:TV|DT|LD)$/i, '');
    if (pbsStation && url.hostname.endsWith('.pbs.org') && new RegExp(`^(?:hls-)?${pbsStation}dt(?:[.-]|$)`, 'i').test(url.hostname)) ids.push(pbsStation.toUpperCase());
    const providerId = url.hostname === 'jmp2.uk' ? /^\/plu-([a-f\d]{24})\.m3u8$/i.exec(url.pathname)?.[1]
      : (url.hostname === 'pluto.tv' || url.hostname.endsWith('.pluto.tv')) ? /\/channel\/([a-f\d]{24})(?:\/|$)/i.exec(url.pathname)?.[1] : undefined;
    if (providerId && !ids.includes(providerId)) ids.push(providerId);
  } catch { /* Invalid stream addresses are rejected by the playlist parser. */ }
  // Curated provider catalog links retain the complete region/language variant.
  // They never derive an East/West or translated station from a base network ID.
  for (const id of providerStationIds.get(canonicalGuideId(channel.tvgId || '')) ?? []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

export function createGuideMatcher(guide: Guide | undefined) {
  const names = new Map<string, Set<string>>();
  const idsByKey = new Map<string, Set<string>>();
  for (const [id, labels] of Object.entries(guide?.channels ?? {})) {
    const idKey = canonicalGuideId(id);
    const matchingIds = idsByKey.get(idKey) ?? new Set<string>(); matchingIds.add(id); idsByKey.set(idKey, matchingIds);
    for (const name of labels) {
      for (const key of guideNameKeys(name)) {
        const ids = names.get(key) ?? new Set<string>();
        ids.add(id); names.set(key, ids);
      }
    }
  }
  return (channel: Channel, mappings: Record<string, string> = {}): string | undefined => {
    if (!guide) return undefined;
    const manual = mappings[channel.id];
    if (manual && Object.hasOwn(guide.channels, manual)) return manual;
    for (const id of guideIds(channel)) if (Object.hasOwn(guide.channels, id) || Object.hasOwn(guide.programmes, id)) return id;
    for (const id of guideIds(channel)) {
      const candidates = idsByKey.get(canonicalGuideId(id));
      if (candidates?.size === 1) return candidates.values().next().value;
    }
    // A named regional feed must never inherit a generic network's schedule.
    const regional = channel.tvgId?.includes('@') && canonicalGuideId(channel.tvgId).includes('@');
    const station = channelStation(channel);
    const region = channelRegion(channel);
    if (regional && !station && !region) return undefined;
    const keys = regional ? station ? [normalizeName(station)] : regionalNameKeys(channel) : channelNameKeys(channel);
    for (const key of keys) {
      const ids = names.get(key);
      if (ids?.size === 1) return ids.values().next().value;
    }
    // North American catalogs label the alternate feed West/Pacific while
    // leaving the paired Eastern feed unqualified. Require that distinct pair;
    // never apply this inference to an isolated generic network listing.
    if (region === 'east') for (const name of regionBaseNames(channel)) {
      const generic = names.get(normalizeName(name));
      const pacific = names.get(normalizeName(`${name} West`)) || names.get(normalizeName(`${name} Pacific`));
      if (generic?.size === 1 && pacific?.size === 1 && [...generic][0] !== [...pacific][0]) return generic.values().next().value;
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

export function createXmltvParser(
  channels: Channel[], mappings: Record<string, string> = {}, now = Date.now(),
) {
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  const wanted = new Set([...channels.flatMap(guideIds), ...Object.values(mappings)]);
  const wantedIds = new Set(channels.flatMap(guideIds).map(canonicalGuideId));
  const wantedNames = new Set(channels.flatMap(channelNameKeys));
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
        if (wantedIds.has(canonicalGuideId(currentChannel.id)) || currentChannel.names.some(n => guideNameKeys(n).some(key => wantedNames.has(key)))) wanted.add(currentChannel.id);
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
  const invalid = (error: unknown): never => {
    if (error instanceof Error && /too large|document type/.test(error.message)) throw error;
    throw new Error('The guide contains invalid XML. Download the generated XMLTV guide.xml file again.');
  };
  return {
    write(text: string) { try { parser.write(text); } catch (error) { invalid(error); } },
    finish(): Guide {
      try { parser.close(); } catch (error) { invalid(error); }
  if (root !== 'tv') throw new Error('Choose an XMLTV guide.xml file. A GitHub repo page or .channels.xml configuration is not a program guide.');
  if (!Object.keys(guide.channels).length && !count) throw new Error('This XMLTV file contains no channels or programs.');
  for (const [id, programmes] of Object.entries(guide.programmes)) {
    programmes.sort((a, b) => a.start - b.start);
    guide.programmes[id] = programmes.filter((p, i) => i === 0 || p.start !== programmes[i - 1]!.start || p.title !== programmes[i - 1]!.title);
  }
  return guide;
    },
  };
}

export async function parseXmltv(text: string, channels: Channel[], mappings: Record<string, string> = {}, now = Date.now()): Promise<Guide> {
  const parser = createXmltvParser(channels, mappings, now);
  for (let offset = 0; offset < text.length; offset += 65_536) {
    parser.write(text.slice(offset, offset + 65_536));
    if (offset % 524_288 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return parser.finish();
}
