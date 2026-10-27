import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const directory = path.resolve('.build-tmp/epg-service/artifacts/epg');
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const compressed = await readFile(path.join(directory, 'stillwave-us.xml.gz'));
const xml = gunzipSync(compressed).toString('utf8');
const age = Date.now() - Date.parse(manifest.generatedAt);
if (!Number.isFinite(age) || age < -300_000 || age > 3600_000) throw new Error('Refusing to publish an old or invalid guide timestamp.');
if (manifest.coverage.available < 500 || manifest.assignments.length !== manifest.coverage.available) throw new Error('Refusing to publish a guide with unexpectedly low coverage.');
if ((xml.match(/<channel /g) ?? []).length !== manifest.coverage.available) throw new Error('Guide station count does not match the manifest.');
const publicStatus = { generatedAt: manifest.generatedAt, coverage: manifest.coverage, refreshHours: 6, compressedBytes: compressed.length };
await writeFile(path.join(directory, 'status.json'), JSON.stringify(publicStatus, null, 2) + '\n');
await writeFile(path.join(directory, '.nojekyll'), '');
await writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>StillWave program guide</title><style>body{font:18px system-ui;max-width:720px;margin:10vh auto;padding:24px;background:#0b0f10;color:#e7f4ef}a{color:#a7eccb}p{line-height:1.6}</style><h1>StillWave program guide</h1><p>${manifest.coverage.available} of ${manifest.coverage.total} channel entries have listings. Generated ${manifest.generatedAt}. Refreshes are scheduled every six hours.</p><p><a href="stillwave-us.xml.gz">Compressed XMLTV guide</a> · <a href="stillwave-us.xml">XMLTV guide</a> · <a href="status.json">Refresh status</a></p><p>Channels without verified schedules remain playable in StillWave. Source availability and coverage can change.</p></html>`);
console.log(JSON.stringify(publicStatus));
