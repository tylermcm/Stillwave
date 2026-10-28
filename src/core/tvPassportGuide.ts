import type { Programme } from '../types';

const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…' };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, key: string) => {
  if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? original;
  const value = key[1]?.toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
  return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : original;
});
function attributes(tag: string) {
  const attrs: Record<string, string> = Object.create(null);
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[match[1]!.toLowerCase()] = decode(match[2] ?? match[3] ?? '');
  return attrs;
}

/** Reject missing and ambiguous wall times instead of shifting a program by an hour. */
export function scheduleWallTime(value: string, zone: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return undefined;
  const wall = Date.parse(value.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 19).replace('T', ' ') !== value) return undefined;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const local = (time: number) => {
    const p = Object.fromEntries(format.formatToParts(time).map(p => [p.type, p.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  };
  const offsets = new Set([-36, 0, 36].map(hours => {
    const time = wall + hours * 3600_000;
    return Date.parse(local(time).replace(' ', 'T') + 'Z') - time;
  }));
  const candidates = [...offsets].map(offset => wall - offset).filter(time => local(time) === value);
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Only the published listing attributes are read; scripts and page text are ignored. */
export function parseTvPassportPage(html: string, channelId: string, expectedStation?: string): Programme[] {
  if (expectedStation) {
    const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
    const label = heading && decode(heading.replace(/<[^>]*>/g, '')).replace(/^TV Schedule for\s+/i, '').replace(/\s+/g, ' ').trim();
    if (label !== expectedStation.replace(/\s+/g, ' ').trim()) throw new Error('TV Passport returned a different station.');
  }
  const selector = /<select\b[^>]*\bid=["']timezone_selector["'][^>]*>([\s\S]*?)<\/select>/i.exec(html)?.[1];
  const selected = selector?.match(/<option\b(?=[^>]*\bselected\b)[^>]*>/i)?.[0];
  const zone = selected && attributes(selected).value;
  if (!zone) throw new Error('TV Passport did not identify the schedule time zone.');
  const result: Programme[] = [];
  for (const [tag] of html.matchAll(/<div\b[^>]*\bdata-st\s*=[^>]*>/gi)) {
    const a = attributes(tag);
    const start = scheduleWallTime(a['data-st'] ?? '', zone);
    const minutes = Number(a['data-duration']);
    const title = a['data-showname'] === 'Movie' && a['data-episodetitle'] ? a['data-episodetitle'] : a['data-showname'];
    if (start === undefined || !title?.trim() || !Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) continue;
    result.push({ channelId, title: title.trim().slice(0, 4000), start, stop: start + minutes * 60_000,
      description: a['data-description']?.slice(0, 4000) || undefined, episode: a['data-episodenumber']?.slice(0, 80) || undefined });
  }
  if (!result.length) throw new Error('TV Passport returned no usable schedule listings.');
  return result.sort((a, b) => a.start - b.start).filter((p, i, list) => !i || p.start !== list[i - 1]!.start);
}
