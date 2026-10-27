import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalGuideId, guideName, normalizeName } from '../src/core/xmltv';
import { parseStationCatalog, type CatalogStation } from './guide-catalog';

// The iptv-org catalog checkout is data only; its scripts are never executed.
async function main() {
  const root = process.argv[2] || '.build-tmp/epg-collectors/sites';
  const coverage = JSON.parse(await readFile('artifacts/guide-coverage.json', 'utf8'));
  const metadataSource = 'https://iptv-org.github.io/api/channels.json';
  const metadataResponse = await fetch(metadataSource, { signal: AbortSignal.timeout(30_000) });
  if (!metadataResponse.ok) throw new Error(`Channel metadata HTTP ${metadataResponse.status}`);
  const metadata = new Map<string, { website?: string; closed?: string; replaced_by?: string }>((await metadataResponse.json()).map((c: { id: string }) => [c.id.toLowerCase(), c]));
  type Candidate = CatalogStation & { catalog: string };
  const ids = new Map<string, Candidate[]>(), names = new Map<string, Candidate[]>();
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    for (const file of await readdir(join(root, directory.name))) {
      if (!file.endsWith('.channels.xml')) continue;
      for (const station of parseStationCatalog(await readFile(join(root, directory.name, file), 'utf8'))) {
        if (!station.site_id || !station.xmltv_id) continue;
        const row = { ...station, catalog: `https://github.com/iptv-org/epg/blob/master/sites/${directory.name}/${file}` };
        const key = canonicalGuideId(station.xmltv_id);
        const matches = ids.get(key) ?? []; matches.push(row); ids.set(key, matches);
        const name = normalizeName(guideName(station.name));
        const similar = names.get(name) ?? []; similar.push(row); names.set(name, similar);
      }
    }
  }
  const rows = coverage.channels.map((channel: { id: string; tvgId?: string; name: string; group: string; upcoming: number; guideId: string | null }) => {
    const collectors = ids.get(canonicalGuideId(channel.tvgId || '')) ?? [];
    const nameCandidates = channel.upcoming || collectors.length ? [] : names.get(normalizeName(guideName(channel.name))) ?? [];
    const status = channel.upcoming ? 'verified_listings' : collectors.length ? 'collector_candidate_unverified' : nameCandidates.length ? 'name_candidate_needs_review' : 'no_catalog_match';
    const station = metadata.get((channel.tvgId || '').split('@')[0]!.toLowerCase());
    return { ...channel, status, officialWebsite: station?.website ?? null, catalogClosedAt: station?.closed ?? null, catalogReplacement: station?.replaced_by ?? null,
      collectors: channel.upcoming ? [] : collectors, nameCandidates };
  });
  const counts: Record<string, number> = {}, sites: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
    for (const site of new Set<string>(row.collectors.map((c: Candidate) => c.site))) sites[site] = (sites[site] || 0) + 1;
  }
  const report = { auditedAt: new Date().toISOString(), coverageAuditedAt: coverage.auditedAt, catalogSource: 'https://github.com/iptv-org/epg', metadataSource, counts, candidateSites: Object.fromEntries(Object.entries(sites).sort((a, b) => b[1] - a[1])), channels: rows };
  await writeFile('artifacts/guide-gap-audit.json', JSON.stringify(report, null, 2) + '\n');
  const missing = rows.filter((r: { upcoming: number }) => !r.upcoming);
  await writeFile('artifacts/guide-gap-audit.md', [
    '# Channel-by-channel guide gap audit', '', `Audited ${report.auditedAt}; coverage snapshot ${report.coverageAuditedAt}.`, '',
    ...Object.entries(counts).map(([status, count]) => `- ${status}: ${count}`), '',
    'An exact collector catalog ID establishes a candidate, not an operational schedule. Names are suggestions only and are never automatically assigned. Quality suffixes are ignored; region, affiliate and language variants are retained.', '',
    '| Unmatched channel | TVG ID | Exact collector candidates | Broadcaster |', '| --- | --- | --- | --- |',
    ...missing.map((r: { name: string; tvgId?: string; collectors: Candidate[]; officialWebsite: string | null }) => `| ${r.name.replace(/\|/g, '/')} | ${r.tvgId ?? ''} | ${[...new Set(r.collectors.map(c => c.site))].join(', ') || 'No exact catalog entry'} | ${r.officialWebsite ? `[Website](${r.officialWebsite})` : 'Unknown'} |`), '',
    'See guide-source-probes.json for failed endpoint checks and guide-supplement-audit.json for individual collection failures. No-catalog-match does not mean a station publishes no schedule; those entries require broadcaster-specific research.', '',
  ].join('\n'));
  console.log(JSON.stringify({ counts, candidateSites: report.candidateSites }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
