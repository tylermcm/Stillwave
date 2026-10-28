import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { navigationSwipe } from '../../core/mobileDashboard';

const C = { bg: '#0b0f10', panel: '#11171a', line: '#1f2b2e', text: '#e1e8e8', muted: '#7f8f90', accent: '#8fd6c0' };

/** Keep the handle inside the safe area, away from Android's system edges. */
export function MobileNavigation({ screen, onScreen, onMenu }: {
  screen: 'guide' | 'dvr'; onScreen: (screen: 'guide' | 'dvr') => void; onMenu?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const origin = useRef({ x: 0, y: 0 });
  const swipe = useMemo(() => PanResponder.create({
    // Claim early: PanResponder starts measuring its drag again on grant.
    onMoveShouldSetPanResponder: (_, { dx, dy, moveX, moveY }) => {
      if (Math.abs(dx) <= 6 || Math.abs(dx) <= Math.abs(dy) * 1.5) return false;
      origin.current = { x: moveX - dx, y: moveY - dy };
      return true;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, gesture) => {
      const action = navigationSwipe(gesture.moveX - origin.current.x, gesture.moveY - origin.current.y);
      if (action) setOpen(action === 'open');
    },
  }), []);
  useEffect(() => {
    if (!open) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(false); return true; });
    if (Platform.OS !== 'web') return () => back.remove();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener('keydown', key, true);
    return () => { back.remove(); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {open && <Pressable testID="mobile-navigation-backdrop" accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => setOpen(false)} style={s.backdrop} />}
    <View pointerEvents={open ? 'auto' : 'box-none'} style={open ? s.panel : s.handlePosition} {...swipe.panHandlers}>
      {open ? <>
      <View style={s.header}><Pressable testID="mobile-navigation-toggle" accessibilityRole="button" accessibilityLabel="Close StillWave navigation" accessibilityHint="Swipe left here or tap to close navigation." accessibilityState={{ expanded: true }} onPress={() => setOpen(false)} style={s.logoButton}>
        <Image accessibilityIgnoresInvertColors source={require('../../../assets/branding/stillwave-mark-v2.png')} resizeMode="contain" style={s.logo} />
      </Pressable><Pressable accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => setOpen(false)} style={s.close}><Text style={s.text}>×</Text></Pressable></View>
      <ScrollView contentContainerStyle={s.links} keyboardShouldPersistTaps="handled">
        {(['guide', 'dvr'] as const).map(next => <Pressable key={next} accessibilityRole="tab" accessibilityState={{ selected: next === screen }} onPress={() => { onScreen(next); setOpen(false); }} style={[s.link, next === screen && s.selected]}><Text style={s.text}>{next === 'guide' ? 'Guide' : 'My DVR'}</Text></Pressable>)}
        {onMenu && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onMenu(); }} style={s.link}><Text style={s.text}>Menu</Text></Pressable>}
      </ScrollView></> : <Pressable testID="mobile-navigation-toggle" accessibilityRole="button" accessibilityLabel="Open navigation" accessibilityHint="Swipe right on this handle or tap to show Guide, My DVR and Menu." accessibilityState={{ expanded: false }} onPress={() => setOpen(true)} style={s.handleButton}><View style={s.handleTrack}><View style={s.handle} /></View></Pressable>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  panel: { position: 'absolute', top: 16, bottom: 16, left: 24, width: 232, maxWidth: '80%', padding: 12, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logoButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 44, height: 44 },
  handlePosition: { position: 'absolute', top: '50%', marginTop: -36, left: 24, width: 44, height: 72 },
  handleButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  handleTrack: { width: 12, height: 48, borderRadius: 6, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 3, height: 28, borderRadius: 2, backgroundColor: C.muted },
  links: { gap: 8, paddingBottom: 4 },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: C.panel, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  selected: { borderLeftColor: C.accent },
  text: { color: C.text, fontSize: 16, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
