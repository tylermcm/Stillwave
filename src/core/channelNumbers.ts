import type { Channel, Library } from '../types';
import { comparePreferredChannels } from './channelBrowsing';

const validNumber = (value?: string) => !!value && /^[1-9]\d{0,4}$/.test(value);

/** Stored separately from provider rows; includes removed stations to avoid recycling numbers. */
export function withChannelNumbers(library: Library): Library {
  // Discard the earlier, unshipped example-based assignments once on migration.
  const registry = library.channelNumberingVersion === 1 ? { ...library.channelNumbers } : {};
  const used = new Set(Object.values(registry));
  let next = 1;
  const keyFor = (channel: Channel) => {
    const source = library.playlists.find(p => p.id === channel.playlistId);
    return JSON.stringify([source?.url || source?.id || 'legacy', channel.tvgId || channel.sourceId || channel.id]);
  };
  for (const channel of [...library.channels].sort((a, b) => comparePreferredChannels(a, b) || keyFor(a).localeCompare(keyFor(b)))) {
    const key = keyFor(channel);
    let number = registry[key];
    if (!validNumber(number)) {
      while (used.has(String(next))) next++;
      if (next > 99999) throw new Error('The channel number range is full.');
      number = String(next++);
      registry[key] = number;
      used.add(number);
    }
  }
  const channels = library.channels.map(channel => {
    const number = registry[keyFor(channel)]!;
    return channel.number === number ? channel : { ...channel, number };
  });
  return { ...library, channelNumberingVersion: 1, channelNumbers: registry, channels };
}

export function findNumberedChannel(channels: Channel[], input: string): Channel | undefined {
  if (!/^\d{1,5}$/.test(input)) return undefined;
  const normalized = String(Number(input));
  return channels.find(c => c.number === normalized);
}
export function enterChannelDigit(current: string, digit: string) {
  return /^\d$/.test(digit) ? (current.length >= 5 ? digit : current + digit) : current;
}
