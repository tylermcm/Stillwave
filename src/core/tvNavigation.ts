export type TvDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
/** Android APKs share the TV interface on phones, tablets and televisions. */
export function usesTvLayout(platform: string, hardwareTv: boolean, tvPreview = false) {
  return platform === 'android' || hardwareTv || (platform === 'web' && tvPreview);
}
/** Web uses the release layout (touch Guide and My DVR); ?tv=0 returns to the Sources screen. */
export function webTvLayoutRequested(search: string) {
  return new URLSearchParams(search).get('tv') !== '0';
}
/** Player controls follow the input device, independently of the guide layout. */
export function usesRemotePlayer(hardwareTv: boolean, remotePreview = false) {
  return hardwareTv || remotePreview;
}
export type TvKey = `digit${TvDigit}` | 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'menu' | 'playPause' | 'rewind' | 'fastForward' | 'channelUp' | 'channelDown' | 'record' | 'series' | 'delete' | 'dvr' | 'guide';
export type TvZone = 'tabs' | 'categories' | 'channels' | 'details' | 'settings' | 'recordings';
export interface TvFocus { zone: TvZone; index: number }
export interface TvNavigation {
  counts: Record<TvZone, number>;
  tab: number;
  category: number;
  channel: number;
  body: 'channels' | 'settings' | 'recordings';
}

/** Remote movement follows columns and rows, independent of Android's spatial guesses. */
export function moveTvFocus(focus: TvFocus, key: TvKey, nav: TvNavigation): TvFocus {
  const at = (zone: TvZone, index: number): TvFocus => ({ zone, index: Math.max(0, Math.min(index, Math.max(0, nav.counts[zone] - 1))) });
  if (focus.zone === 'tabs') {
    if (key === 'left' || key === 'right') return at('tabs', focus.index + (key === 'left' ? -1 : 1));
    if (key === 'down') {
      const zone = nav.body === 'channels' && !nav.counts.channels ? 'categories' : nav.body;
      return at(zone, zone === 'categories' ? nav.category : zone === 'channels' || zone === 'recordings' ? nav.channel : 0);
    }
    return focus;
  }
  if (key === 'up') return focus.index === 0 ? at('tabs', nav.tab) : at(focus.zone, focus.index - 1);
  if (key === 'down') return at(focus.zone, focus.index + 1);
  if (focus.zone === 'categories' && key === 'right' && nav.counts.channels) return at('channels', nav.channel);
  if (focus.zone === 'channels') {
    if (key === 'left') return at('categories', nav.category);
    if (key === 'right' && nav.counts.details) return at('details', 0);
  }
  if (focus.zone === 'recordings' && key === 'right' && nav.counts.details) return at('details', 0);
  if (focus.zone === 'details' && key === 'left') return at(nav.body, nav.channel);
  return focus;
}
