import { writeFile } from 'node:fs/promises';

// Build-time language hints only. Playback and setup never depend on this API.
const playlistUrl = 'https://iptv-org.github.io/iptv/countries/us.m3u';
const metadataUrl = 'https://iptv-org.github.io/api/feeds.json';
const [playlist, channels] = await Promise.all([
  fetch(playlistUrl).then(r => { if (!r.ok) throw Error(`Playlist HTTP ${r.status}`); return r.text(); }),
  fetch(metadataUrl).then(r => { if (!r.ok) throw Error(`Metadata HTTP ${r.status}`); return r.json(); }),
]);
const ids = new Set([...playlist.matchAll(/tvg-id="([^"]+)"/g)].map(m => m[1]));
const languages = Object.fromEntries(channels.map(c => ({ id: `${c.channel}@${c.id}`, languages: c.languages })).filter(c => ids.has(c.id) && c.languages?.length).sort((a, b) => a.id.localeCompare(b.id)).map(c => [c.id, c.languages]));
if (!Object.keys(languages).length) throw Error('No matching language metadata; keeping the previous snapshot.');
await writeFile(new URL('../src/data/usChannelLanguages.json', import.meta.url), JSON.stringify({ source: metadataUrl, playlist: playlistUrl, fetchedAt: new Date().toISOString(), languages }, null, 2) + '\n');
console.log(`Updated language hints for ${Object.keys(languages).length} US channels.`);
