import type { Channel, Guide, Programme } from '../types';
import { parseXmltvTime } from './xmltv';

function streamKey(input: string) {
  try { const url = new URL(input); return `${url.hostname.toLowerCase()}${url.pathname}`; } catch { return ''; }
}

/** WatchYour publishes exact playout URLs; do not infer a TVS station by name. */
export function parseWatchYourGuide(data: unknown, channels: Channel[], now = Date.now()): Guide {
  if (!Array.isArray(data)) throw new Error('The WatchYour guide format changed.');
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  for (const channel of channels) {
    const key = streamKey(channel.url);
    const candidates = data.filter(item => item && typeof item.url === 'string' && key && streamKey(item.url) === key);
    if (candidates.length !== 1 || !Array.isArray(candidates[0].shows)) continue;
    const id = `stillwave:${channel.sourceId ?? channel.id}`;
    const programmes: Programme[] = [];
    for (const item of candidates[0].shows) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || !/^\d{10}$/.test(String(item.tms))) continue;
      const start = Number(item.tms) * 1000;
      const stamp = (date: unknown, time: unknown) => typeof date === 'string' && typeof time === 'string' && /^[+-]\d{4}$/.test(item.timezone)
        ? parseXmltvTime(`${date.replace(/-/g, '')}${time.replace(/:/g, '')} ${item.timezone}`) : undefined;
      const checkStart = stamp(item.start_day, item.start), stop = stamp(item.end_day, item.end);
      if (checkStart !== start || stop === undefined || stop <= start || stop <= now - 86_400_000 || start >= now + 7 * 86_400_000) continue;
      programmes.push({ channelId: id, title: item.name.trim().slice(0, 4000), start, stop });
    }
    if (!programmes.length) continue;
    guide.channels[id] = [channel.name];
    guide.programmes[id] = programmes.sort((a, b) => a.start - b.start).filter((p, i, list) => !i || p.start !== list[i - 1]!.start);
  }
  return guide;
}
