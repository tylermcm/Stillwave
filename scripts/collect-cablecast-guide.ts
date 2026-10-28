import { writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { parseCablecastPage, scheduleStreamKey } from '../src/core/cablecastGuide';
import type { Channel, Guide, GuideSource } from '../src/types';
import { downloadGuideFile } from './guide-download';

export async function collectCablecastGuide(channels: Channel[], now: number, reuse: boolean): Promise<GuideSource> {
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  const hosts = new Map<string, Channel[]>();
  for (const channel of channels) {
    const url = new URL(channel.url);
    if (!url.hostname.endsWith('.cablecast.tv') || url.port) continue;
    const list = hosts.get(url.hostname) ?? []; list.push(channel); hosts.set(url.hostname, list);
  }
  const failures: { url: string; error: string }[] = [];
  const assignments: { channelId: string; tvgId?: string; url: string; siteId: number; listings: number }[] = [];
  const entries = [...hosts];
  // Three independent station hosts at a time; each host is visited serially.
  for (let offset = 0; offset < entries.length; offset += 3) await Promise.all(entries.slice(offset, offset + 3).map(async ([host, requested]) => {
    const pending = [...requested], visited = new Set<number>(), queue = [0];
    while (queue.length && pending.length && visited.size < 16) {
      const siteId = queue.shift()!;
      if (visited.has(siteId)) continue;
      visited.add(siteId);
      const url = `https://${host}/internetchannel/schedule${siteId ? `?site=${siteId}` : ''}`;
      try {
        await setTimeout(250);
        const html = await downloadGuideFile(url, `.build-tmp/cablecast/${host}-${siteId}.html`, 6 * 1024 * 1024, reuse);
        const schedule = parseCablecastPage(html.toString('utf8'), now);
        visited.add(schedule.siteId);
        for (const id of schedule.otherSiteIds) if (!visited.has(id) && !queue.includes(id)) queue.push(id);
        if (!schedule.programmes.some(p => p.stop > now)) continue;
        const key = scheduleStreamKey(schedule.streamUrl);
        // A legacy watch URL can redirect to the default public channel. Only
        // the exact published live stream can identify this site's schedule.
        for (const channel of [...pending]) if (key && scheduleStreamKey(channel.url) === key) {
          const id = `stillwave:${channel.sourceId ?? channel.id}`;
          guide.channels[id] = [channel.name];
          guide.programmes[id] = schedule.programmes.map(p => ({ ...p, channelId: id }));
          assignments.push({ channelId: channel.id, tvgId: channel.tvgId, url, siteId: schedule.siteId, listings: schedule.programmes.length });
          pending.splice(pending.indexOf(channel), 1);
        }
      } catch (error) { failures.push({ url, error: error instanceof Error ? error.message : 'Failed' }); }
    }
    console.log(`Cablecast ${host}: ${requested.length - pending.length}/${requested.length} exact streams with listings`);
  }));
  assignments.sort((a, b) => a.channelId.localeCompare(b.channelId));
  failures.sort((a, b) => a.url.localeCompare(b.url));
  await writeFile('artifacts/guide-cablecast-audit.json', JSON.stringify({ collectedAt: new Date(now).toISOString(), requestedHosts: hosts.size,
    requestedStreams: [...hosts.values()].flat().length, availableStreams: assignments.length, assignments, failures }, null, 2) + '\n');
  return { id: 'guide-tv-cablecast', name: 'Official Cablecast community station schedules', url: 'https://www.cablecast.tv/', playlistIds: [], refreshHours: 6, guide };
}
