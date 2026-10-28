import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, ScrollView, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { TV_DESIGN as D, guideProgrammeFrame, guideProgrammeKey, tvDuration, tvTime, type TvDashboardState, type TvDvrItem, type TvDvrTab, type TvGuideRow } from '../../core/tvGuide';

import { usesTvPlayer } from '../../data/tv';
import { TouchTvList } from './TouchTvList';
import { MobileNavigation } from './MobileNavigation';
import type { HubDestination } from '../../core/mobileHub';
import { mobileDashboardLayout, type MobileInsets } from '../../core/mobileDashboard';
import { MobileGuideActions, type MobileGuideAction } from './MobileGuideActions';
import { isChannelHidden } from '../../core/channelBrowsing';
import { dvrItemActions, seriesTitle, type DvrAction } from '../../core/tvDvr';
import { guideMetrics } from '../../core/preferences';
import type { GuideSize } from '../../types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const DVR_COLORS = { bg: '#0b0f10', panel: '#11171a', cell: '#151d20', now: '#1a2528', line: '#1f2b2e', text: '#e1e8e8', muted: '#7f8f90', dim: '#55646a', accent: '#8fd6c0', ink: '#08201a', rec: '#e5484d', description: '#a9b6b6' };
type Props = { state: TvDashboardState; onScreen: (screen: 'guide' | 'dvr') => void; onProgramme: (channel: number, programme: number) => void;
  onMenu?: () => void;
  /** Phone navigation to the hub screens (Home, Discover) that live outside this guide canvas. */
  onDestination?: (destination: HubDestination) => void;
  guideSize?: GuideSize; onChooseDay?: () => void;
  onGuideAction: (action: 'watch' | 'record' | 'series', channel?: number, programme?: number) => void; onTab: (tab: TvDvrTab) => void; onItem: (index: number) => void;
  onDvrAction: (action: DvrAction) => void;
  onWatchChannel?: (channel: number) => void; onChannelAction?: (action: 'favorite' | 'hide', channel: number) => void; onJumpToLive?: () => void;
  favorites?: readonly string[]; hiddenChannels?: string[]; seriesRules?: { channelId: string; title: string }[]; contentInsets?: MobileInsets;
};
function Label({ children, style, lines }: { children: ReactNode; style?: object | object[]; lines?: number }) {
  return <Text numberOfLines={lines} style={[s.text, style]}>{children}</Text>;
}
function Mark({ recording = false, ink = false }: { recording?: boolean; ink?: boolean }) {
  return <View style={recording ? s.dot : [s.ring, ink && { borderColor: DVR_COLORS.ink }]} />;
}
function Action({ children, primary, focused, onPress, scale = 1 }: { children: string; primary?: boolean; focused?: boolean; onPress: () => void; scale?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={children} onPress={onPress} style={[s.button, !usesTvPlayer && { minHeight: 44 / scale, justifyContent: 'center' }, primary && s.primary, focused && s.actionFocus]}><Label style={[s.buttonText, primary ? s.primaryText : {}]}>{children}</Label></Pressable>;
}
function Preview({ channel, recording, style }: { channel: string; recording?: boolean; style?: object }) {
  return <View style={[s.preview, style]}><Label style={s.previewName}>{channel}</Label>{recording && <View style={s.previewRec}><Mark recording /><Label style={s.previewRecText}>REC</Label></View>}</View>;
}

function ProgrammeContent({ left, width, viewportWidth, offset, children }: {
  left: number; width: number; viewportWidth: number; offset?: Animated.Value; children: ReactNode;
}) {
  const translateX = useMemo(() => offset ? offset.interpolate({
    inputRange: [left, left + width], outputRange: [0, width], extrapolate: 'clamp',
  }) : 0, [offset, left, width]);
  // Fixed layout lets native scrolling move text without a Yoga layout pass.
  return <Animated.View style={[s.programmeContent, { width: offset ? Math.min(width, viewportWidth) : width, transform: [{ translateX }] }]}>{children}</Animated.View>;
}

/** Direct translation of mockups/tv-dvr.html, using real data supplied by the controller. */
export function TvDashboard({ state: v, ...events }: Props) {
  const viewport = useWindowDimensions();
  const [available, setAvailable] = useState<{ width: number; height: number }>();
  const touch = !usesTvPlayer;
  const area = available ?? viewport;
  const mobile = mobileDashboardLayout(area.width, area.height, v.screen === 'guide' ? events.guideSize : 'comfortable');
  const metrics = guideMetrics(events.guideSize);
  const rowHeight = touch ? mobile.rowHeight : metrics.rowHeight;
  const guideText = !touch ? { fontSize: 24 * metrics.fontScale, lineHeight: 32 * metrics.fontScale } : {};
  const insets = events.contentInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const [context, setContext] = useState<{ kind: 'channel' | 'programme'; channelId: string; start?: number; title?: string }>();
  // The navigation stays at finger size instead of shrinking with the TV canvas.
  const headerHeight = viewport.width < 1100 ? 56 : 80;
  const bodyHeight = touch ? mobile.height : D.height - 80;
  const scale = touch ? mobile.scale : Math.min(viewport.width / D.width, Math.max(1, viewport.height - headerHeight) / bodyHeight);
  const canvasWidth = touch ? mobile.width : D.width;
  const channelWidth = D.channelWidth + (touch ? insets.left / scale : 0);
  const laneWidth = canvasWidth - channelWidth;
  const timeScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const timeOffset = useRef(new Animated.Value(0)).current;
  const reverseTimeOffset = useMemo(() => Animated.multiply(timeOffset, -1), [timeOffset]);
  const onTimeScroll = useMemo(() => touch ? Animated.event(
    [{ nativeEvent: { contentOffset: { x: timeOffset } } }],
    { useNativeDriver: Platform.OS !== 'web' },
  ) : undefined, [timeOffset, touch]);
  useEffect(() => {
    timeScroll.current?.scrollTo({ x: 0, animated: false });
    timeOffset.setValue(0);
  }, [v.screen, v.cursor.windowStart, timeOffset]);
  const gridWidth = touch ? Math.max(canvasWidth, channelWidth + 24 * 60 * D.pixelsPerMinute) : D.width;
  const pinned = touch ? { zIndex: 2, backgroundColor: DVR_COLORS.bg, transform: [{ translateX: timeOffset }] } : undefined;
  const row = v.rows[v.cursor.channel];
  const programme = row?.programmes[v.cursor.programme];
  const key = row && programme ? guideProgrammeKey(row.channel.id, programme) : '';
  const mark = v.marks[key];
  const live = !!programme && programme.start <= v.now && programme.stop > v.now;
  const past = !!programme && programme.stop <= v.now;
  const recordLabel = mark === 'recording' ? 'Stop recording' : mark === 'series' ? 'Cancel series' : mark ? 'Cancel recording' : 'Record';
  const selectedItem = v.items[Math.min(v.itemIndex, Math.max(0, v.items.length - 1))];
  const visibleSpan = (gridWidth - channelWidth) / D.pixelsPerMinute * 60_000;
  const tickStart = Math.floor(v.cursor.windowStart / 1_800_000) * 1_800_000;
  const ticks = Array.from({ length: touch ? 49 : 8 }, (_, i) => tickStart + i * 1_800_000);
  const rulerOrigin = v.rulerOrigin ?? Math.floor(v.now / 3_600_000) * 3_600_000 - 2 * 3_600_000;
  const firstRow = Math.max(0, v.cursor.rowTop - 1), lastRow = Math.min(v.rows.length, v.cursor.rowTop + Math.ceil(D.gridHeight / rowHeight) + 1);
  const nowX = channelWidth + (v.now - v.cursor.windowStart) / 60_000 * D.pixelsPerMinute;
  const guideActions = [...(live ? ['watch'] : []), ...(!past && programme ? ['record'] : [])];
  const contextIndex = context ? v.rows.findIndex(r => r.channel.id === context.channelId) : -1;
  const contextRow = v.rows[contextIndex];
  const contextProgrammeIndex = context?.kind === 'programme' ? contextRow?.programmes.findIndex(p => p.start === context.start && p.title === context.title) ?? -1 : -1;
  const contextProgramme = contextRow?.programmes[contextProgrammeIndex];
  useEffect(() => { if (context && (!contextRow || context.kind === 'programme' && !contextProgramme)) setContext(undefined); }, [context, contextRow, contextProgramme]);
  const watchChannel = (index: number) => events.onWatchChannel ? events.onWatchChannel(index) : events.onGuideAction('watch', index);
  const jumpToLive = () => { timeScroll.current?.scrollTo({ x: 0, animated: false }); timeOffset.setValue(0); events.onJumpToLive?.(); };
  const contextMark = contextRow && contextProgramme ? v.marks[guideProgrammeKey(contextRow.channel.id, contextProgramme)] : undefined;
  const hasSeries = contextRow && contextProgramme && events.seriesRules?.some(rule => rule.channelId === contextRow.channel.id && seriesTitle(rule.title) === seriesTitle(contextProgramme.title));
  const contextActions: MobileGuideAction[] = contextRow ? [
    { id: 'watch', label: 'Watch channel live', run: () => watchChannel(contextIndex) },
    ...(context?.kind === 'programme' && contextProgramme && contextProgramme.stop > v.now ? [
      { id: 'record', label: contextMark === 'recording' ? 'Stop recording' : contextMark ? 'Cancel recording' : 'Record', run: () => events.onGuideAction('record', contextIndex, contextProgrammeIndex) },
      { id: 'series', label: hasSeries ? 'Remove series rule' : 'Record series', run: () => events.onGuideAction('series', contextIndex, contextProgrammeIndex) },
    ] : []),
    ...(context?.kind === 'channel' ? [
      { id: 'favorite', label: events.favorites?.includes(contextRow.channel.id) ? 'Remove favorite' : 'Add favorite', run: () => events.onChannelAction?.('favorite', contextIndex), disabled: !events.onChannelAction },
      { id: 'hide', label: isChannelHidden(contextRow.channel, events.hiddenChannels) ? 'Unhide channel' : 'Hide channel', run: () => events.onChannelAction?.('hide', contextIndex), disabled: !events.onChannelAction },
    ] : []),
  ] : [];
  const renderGuideRow = (r: TvGuideRow, ci: number, markTouchSelection?: () => void) => {
    return <View key={r.channel.id} style={[s.row, touch ? { position: 'relative', top: 0, width: gridWidth, height: mobile.rowHeight } : { top: (ci - v.cursor.rowTop) * rowHeight, height: rowHeight }]}>
                {touch ? <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Watch ${r.channel.name} live`} accessibilityHint="Hold for channel actions" accessibilityActions={[{ name: 'longpress', label: 'Channel actions' }]} onAccessibilityAction={e => { if (e.nativeEvent.actionName === 'longpress') setContext({ kind: 'channel', channelId: r.channel.id }); }} delayLongPress={450} onPress={() => { markTouchSelection?.(); watchChannel(ci); }} onLongPress={() => setContext({ kind: 'channel', channelId: r.channel.id })} style={[s.channel, pinned, { width: channelWidth, paddingLeft: 64 + insets.left / scale }]}><Label lines={1} style={[s.channelNumber, guideText, { width: Math.max(40, r.number.length * 15) }]}>{r.number}</Label><Label lines={1} style={[s.channelName, guideText, ci === v.cursor.channel ? { color: DVR_COLORS.text } : {}]}>{r.channel.name}</Label></AnimatedPressable> : <Animated.View style={s.channel}><Label lines={1} style={[s.channelNumber, guideText, { width: Math.max(40, r.number.length * 15) }]}>{r.number}</Label><Label lines={1} style={[s.channelName, guideText, ci === v.cursor.channel ? { color: DVR_COLORS.text } : {}]}>{r.channel.name}</Label></Animated.View>}
                <View style={s.lane}>
                  {r.programmes.map((p, pi) => {
                    const frame = guideProgrammeFrame(p, v.cursor.windowStart, gridWidth - channelWidth);
                    if (!frame) return null;
                    const focused = v.focus.zone === 'grid' && ci === v.cursor.channel && pi === v.cursor.programme;
                    const status = v.marks[guideProgrammeKey(r.channel.id, p)];
                    const hold = touch ? () => setContext({ kind: 'programme', channelId: r.channel.id, start: p.start, title: p.title }) : undefined;
                    return <Pressable key={`${p.start}:${pi}`} accessibilityRole="button" accessibilityLabel={`${p.title} on ${r.channel.name}`} accessibilityHint={touch ? 'Hold for programme actions' : undefined} accessibilityActions={touch ? [{ name: 'longpress', label: 'Programme actions' }] : undefined} onAccessibilityAction={touch ? e => { if (e.nativeEvent.actionName === 'longpress') hold?.(); } : undefined} delayLongPress={450} onLongPress={hold} onPress={() => { markTouchSelection?.(); events.onProgramme(ci, pi); }} style={[s.programme, p.start <= v.now && p.stop > v.now && s.programmeNow, focused && s.programmeFocus,
                      { ...frame, paddingHorizontal: 0 }]}>
                      <ProgrammeContent left={frame.left} width={frame.width} viewportWidth={laneWidth} offset={touch ? timeOffset : undefined}>
                        {!!status && <Mark recording={status === 'recording'} ink={focused} />}<Label lines={1} style={[s.programmeText, guideText, p.stop <= v.now ? { color: DVR_COLORS.dim } : {}, focused ? { color: DVR_COLORS.ink } : {}]}>{p.title}</Label>
                      </ProgrammeContent>
                    </Pressable>;
                  })}
                  {!r.programmes.some(p => p.stop > v.cursor.windowStart && p.start < v.cursor.windowStart + visibleSpan) && <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Watch ${r.channel.name} live; schedule unavailable`} onLongPress={touch ? () => setContext({ kind: 'channel', channelId: r.channel.id }) : undefined} delayLongPress={450} onPress={() => { markTouchSelection?.(); if (touch) watchChannel(ci); else events.onProgramme(ci, v.cursor.programme); }} style={[s.programme, { left: 2, right: 2 }, touch && { right: undefined, width: laneWidth - 4, transform: [{ translateX: timeOffset }] }, ci === v.cursor.channel && v.focus.zone === 'grid' && s.programmeFocus]}><Label lines={1} style={[s.programmeText, ci === v.cursor.channel && v.focus.zone === 'grid' ? { color: DVR_COLORS.ink } : { color: DVR_COLORS.muted }]}>{touch ? 'Schedule unavailable · Tap to watch' : 'Schedule unavailable · OK Watch live'}</Label></AnimatedPressable>}
                </View>
              </View>;
  };
  const renderDvrRow = (item: TvDvrItem, index: number, markTouchSelection?: () => void) => {
    const rowTop = Math.max(0, v.itemIndex - (v.conflict ? 7 : 8));
    const focused = v.focus.zone === 'dvrList' && index === v.itemIndex;
    return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => { markTouchSelection?.(); events.onItem(index); }} style={[s.item, touch ? { position: 'relative', top: 0, height: Math.max(88, mobile.rowHeight), gap: 12, paddingRight: 8 } : { top: (index - rowTop) * 88 }, focused && s.itemFocus]}>
              <View style={s.itemMark}>{item.kind === 'recording' ? <Mark recording /> : item.kind !== 'saved' || item.unwatched ? <Mark /> : null}</View>
              <View style={[s.itemTitleBlock, touch && { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center' }]}><Label lines={1} style={[s.itemTitle, item.watched ? { color: DVR_COLORS.dim } : {}]}>{item.title}</Label><Label lines={1} style={s.itemSubtitle}>{item.channel}{item.subtitle ? ` · ${item.subtitle}` : ''}</Label></View>
              {!!item.progress && item.progress < 1 && <View style={s.progress}><View style={[s.progressFill, { width: `${item.progress * 100}%` }]} /></View>}
              <Label style={s.itemRight}>{item.right}</Label>
            </Pressable>;
  };
  return <View style={[s.viewport, touch && { backgroundColor: DVR_COLORS.bg }]} onLayout={event => { const { width, height } = event.nativeEvent.layout; setAvailable(previous => previous?.width === width && previous?.height === height ? previous : { width, height }); }}>
      {!touch && <View style={[s.top, { height: headerHeight, paddingHorizontal: viewport.width < 1100 ? 16 : 64, gap: viewport.width < 1100 ? 16 : 40 }]}><Label style={[s.brand, viewport.width < 1100 && { fontSize: 20 }]}>stillwave</Label><View style={s.nav}>
        {(['guide', 'dvr'] as const).map((screen, i) => <Pressable key={screen} accessibilityRole="tab" accessibilityState={{ selected: v.screen === screen }} accessibilityLabel={screen === 'guide' ? 'Guide' : 'My DVR'} onPress={() => events.onScreen(screen)} style={[s.navButton, v.screen === screen && s.navOn, v.focus.zone === 'nav' && v.focus.index === i && s.actionFocus]}><Label style={[s.navText, v.screen === screen ? { color: DVR_COLORS.text } : {}]}>{screen === 'guide' ? 'Guide' : 'My DVR'}</Label></Pressable>)}
        {events.onMenu && <Pressable accessibilityRole="button" accessibilityLabel="Open TV menu" onPress={events.onMenu} style={[s.navButton, v.focus.zone === 'nav' && v.focus.index === 2 && s.actionFocus]}><Label style={s.navText}>Menu</Label></Pressable>}
      </View>{viewport.width >= 720 && <Label style={[s.clock, viewport.width < 1100 && { fontSize: 14 }]}>{v.clock}</Label>}</View>}
    <View testID="tv-dashboard" style={[s.stage, { width: canvasWidth, height: bodyHeight, left: touch ? 0 : (viewport.width - D.width * scale) / 2, top: touch ? 0 : headerHeight + (viewport.height - headerHeight - bodyHeight * scale) / 2, transform: [{ scale }] }]}>
      {v.screen === 'guide' ? <View style={[s.screen, touch && { paddingBottom: insets.bottom / scale }]}>
        <View testID={touch ? 'mobile-guide-summary' : undefined} style={[s.details, touch && { height: 164 + insets.top / scale, paddingTop: 12 + insets.top / scale, paddingLeft: (80 + insets.left) / scale, paddingRight: 24 + insets.right / scale, gap: 24, paddingBottom: 8 }]}>{!touch && <Preview channel={row ? `${row.number} ${row.channel.name}` : ''} recording={mark === 'recording'} />}
          <View style={s.info}>
            <Label style={s.when}>{programme ? `${tvTime(programme.start)} – ${tvTime(programme.stop)} · ${tvDuration((programme.stop - programme.start) / 1000)}${live ? ` · ${Math.ceil((programme.stop - v.now) / 60_000)} min left` : ''}` : 'LIVE TV'}</Label>
            <Label style={[s.guideTitle, touch && { marginTop: 0, marginBottom: 0, flexShrink: 0 }]} lines={1}>{programme?.title || row?.channel.name || 'Your TV guide'}</Label>
            <Label style={s.guideDescription} lines={touch ? 1 : 2}>{programme ? [programme.episode, programme.description].filter(Boolean).join(' · ') : v.guideEmpty || 'Choose a channel to start watching.'}</Label>
            {!touch && <View style={s.actions}>{live && <Action scale={scale} primary focused={v.focus.zone === 'guideActions' && v.focus.index === 0} onPress={() => events.onGuideAction('watch')}>Watch</Action>}
              {!past && !!programme && <><Action scale={scale} primary={!live} focused={v.focus.zone === 'guideActions' && guideActions[v.focus.index] === 'record'} onPress={() => events.onGuideAction('record')}>{recordLabel}</Action>{touch ? <Action scale={scale} onPress={() => events.onGuideAction('series')}>Record series</Action> : <Pressable accessibilityRole="button" accessibilityLabel="Record series" style={v.focus.zone === 'guideActions' && v.focus.index === guideActions.length ? s.actionFocus : undefined} onPress={() => events.onGuideAction('series')}><Label style={s.hint}>S Record series</Label></Pressable>}</>}
              {!programme && row && <Action scale={scale} primary focused={v.focus.zone === 'guideActions' && v.focus.index === 0} onPress={() => events.onGuideAction('watch')}>Watch</Action>}
            </View>}
          </View>
          {touch && <Pressable accessibilityRole="button" accessibilityLabel="Jump to Live" onPress={jumpToLive} style={[s.button, { minHeight: 44 / scale, alignSelf: 'center', justifyContent: 'center' }]}><Label style={{ fontSize: Math.max(24, 14 / scale), color: DVR_COLORS.accent }}>Jump to Live</Label></Pressable>}
        </View>
        <View style={s.grid}>
          <Animated.ScrollView ref={timeScroll} testID="touch-guide-timeline" horizontal removeClippedSubviews={false} scrollEnabled={touch} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator={touch}
            style={{ flex: 1 }} contentContainerStyle={{ width: gridWidth, height: '100%' }}
            bounces={touch ? false : undefined} overScrollMode={touch ? 'never' : undefined}
            onScroll={onTimeScroll} scrollEventThrottle={16}>
          <View style={{ width: gridWidth, flex: 1 }}>
          <View style={s.ruler}><AnimatedPressable accessibilityRole="button" accessibilityLabel="Choose guide day" onPress={events.onChooseDay} style={[s.corner, pinned, touch && { width: channelWidth, paddingLeft: 64 + insets.left / scale }]}><Label style={s.cornerText}>{v.dayLabel} ▾</Label></AnimatedPressable><View style={s.clip}>
            {ticks.map(t => {
              // The HTML ruler shrinks late absolute-positioned ticks to their
              // minimum word width, even when translated back into the clip.
              const narrow = !touch && (t - rulerOrigin) / 60_000 * D.pixelsPerMinute >= D.width - D.channelWidth;
              const label = tvTime(t), timeWord = label.split(' ')[0]!;
              return <View key={t} style={[s.tick, { left: (t - v.cursor.windowStart) / 60_000 * D.pixelsPerMinute }, narrow && { width: 52.359375 + Math.max(0, timeWord.length - 4) * 12.234375 }]}><Label style={[s.tickText, { lineHeight: 30 }]}>{label}</Label></View>;
            })}
          </View></View>
          <View style={s.rowsWrap}>
            {touch ? <TouchTvList key={v.rows[0]?.channel.id || 'empty'} testID="touch-guide-list" scale={scale} data={v.rows} selected={v.cursor.channel} rowHeight={mobile.rowHeight} removeClippedSubviews={false} keyFor={r => r.channel.id} renderRow={renderGuideRow} /> : v.rows.slice(firstRow, lastRow).map((r, offset) => renderGuideRow(r, firstRow + offset))}
            {nowX >= channelWidth && nowX < gridWidth && (touch ?
              // Pin the clip to the programme viewport, while the marker follows timeline time.
              // A row's channel zIndex cannot cover an overlay outside the virtualized list.
              <Animated.View pointerEvents="none" testID="touch-guide-now-clip" style={{ position: 'absolute', top: 0, bottom: 0, left: channelWidth, width: laneWidth, overflow: 'hidden', transform: [{ translateX: timeOffset }] }}>
                <Animated.View testID="touch-guide-now-line" style={[s.nowLine, { left: nowX - channelWidth, transform: [{ translateX: reverseTimeOffset }] }]} />
              </Animated.View> : <View pointerEvents="none" style={[s.nowLine, { left: nowX }]} />)}
            {!v.rows.length && <Label style={s.empty}>{v.guideEmpty || 'Your channels will appear here after setup.'}</Label>}
          </View>
          </View></Animated.ScrollView>
          {!touch && <Footer screen="guide" />}
        </View>
      </View> : <View style={[s.dvr, touch && { paddingTop: 24 + insets.top / scale, paddingLeft: (insets.left + 72) / scale, paddingRight: insets.right / scale, paddingBottom: insets.bottom / scale }]}>
        <View style={[s.dvrMain, touch && { paddingHorizontal: 24 }]}>
          <View style={[s.dvrHead, { alignItems: 'center' }, touch && { flexWrap: 'wrap', gap: 8 }]}><Label style={s.dvrTitle}>My DVR</Label><View style={[s.tabs, { gap: Math.max(12, 8 / scale) }]}>{(['recordings', 'scheduled', 'series'] as const).map((tab, i) => <Pressable key={tab} accessibilityRole="tab" accessibilityLabel={tab} accessibilityState={{ selected: v.dvrTab === tab }} onPress={() => events.onTab(tab)} style={[s.tab, { minHeight: Math.max(44, 44 / scale), paddingHorizontal: 8 / scale, justifyContent: 'center' }, v.dvrTab === tab && s.navOn, v.focus.zone === 'dvrTabs' && v.focus.index === i && s.actionFocus]}><Label style={[s.tabText, { fontSize: Math.max(26, 16 / scale), lineHeight: Math.max(35, 22 / scale) }, v.dvrTab === tab ? { color: DVR_COLORS.text } : {}]}>{tab[0]!.toUpperCase() + tab.slice(1)}</Label></Pressable>)}</View></View>
          <Label style={s.summary}>{v.summary}</Label>
          {!!v.conflict && <View style={s.conflict}><Label style={s.conflictText}>{v.conflict}</Label></View>}
          <View style={s.list}>{v.items.length ? touch ? <TouchTvList key={v.dvrTab} testID="touch-dvr-list" scale={scale} data={v.items} selected={v.itemIndex} rowHeight={Math.max(88, mobile.rowHeight)} keyFor={item => item.id} renderRow={renderDvrRow} /> : v.items.slice(Math.max(0, v.itemIndex - 7), Math.max(8, v.itemIndex + 2)).map((item, offset) => renderDvrRow(item, Math.max(0, v.itemIndex - 7) + offset)) : <Label style={s.empty}>{v.dvrTab === 'recordings' ? 'No recordings yet.' : v.dvrTab === 'scheduled' ? 'Nothing scheduled.' : 'No series rules.'}</Label>}</View>
          {!touch && <Footer screen="dvr" />}
        </View>
        <DvrDetails item={selectedItem} state={v} onAction={events.onDvrAction} touch={touch} scale={scale} />
      </View>}
      {!!v.toast && <View style={s.toast}><Label style={s.toastText}>{v.toast}</Label></View>}
    </View>
    {touch && <MobileNavigation screen={v.screen} onScreen={destination => destination === 'guide' || destination === 'dvr' ? events.onScreen(destination) : events.onDestination?.(destination)} onMenu={events.onMenu} insets={insets} />}
    {touch && context && contextRow && <MobileGuideActions title={contextProgramme?.title || contextRow.channel.name} subtitle={contextProgramme ? `${contextRow.channel.name} · ${tvTime(contextProgramme.start)} – ${tvTime(contextProgramme.stop)}` : `Channel ${contextRow.number} · ${contextRow.channel.group}`} description={contextProgramme ? [contextProgramme.episode, contextProgramme.description].filter(Boolean).join(' · ') : undefined} actions={contextActions} onClose={() => setContext(undefined)} />}
  </View>;
}

function Footer({ screen }: { screen: 'guide' | 'dvr' }) {
  const labels = screen === 'guide' ? ['▲ ▼ ◀ ▶ Browse', 'OK Watch', 'R Record', 'S Series', 'Menu / 0–9 Channels', 'D My DVR'] : ['▲ ▼ Select', '◀ ▶ Tabs', 'OK Play', 'X Delete', 'G Guide'];
  return <View style={[s.footer, screen === 'dvr' && { marginHorizontal: -64 }]}>{labels.map((label, i) => <Label key={label} style={[s.footerText, i === labels.length - 1 ? { marginLeft: 'auto' as const } : {}]}>{label}</Label>)}</View>;
}
function DvrDetails({ item, state, onAction, touch, scale }: { item?: TvDvrItem; state: TvDashboardState; onAction: Props['onDvrAction']; touch?: boolean; scale: number }) {
  if (!item) return touch ? null : <View style={s.side} />;
  const buttons = dvrItemActions(item);
  const content = <>{!touch && <Preview channel={item.channel} recording={item.kind === 'recording'} style={s.sidePreview} />}
    <Label style={s.sideTitle}>{item.title}</Label><Label style={s.sideMeta}>{item.meta}{item.protected ? ' · Protected' : ''}</Label><Label style={s.sideDescription}>{item.description}</Label>
    <View style={[s.actions, { flexWrap: 'wrap' }]}>{buttons.map((button, i) => <Action scale={scale} key={button.action} primary={i === 0} focused={state.focus.zone === 'dvrActions' && state.focus.index === i} onPress={() => onAction(button.action)}>{button.label}</Action>)}</View>
  </>;
  return touch ? <ScrollView style={[s.side, { width: '32%', flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 24 }]} contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>{content}</ScrollView> : <View style={s.side}>{content}</View>;
}

const C = DVR_COLORS;
const s = StyleSheet.create({
  text: { fontFamily: Platform.OS === 'web' ? 'Segoe UI' : 'Roboto', color: C.text, fontSize: 24, includeFontPadding: false },
  viewport: { flex: 1, backgroundColor: '#000', overflow: 'hidden' }, stage: { position: 'absolute', width: 1920, height: 1080, backgroundColor: C.bg, overflow: 'hidden', transformOrigin: 'top left' },
  top: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line }, brand: { fontSize: 26, lineHeight: 35, fontWeight: '600', letterSpacing: -0.3, color: C.muted }, nav: { flexDirection: 'row', gap: 8 },
  navButton: { minHeight: 48, minWidth: 100, paddingVertical: 8, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel, borderRadius: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' }, navOn: { borderBottomColor: C.accent }, navText: { fontSize: 18, lineHeight: 26, color: C.muted }, clock: { marginLeft: 'auto', fontSize: 26, lineHeight: 35, color: C.muted, fontVariant: ['tabular-nums'] },
  screen: { flex: 1, minHeight: 0 }, details: { height: 300, flexDirection: 'row', gap: 48, paddingTop: 8, paddingHorizontal: 64, paddingBottom: 28 },
  preview: { width: 448, height: 252, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line }, previewName: { position: 'absolute', left: 16, bottom: 12, fontSize: 20, lineHeight: 27, color: C.muted }, previewRec: { position: 'absolute', right: 16, top: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, previewRecText: { fontSize: 20, lineHeight: 27 },
  info: { flex: 1, minWidth: 0 }, when: { fontSize: 24, lineHeight: 32, color: C.muted }, guideTitle: { fontSize: 52, lineHeight: 69, fontWeight: '600', letterSpacing: -0.8, marginTop: 6, marginBottom: 12 }, guideDescription: { fontSize: 24, lineHeight: 34.8, color: C.description, maxWidth: 900 },
  actions: { marginTop: 'auto', flexDirection: 'row', gap: 14, alignItems: 'center' }, button: { paddingVertical: 12, paddingHorizontal: 28, borderWidth: 1, borderColor: C.line, borderRadius: 6 }, buttonText: { fontSize: 24, lineHeight: 32 }, primary: { backgroundColor: C.accent, borderColor: C.accent }, primaryText: { color: C.ink, fontWeight: '600' }, actionFocus: { outlineColor: C.accent, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 4 }, hint: { fontSize: 20, lineHeight: 27, color: C.dim, marginLeft: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.rec }, ring: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.accent },
  grid: { flex: 1, minHeight: 0, borderTopWidth: 1, borderColor: C.line }, ruler: { height: 56, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line }, corner: { width: 324, paddingLeft: 64, paddingRight: 24, justifyContent: 'center' }, cornerText: { fontSize: 20, lineHeight: 27, color: C.dim }, clip: { flex: 1, overflow: 'hidden' }, tick: { position: 'absolute', top: 0, bottom: 0, paddingLeft: 12, justifyContent: 'center' }, tickText: { fontSize: 22, lineHeight: 29, color: C.muted, fontVariant: ['tabular-nums'] },
  rowsWrap: { flex: 1, minHeight: 0, overflow: 'hidden' }, row: { position: 'absolute', left: 0, right: 0, height: 84, flexDirection: 'row' }, channel: { width: 324, paddingLeft: 64, paddingRight: 24, flexDirection: 'row', alignItems: 'center', gap: 18 }, channelNumber: { width: 40, fontSize: 24, lineHeight: 32, color: C.dim, fontVariant: ['tabular-nums'] }, channelName: { fontSize: 24, lineHeight: 32, color: C.muted, flexShrink: 1 }, lane: { flex: 1, overflow: 'hidden' }, programme: { position: 'absolute', top: 5, bottom: 5, backgroundColor: C.cell, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderRadius: 4 }, programmeNow: { backgroundColor: C.now }, programmeFocus: { backgroundColor: C.accent }, programmeText: { fontSize: 24, lineHeight: 32, flexShrink: 1 }, nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.rec, opacity: 0.8 },
  programmeContent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, overflow: 'hidden' },
  footer: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 64, gap: 40, borderTopWidth: 1, borderTopColor: C.line }, footerText: { fontSize: 20, lineHeight: 27, color: C.dim },
  dvr: { flex: 1, minHeight: 0, flexDirection: 'row' }, dvrMain: { flex: 1, paddingHorizontal: 64 }, dvrHead: { flexDirection: 'row', alignItems: 'baseline', gap: 56, paddingTop: 4, paddingBottom: 8 }, dvrTitle: { fontSize: 48, lineHeight: 64, fontWeight: '600', letterSpacing: -0.8 }, tabs: { flexDirection: 'row', gap: 36 }, tab: { paddingVertical: 4, borderBottomWidth: 3, borderBottomColor: 'transparent' }, tabText: { fontSize: 26, lineHeight: 35, color: C.dim }, summary: { fontSize: 22, lineHeight: 30, color: C.muted, paddingTop: 8, paddingBottom: 20 }, conflict: { borderLeftWidth: 3, borderLeftColor: C.accent, paddingVertical: 4, paddingLeft: 16, marginBottom: 18 }, conflictText: { fontSize: 22, lineHeight: 30 },
  list: { flex: 1, minHeight: 0, overflow: 'hidden' }, item: { position: 'absolute', left: 0, right: 0, height: 88, flexDirection: 'row', alignItems: 'center', gap: 24, paddingRight: 20, borderRadius: 4 }, itemFocus: { backgroundColor: C.panel, outlineWidth: 1, outlineStyle: 'solid', outlineColor: C.accent, paddingLeft: 16 }, itemMark: { width: 28, alignItems: 'center' }, itemTitleBlock: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 14, overflow: 'hidden' }, itemTitle: { fontFamily: Platform.OS === 'web' ? 'Segoe UI' : 'Roboto', fontSize: 28, lineHeight: 37, includeFontPadding: false, color: C.text, flexShrink: 1 }, itemSubtitle: { fontSize: 22, lineHeight: 30, color: C.muted, flexShrink: 1 }, itemRight: { fontSize: 22, lineHeight: 30, color: C.muted, fontVariant: ['tabular-nums'] }, progress: { width: 120, height: 4, backgroundColor: C.line }, progressFill: { height: 4, backgroundColor: C.accent },
  side: { width: 560, borderLeftWidth: 1, borderLeftColor: C.line, paddingTop: 8, paddingHorizontal: 48, paddingBottom: 28, gap: 14 }, sidePreview: { width: '100%', height: 290 }, sideTitle: { fontSize: 36, lineHeight: 41.4, fontWeight: '600', letterSpacing: -0.5, marginTop: 8 }, sideMeta: { fontSize: 22, lineHeight: 30, color: C.muted }, sideDescription: { fontSize: 22, lineHeight: 31.9, color: C.description }, empty: { fontSize: 24, lineHeight: 32, color: C.muted, paddingVertical: 24 },
  toast: { position: 'absolute', bottom: 84, alignSelf: 'center', backgroundColor: C.text, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 6 }, toastText: { fontSize: 22, lineHeight: 29, color: C.bg },
});
