import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import catalog from '../src/data/guideStationAliases.json';
import { canonicalGuideId } from '../src/core/xmltv';
import { parseTvPassportPage } from '../src/core/tvPassportGuide';
import type { Channel, GuideSource, Guide, Programme } from '../src/types';

export async function collectGuideSupplements(channels: Channel[], now = Date.now(), reuseDownloads = false) {
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  const failures: { channelId: string; url: string; error: string }[] = [];
  const sites = new Map<string, { channels: Channel[]; id: string }>();
  for (const channel of channels) {
    const id = (catalog.tvPassport as Record<string, string>)[canonicalGuideId(channel.tvgId || '')];
    if (!id || !Object.hasOwn(catalog.tvPassport, canonicalGuideId(channel.tvgId || ''))) continue;
    const item = sites.get(id) ?? { channels: [], id }; item.channels.push(channel); sites.set(id, item);
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  const midnight = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  await mkdir('.build-tmp/tvpassport', { recursive: true });
  for (const station of sites.values()) {
    const list: Programme[] = [];
    for (let day = 0; day < 3; day++) {
      const date = new Date(midnight + day * 86_400_000).toISOString().slice(0, 10);
      const url = `https://www.tvpassport.com/tv-listings/stations/${station.id}/${date}`;
      const cache = `.build-tmp/tvpassport/${station.id.split('/').at(-1)}-${date}.html`;
      try {
        let html = reuseDownloads ? await readFile(cache, 'utf8').catch(() => undefined) : undefined;
        if (!html) {
          await setTimeout(600);
          const response = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'StillWave personal guide collector' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new Error('Schedule page exceeded size limit.');
          html = await response.text();
          if (html.length > 4 * 1024 * 1024) throw new Error('Schedule page exceeded size limit.');
          await writeFile(cache, html);
        }
        list.push(...parseTvPassportPage(html, station.id));
      } catch (error) { failures.push({ channelId: station.channels[0]!.id, url, error: error instanceof Error ? error.message : 'Failed' }); }
    }
    const sorted = list.filter(p => p.stop > now - 86_400_000 && p.start < now + 7 * 86_400_000).sort((a, b) => a.start - b.start)
      .filter((p, i, list) => !i || p.start !== list[i - 1]!.start);
    if (!sorted.some(p => p.stop > now)) continue;
    for (const channel of station.channels) {
      const id = `stillwave:${channel.sourceId ?? channel.id}`;
      guide.channels[id] = [channel.name]; guide.programmes[id] = sorted.map(p => ({ ...p, channelId: id }));
    }
    console.log(`TV Passport: ${station.channels.map(c => c.name).join(', ')} (${sorted.length} listings)`);
  }
  const source: GuideSource = { id: 'guide-tv-supplement', name: 'Verified TV Passport station schedules', playlistIds: [], refreshHours: 12, guide };
  await writeFile('artifacts/guide-supplement-audit.json', JSON.stringify({ collectedAt: new Date(now).toISOString(), requestedStations: sites.size, availableStreams: Object.keys(guide.programmes).length, failures }, null, 2) + '\n');
  return source;
}
