import type { Channel, Guide } from '../types';
import type { GuideView } from './guides';

/** One exact stream identity per station prevents alternate feeds sharing a TVG ID. */
export function compileGuideBundle(channels: Channel[], view: GuideView, now = Date.now()) {
  const guide: Guide = { channels: Object.create(null), programmes: Object.create(null), importedAt: now };
  const assignments: { channelId: string; guideId: string; sourceGuideId: string }[] = [];
  for (const channel of channels) {
    const sourceGuideId = view.matcher(channel);
    const programmes = sourceGuideId ? view.guide?.programmes[sourceGuideId] ?? [] : [];
    if (!sourceGuideId || !programmes.some(p => p.stop > now)) continue;
    const guideId = `stillwave:${channel.sourceId ?? channel.id}`;
    guide.channels[guideId] = [channel.name];
    guide.programmes[guideId] = programmes.filter(p => p.stop > now - 86_400_000 && p.start < now + 7 * 86_400_000)
      .map(p => ({ ...p, channelId: guideId }));
    assignments.push({ channelId: channel.id, guideId, sourceGuideId });
  }
  return { guide, assignments };
}
