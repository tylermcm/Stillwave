import type { Channel, Guide } from '../types';
import { canonicalGuideId, guideIds } from './xmltv';

/** Global feeds must never match another country's station by its display name. */
export function exactProviderSupplement(raw: Guide, channels: Channel[], provider: 'pluto' | 'plex', now: number,
  onMatch?: (channel: Channel, sourceGuideId: string) => void): Guide {
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  const indexed = new Map<string, string[]>();
  for (const id of Object.keys(raw.programmes)) {
    if (!raw.programmes[id]?.some(p => p.stop > now)) continue;
    const key = canonicalGuideId(id), entries = indexed.get(key) ?? []; entries.push(id); indexed.set(key, entries);
  }
  for (const channel of channels) {
    const ids = guideIds(channel).filter(id => provider === 'pluto' ? /^[a-f\d]{24}$/i.test(id) : /^plex:[a-f\d]{24}$/i.test(canonicalGuideId(id)));
    let source: string | undefined;
    for (const id of ids) {
      const matches = indexed.get(canonicalGuideId(id));
      if (raw.programmes[id]?.some(p => p.stop > now)) { source = id; break; }
      // Several containers can carry the same Plex station. Require matching
      // schedules before treating that stable station identity as unambiguous.
      if (matches?.length === 1) { source = matches[0]; break; }
      if (matches && matches.length > 1) {
        const signature = (key: string) => JSON.stringify(raw.programmes[key]?.map(p => [p.start, p.stop, p.title]));
        if (matches.every(key => signature(key) === signature(matches[0]!))) { source = matches[0]; break; }
      }
    }
    const programmes = source ? raw.programmes[source] : undefined;
    if (!programmes?.some(p => p.stop > now)) continue;
    const id = `stillwave:${channel.sourceId ?? channel.id}`;
    guide.channels[id] = [channel.name]; guide.programmes[id] = programmes.map(p => ({ ...p, channelId: id }));
    onMatch?.(channel, source!);
  }
  return guide;
}
