import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { navigationSwipe, type MobileInsets } from '../../core/mobileDashboard';
import type { HubDestination } from '../../core/mobileHub';
import { FONT, R, T } from '../../ui/theme';

const DESTINATIONS: { id: HubDestination; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'guide', label: 'Live TV', icon: 'tv-outline' },
  { id: 'dvr', label: 'My DVR', icon: 'recording-outline' },
  { id: 'discover', label: 'Discover', icon: 'compass-outline' },
];
/** Where the logo button sits: inside the safe area, in the gutter every phone screen reserves. */
export const MENU_BUTTON = { size: 44, left: 20, top: 10 } as const;

/**
 * A small logo button opens the navigation drawer. It scrolls nowhere and pins nothing: the button
 * occupies a reserved corner, so no screen carries a permanent top bar.
 */
export function MobileNavigation({ screen, onScreen, onMenu, insets }: {
  screen: HubDestination; onScreen: (screen: HubDestination) => void; onMenu?: () => void; insets?: MobileInsets;
}) {
  const [open, setOpen] = useState(false);
  const origin = useRef({ x: 0, y: 0 });
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy, moveX, moveY }) => {
      if (Math.abs(dx) <= 6 || Math.abs(dx) <= Math.abs(dy) * 1.5) return false;
      origin.current = { x: moveX - dx, y: moveY - dy };
      return true;
    },
    onPanResponderTerminationRequest: () => false,
    // Only closing is a swipe; opening stays a deliberate tap so the system back gesture never competes.
    onPanResponderRelease: (_, gesture) => { if (navigationSwipe(gesture.moveX - origin.current.x, gesture.moveY - origin.current.y) === 'close') setOpen(false); },
  }), []);
  useEffect(() => {
    if (!open) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(false); return true; });
    if (Platform.OS !== 'web') return () => back.remove();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener('keydown', key, true);
    return () => { back.remove(); window.removeEventListener('keydown', key, true); };
  }, [open]);
  const left = (insets?.left ?? 0) + MENU_BUTTON.left;
  const top = (insets?.top ?? 0) + MENU_BUTTON.top;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {open && <Pressable testID="mobile-navigation-backdrop" accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => setOpen(false)} style={s.backdrop} />}
    {open ? <View style={[s.panel, { left: (insets?.left ?? 0) + 16, top: (insets?.top ?? 0) + 12, bottom: (insets?.bottom ?? 0) + 12 }]} {...swipe.panHandlers}>
      <View style={s.header}>
        <Pressable testID="mobile-navigation-toggle" accessibilityRole="button" accessibilityLabel="Close StillWave navigation" accessibilityHint="Tap to close, or swipe left." accessibilityState={{ expanded: true }} onPress={() => setOpen(false)} style={s.brandButton}>
          <Image accessibilityIgnoresInvertColors source={require('../../../assets/branding/stillwave-mark-v2.png')} resizeMode="contain" style={s.brandLogo} />
          <Text style={s.brandText}>Still<Text style={{ color: T.mint }}>Wave</Text></Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.links} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {DESTINATIONS.map(item => {
          const selected = item.id === screen;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { onScreen(item.id); setOpen(false); }} style={({ pressed }) => [s.link, selected && s.linkSelected, pressed && !selected && { backgroundColor: T.mat2 }]}>
            <Ionicons name={item.icon} size={20} color={selected ? T.lightInk : T.text} />
            <Text style={[s.linkText, selected && { color: T.lightInk }]}>{item.label}</Text>
          </Pressable>;
        })}
        {onMenu && <Pressable accessibilityRole="button" accessibilityLabel="Menu and settings" onPress={() => { setOpen(false); onMenu(); }} style={({ pressed }) => [s.link, { marginTop: 8 }, pressed && { backgroundColor: T.mat2 }]}>
          <Ionicons name="options-outline" size={20} color={T.text2} /><Text style={[s.linkText, { color: T.text2 }]}>Menu</Text>
        </Pressable>}
      </ScrollView>
    </View> : <Pressable testID="mobile-navigation-toggle" accessibilityRole="button" accessibilityLabel="Open navigation" accessibilityHint="Shows Home, Live TV, My DVR, Discover and Menu." accessibilityState={{ expanded: false }} onPress={() => setOpen(true)} style={({ pressed }) => [s.menuButton, { left, top }, pressed && { opacity: 0.7 }]}>
      <Image accessibilityIgnoresInvertColors source={require('../../../assets/branding/stillwave-mark-v2.png')} resizeMode="contain" style={s.menuLogo} />
    </Pressable>}
  </View>;
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(3,6,12,0.62)' },
  menuButton: { position: 'absolute', width: MENU_BUTTON.size, height: MENU_BUTTON.size, borderRadius: MENU_BUTTON.size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: T.glass, borderWidth: 1, borderColor: T.edge },
  menuLogo: { width: 26, height: 26 },
  panel: { position: 'absolute', width: 292, maxWidth: '82%', padding: 12, backgroundColor: T.glass, borderWidth: 1, borderColor: T.edge, borderRadius: R.sheet },
  header: { marginBottom: 4 },
  brandButton: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 4 },
  brandLogo: { width: 32, height: 32 },
  brandText: { fontFamily: FONT, color: T.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  links: { gap: 3, paddingBottom: 2 },
  link: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, borderRadius: 14 },
  linkSelected: { backgroundColor: T.light },
  linkText: { fontFamily: FONT, color: T.text, fontSize: 16, fontWeight: '700' },
});
