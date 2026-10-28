import type { GuideSize } from '../types';
import { guideMetrics } from './preferences';
export type MobileInsets = { top: number; right: number; bottom: number; left: number };

/** Reflow the touch canvas to the available area, using one scale for both axes. */
export function mobileDashboardLayout(width: number, height: number, size: GuideSize = 'comfortable') {
  // Stay close to the former landscape scale, with a modest 10% increase.
  // Width and height reflow independently; the content uses one uniform scale.
  const scale = Math.max(0.25, Math.min(0.85, width / 1920 * 1.1, (height - 56) / 1000 * 1.1)) * guideMetrics(size).zoom;
  return { scale, width: width / scale, height: height / scale, rowHeight: Math.max(84, 44 / scale) };
}

/** Only intentional horizontal drags on the inset side handle change its state. */
export function navigationSwipe(dx: number, dy: number): 'open' | 'close' | undefined {
  if (Math.abs(dx) < 24 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  return dx > 0 ? 'open' : 'close';
}
