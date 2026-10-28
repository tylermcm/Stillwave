import type { Programme } from '../types';
import { parseXmltvTime } from './xmltv';

export function scheduleStreamKey(input: string) {
  try {
    const url = new URL(input);
    return /^https?:$/.test(url.protocol) ? `${url.host.toLowerCase()}${url.pathname}` : '';
  } catch { return ''; }
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  // An explicit offset is essential: never interpret a station's wall time in
  // the collector machine's zone, especially across the November DST change.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return undefined;
  const result = parseXmltvTime(`${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]} ${m[8]!.replace(':', '')}`);
  return result === undefined ? undefined : result + Number((m[7] || '').padEnd(3, '0'));
}

type Item = { siteId?: unknown; deleted?: unknown; runDateTime?: unknown; endDateTime?: unknown; title?: unknown };
type Root = {
  canAccessSite?: boolean; requiresMembership?: boolean;
  site?: { siteId?: unknown; liveStreamUrl?: unknown; liveStreamRequiresMembership?: boolean; otherSites?: { siteId?: unknown }[] };
  schedule?: { scheduleItems?: Item[] };
};

/** Read the site's published JSON hydration payload, never execute its scripts. */
export function parseCablecastPage(html: string, now = Date.now()) {
  const match = /<script\b[^>]*>\s*window\.__remixContext\s*=\s*([\s\S]*?);\s*<\/script>/i.exec(html);
  if (!match) throw new Error('Cablecast public schedule format not found.');
  const data = JSON.parse(match[1]!) as { state?: { loaderData?: { root?: Root } } };
  const root = data?.state?.loaderData?.root;
  const site = root?.site;
  if (!site || !Number.isSafeInteger(site.siteId) || Number(site.siteId) < 1) throw new Error('Cablecast site identity missing.');
  const siteId = Number(site.siteId);
  const otherSiteIds = [...new Set((Array.isArray(site.otherSites) ? site.otherSites : [])
    .map(s => s?.siteId).filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))];
  const streamUrl = typeof site.liveStreamUrl === 'string' ? site.liveStreamUrl : '';
  const programmes: Programme[] = [];
  const restricted = root?.canAccessSite === false || root?.requiresMembership || site.liveStreamRequiresMembership;
  if (!restricted && Array.isArray(root?.schedule?.scheduleItems)) for (const item of root.schedule.scheduleItems) {
    if (!item || item.deleted || item.siteId !== siteId || typeof item.title !== 'string' || !item.title.trim()) continue;
    const start = timestamp(item.runDateTime), stop = timestamp(item.endDateTime);
    if (start === undefined || stop === undefined || stop <= start || stop - start > 86_400_000 || stop <= now - 86_400_000 || start >= now + 7 * 86_400_000) continue;
    programmes.push({ channelId: `cablecast:${siteId}`, title: item.title.trim().slice(0, 4000), start, stop });
  }
  programmes.sort((a, b) => a.start - b.start);
  return { siteId, streamUrl, otherSiteIds, programmes: programmes.filter((p, i) => !i || p.start !== programmes[i - 1]!.start) };
}
