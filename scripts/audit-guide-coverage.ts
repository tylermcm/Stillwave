import { mkdir, writeFile, access, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { compileGuideBundle } from '../src/core/guideBundle';
import { parseWatchYourGuide } from '../src/core/providerGuides';
import { collectGuideSupplements } from './collect-guide-supplements';
import { collectCablecastGuide } from './collect-cablecast-guide';
import { collectProviderGuides } from './collect-provider-guides';
import { parseM3u } from '../src/core/m3u';
import { importGuideBytes, serializeGuide } from '../src/core/guideImport';
import { createGuideView, guideCoverage } from '../src/core/guides';
import { DEFAULT_TV_GUIDES, DEFAULT_TV_PLAYLIST } from '../src/core/tvDefaults';
import { EMPTY_LIBRARY, type GuideSource } from '../src/types';

// Run: pnpm exec tsx scripts/audit-guide-coverage.ts
// Downloads the actual defaults and uses the app's streaming parser and matcher.
async function main() {
  const reuseDownloads = process.argv.includes('--reuse-downloads');
  const build = process.argv.includes('--build');
  const directory = '.build-tmp/guide-coverage';
  await mkdir(directory, { recursive: true });
  const response = await fetch(DEFAULT_TV_PLAYLIST, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Playlist HTTP ${response.status}`);
  const playlist = await response.text();
  await writeFile(`${directory}/us.m3u`, playlist);
  const channels = parseM3u(playlist, DEFAULT_TV_PLAYLIST).channels.map(c => ({ ...c, playlistId: 'playlist-tv-us' }));
  const now = Date.now(), sources: GuideSource[] = [], results: Record<string, unknown>[] = [];
  for (const definition of DEFAULT_TV_GUIDES) {
    const started = Date.now();
    try {
      const cachedNames: Record<string, string> = { 'guide-tv-us-national': 'us', 'guide-tv-us-backup': 'epgpw', 'guide-tv-us-samsung': 'samsung', 'guide-tv-us-plex': 'plex', 'guide-tv-us-roku': 'roku', 'guide-tv-us-pbs': 'pbs' };
      const json = definition.id === 'guide-tv-us-tvs';
      const cachedPath = json ? '.build-tmp/guide-audit/watchyour-probe.txt' : `.build-tmp/guide-audit/${cachedNames[definition.id]}.xml.gz`;
      const reuse = reuseDownloads && (json || !!cachedNames[definition.id]) && await access(cachedPath).then(() => true, () => false);
      const feed = reuse ? undefined : await fetch(definition.url, { signal: AbortSignal.timeout(180_000) });
      if (feed && (!feed.ok || !feed.body)) throw new Error(`HTTP ${feed.status}`);
      const reader = feed?.body!.getReader();
      let bytes = 0;
      async function* chunks() {
        if (reuse) { for await (const value of createReadStream(cachedPath)) { bytes += value.length; yield value; } return; }
        try { while (true) { const { done, value } = await reader!.read(); if (done) return; bytes += value.length; yield value; } }
        finally { await reader!.cancel().catch(() => {}); reader!.releaseLock(); }
      }
      let guide;
      if (json) {
        const parts: Buffer[] = [];
        for await (const part of chunks()) {
          if (bytes > 8 * 1024 * 1024) throw new Error('JSON guide exceeded size limit.');
          parts.push(Buffer.from(part));
        }
        guide = parseWatchYourGuide(JSON.parse(Buffer.concat(parts).toString('utf8')), channels, now);
      } else guide = await importGuideBytes(chunks(), channels, {}, now);
      const source: GuideSource = { ...definition, playlistIds: ['playlist-tv-us'], guide };
      const before = guideCoverage(channels, createGuideView({ ...EMPTY_LIBRARY, guideSources: sources }), now).available;
      sources.push(source);
      const individual = guideCoverage(channels, createGuideView({ ...EMPTY_LIBRARY, guideSources: [source] }), now);
      const after = guideCoverage(channels, createGuideView({ ...EMPTY_LIBRARY, guideSources: sources }), now).available;
      const text = serializeGuide(guide);
      await writeFile(`${directory}/${definition.id}.xml`, text);
      const row = { ...definition, reusedDownload: reuse, downloadedBytes: bytes, cacheBytes: Buffer.byteLength(text), milliseconds: Date.now() - started, ...individual, addedCoverage: after - before };
      results.push(row); console.log(JSON.stringify(row));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      results.push({ ...definition, error: message });
      console.error(`${definition.name}: ${message}`);
      process.exitCode = 1;
    }
  }
  const defaults = createGuideView({ ...EMPTY_LIBRARY, guideSources: sources });
  const defaultCoverage = guideCoverage(channels, defaults, now);
  if (build) {
    if (results.some(r => 'error' in r)) throw new Error('A source failed. The last combined guide is kept; retry the build.');
    const missing = () => {
      const view = createGuideView({ ...EMPTY_LIBRARY, guideSources: sources });
      return channels.filter(c => !(view.guide?.programmes[view.matcher(c) || ''] ?? []).some(p => p.stop > now));
    };
    const append = async (supplement: GuideSource) => {
      const before = guideCoverage(channels, createGuideView({ ...EMPTY_LIBRARY, guideSources: sources }), now).available;
      sources.push(supplement);
      await writeFile(`${directory}/${supplement.id}.xml`, serializeGuide(supplement.guide));
      const available = guideCoverage(channels, createGuideView({ ...EMPTY_LIBRARY, guideSources: [supplement] }), now).available;
      const after = guideCoverage(channels, createGuideView({ ...EMPTY_LIBRARY, guideSources: sources }), now).available;
      results.push({ id: supplement.id, name: supplement.name, url: supplement.url ?? 'https://www.tvpassport.com/', available, addedCoverage: after - before, refreshHours: supplement.refreshHours, collector: true });
    };
    await append(await collectGuideSupplements(missing(), now, reuseDownloads));
    for (const source of await collectProviderGuides(missing(), now, reuseDownloads)) await append(source);
    await append(await collectCablecastGuide(missing(), now, reuseDownloads));
  }
  const view = createGuideView({ ...EMPTY_LIBRARY, guideSources: sources });
  const details = channels.map(channel => {
    const id = view.matcher(channel);
    const shows = (id ? view.guide?.programmes[id] ?? [] : []).filter(p => p.stop > now);
    return { id: channel.id, tvgId: channel.tvgId, name: channel.name, group: channel.group, guideId: id ?? null, upcoming: shows.length,
      firstStart: shows.length ? new Date(shows[0]!.start).toISOString() : null,
      lastStop: shows.length ? new Date(Math.max(...shows.map(p => p.stop))).toISOString() : null };
  });
  const coverage = guideCoverage(channels, view, now);
  const report = { auditedAt: new Date(now).toISOString(), playlist: DEFAULT_TV_PLAYLIST, coverage, defaultCoverage, sources: results,
    priorityChannels: details.filter(c => /ESPN|Fox Sports [12]|Crunchyroll|HIDIVE/i.test(c.name)),
    missing: details.filter(c => !c.upcoming), channels: details };
  await writeFile('artifacts/guide-coverage.json', JSON.stringify(report, null, 2) + '\n');
  await writeFile('artifacts/guide-coverage.md', [
    '# US guide coverage audit', '', `Audited ${report.auditedAt}. Counts include separate stream entries.`, '',
    `Direct fallback feeds: **${defaultCoverage.available}/${defaultCoverage.total}** with current/future listings.`,
    `Combined guide${build ? ' including collected supplements' : ''}: **${coverage.available}/${coverage.total}**; **${coverage.missing}** unmatched.`, '',
    '| Source | With listings | Added coverage |', '| --- | ---: | ---: |',
    ...results.map(s => `| [${s.name}](${s.url}) | ${s.available ?? 'failed'} | ${s.addedCoverage ?? '—'} |`), '',
    'Station identities preserve region, language, subchannel and stream identity. Provider ID aliases come from the iptv-org station catalogs and reviewed station overrides. Global Pluto/Plex supplements require exact provider identities; foreign display names cannot create matches. WatchYour and Cablecast require an exact published stream host/path. Cablecast keeps explicit UTC offsets and published end times. TV Passport verifies the station heading and uses its declared IANA zone and duration; ambiguous DST wall times are skipped.', '',
    'No program placeholders are generated. An unmatched channel has no verified listing in this run; this does not establish that no schedule exists elsewhere. Full channel assignments, missing list and horizons are in guide-coverage.json. Collector results and failures are in guide-supplement-audit.json, guide-provider-audit.json and guide-cablecast-audit.json.', '',
    'Run `pnpm guide:build` to fetch current feeds, collect missing TV Passport, global provider and Cablecast schedules, and generate verified XML/XML.gz under artifacts/epg. `--reuse-downloads` is a development option using prior downloads, not a live freshness audit.', '',
    'The Refresh hosted EPG GitHub Actions workflow publishes verified output to https://tylermcm.github.io/Stillwave/stillwave-us.xml.gz every six hours. Check status.json at that host for the actual public generation time. Local builds do not publish automatically.', '',
    '[Collector catalogs](https://github.com/iptv-org/epg) · [IPTV-EPG](https://iptv-epg.org/guides) · [EPG.PW](https://epg.pw/xmltv.html?lang=en)', '',
  ].join('\n'));
  if (build) {
    if (results.some(r => 'error' in r)) throw new Error('A source failed. The last combined guide is kept; retry the build.');
    const { guide, assignments } = compileGuideBundle(channels, view, now);
    const text = serializeGuide(guide);
    const directory = 'artifacts/epg';
    await mkdir(directory, { recursive: true });
    // Verify the emitted XML through the same parser before replacing outputs.
    const bytes = new TextEncoder().encode(text);
    async function* output() { yield bytes; }
    const restored = await importGuideBytes(output(), channels, {}, now);
    if (Object.keys(restored.programmes).length !== assignments.length) throw new Error('Combined guide roundtrip failed.');
    await writeFile(`${directory}/stillwave-us.xml.next`, text);
    await writeFile(`${directory}/stillwave-us.xml.gz.next`, gzipSync(bytes));
    await rename(`${directory}/stillwave-us.xml.next`, `${directory}/stillwave-us.xml`);
    await rename(`${directory}/stillwave-us.xml.gz.next`, `${directory}/stillwave-us.xml.gz`);
    await writeFile(`${directory}/manifest.json`, JSON.stringify({ generatedAt: report.auditedAt, coverage, sources: results, assignments }, null, 2) + '\n');
    console.log(`Verified combined guide: ${assignments.length} streams, ${text.length} XML characters.`);
  }
  console.log(JSON.stringify({ coverage, priorityChannels: report.priorityChannels }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
