import { readFile, writeFile } from 'node:fs/promises';
import { parseStationCatalog } from './guide-catalog';
import { canonicalGuideId } from '../src/core/xmltv';
import { parseM3u } from '../src/core/m3u';
import { DEFAULT_TV_PLAYLIST } from '../src/core/tvDefaults';

async function main() {
  const local = process.argv.includes('--local-catalogs');
  const files = ['pluto', 'plex', 'samsung', 'roku', 'pbs'].map(name => `i.mjh.nz/i.mjh.nz_${name}.channels.xml`).concat('tvpassport.com/tvpassport.com.channels.xml');
  const response = await fetch(DEFAULT_TV_PLAYLIST, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Playlist HTTP ${response.status}`);
  const ids = new Set(parseM3u(await response.text()).channels.map(c => canonicalGuideId(c.tvgId || '')));
  const aliases = new Map<string, Map<string, Set<string>>>(), passports = new Map<string, Set<string>>();
  for (const file of files) {
    const url = `https://raw.githubusercontent.com/iptv-org/epg/master/sites/${file}`;
    const xml = local ? await readFile(`.build-tmp/epg-collectors/sites/${file}`, 'utf8') : await (async () => {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`Catalog HTTP ${r.status}`); return r.text();
    })();
    for (const station of parseStationCatalog(xml)) {
      const key = canonicalGuideId(station.xmltv_id);
      if (!ids.has(key)) continue;
      if (station.site === 'tvpassport.com' && station.lang === 'en') {
        const set = passports.get(key) ?? new Set(); set.add(station.site_id); passports.set(key, set); continue;
      }
      const [provider, id] = station.site_id.split('#');
      if (!provider || !id || !['PlutoTV/us', 'Plex/us', 'SamsungTVPlus/us', 'Roku/all', 'PBS/all'].includes(provider)) continue;
      const providers = aliases.get(key) ?? new Map<string, Set<string>>();
      const set = providers.get(provider) ?? new Set(); set.add(id); providers.set(provider, set); aliases.set(key, providers);
    }
  }
  const stations = Object.fromEntries([...aliases].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, providers]) => {
    const ids = [...providers].sort(([a], [b]) => a.localeCompare(b)).filter(([, ids]) => ids.size === 1).map(([, ids]) => [...ids][0]!);
    return ids.length ? [[key, ids]] : [];
  }));
  const tvPassport = Object.fromEntries([...passports].sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => [key, [...ids].sort((a, b) => Number(!a.includes('hd')) - Number(!b.includes('hd')) || a.localeCompare(b))[0]]));
  await writeFile('src/data/guideStationAliases.json', JSON.stringify({ sources: ['https://github.com/iptv-org/epg/tree/master/sites/i.mjh.nz', 'https://github.com/iptv-org/epg/tree/master/sites/tvpassport.com'], updatedAt: new Date().toISOString().slice(0, 10), stations, tvPassport }, null, 2) + '\n');
  console.log(`${Object.keys(stations).length} exact provider identities; ${Object.keys(tvPassport).length} TV Passport station identities. No region/language variants were collapsed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
