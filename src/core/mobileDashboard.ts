/** Reflow the touch canvas to the available area, using one scale for both axes. */
export function mobileDashboardLayout(width: number, height: number) {
  // Stay close to the former landscape scale, with a modest 10% increase.
  // Width and height reflow independently; the content uses one uniform scale.
  const scale = Math.max(0.25, Math.min(0.85, width / 1920 * 1.1, (height - 56) / 1000 * 1.1));
  return { scale, width: width / scale, height: height / scale, rowHeight: Math.max(84, 44 / scale) };
}

/** Only intentional vertical drags on the navigation handle change its state. */
export function navigationSwipe(dx: number, dy: number): 'open' | 'close' | undefined {
  if (Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
  return dy > 0 ? 'open' : 'close';
}
