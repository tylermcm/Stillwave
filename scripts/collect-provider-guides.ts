import { writeFile } from 'node:fs/promises';
import { importGuideBytes } from '../src/core/guideImport';
import { exactProviderSupplement } from '../src/core/providerSupplement';
import { guideIds, canonicalGuideId } from '../src/core/xmltv';
import type { Channel, GuideSource } from '../src/types';
import { downloadGuideFile } from './guide-download';

export async function collectProviderGuides(channels: Channel[], now: number, reuse: boolean) {
  const sources: GuideSource[] = [], results: Record<string, unknown>[] = [];
  for (const provider of ['pluto', 'plex'] as const) {
    const wanted = channels.filter(c => guideIds(c).some(id => provider === 'pluto' ? /^[a-f\d]{24}$/i.test(id) : /^plex:[a-f\d]{24}$/i.test(canonicalGuideId(id))));
    if (!wanted.length) continue;
    const url = `https://i.mjh.nz/${provider === 'pluto' ? 'PlutoTV' : 'Plex'}/all.xml.gz`;
    try {
      const bytes = await downloadGuideFile(url, `.build-tmp/guide-global/${provider}.xml.gz`, 24 * 1024 * 1024, reuse);
      async function* chunks() { yield bytes; }
      const raw = await importGuideBytes(chunks(), wanted, {}, now);
      const assignments: { channelId: string; tvgId?: string; sourceGuideId: string }[] = [];
      const guide = exactProviderSupplement(raw, wanted, provider, now, (channel, sourceGuideId) => assignments.push({ channelId: channel.id, tvgId: channel.tvgId, sourceGuideId }));
      const source: GuideSource = { id: `guide-tv-global-${provider}`, name: `${provider === 'pluto' ? 'Pluto' : 'Plex'} exact global stream schedules`, url, playlistIds: [], refreshHours: 6, guide };
      sources.push(source);
      const row = { id: source.id, url, requestedStreams: wanted.length, availableStreams: Object.keys(guide.programmes).length, downloadedBytes: bytes.length };
      results.push({ ...row, assignments }); console.log(JSON.stringify(row));
    } catch (error) { results.push({ url, error: error instanceof Error ? error.message : 'Failed' }); }
  }
  await writeFile('artifacts/guide-provider-audit.json', JSON.stringify({ collectedAt: new Date(now).toISOString(), sources: results }, null, 2) + '\n');
  return sources;
}
