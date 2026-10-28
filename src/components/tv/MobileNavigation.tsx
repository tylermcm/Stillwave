import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { navigationSwipe } from '../../core/mobileDashboard';

const C = { bg: '#0b0f10', panel: '#11171a', line: '#1f2b2e', text: '#e1e8e8', muted: '#7f8f90', accent: '#8fd6c0' };

/** An explicit tap target and a local swipe surface keep navigation discoverable. */
export function MobileNavigation({ screen, onScreen, onMenu }: {
  screen: 'guide' | 'dvr'; onScreen: (screen: 'guide' | 'dvr') => void; onMenu?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const origin = useRef({ x: 0, y: 0 });
  const swipe = useMemo(() => PanResponder.create({
    // Claim early: PanResponder starts measuring its drag again on grant.
    onMoveShouldSetPanResponder: (_, { dx, dy, moveX, moveY }) => {
      if (Math.abs(dy) <= 6 || Math.abs(dy) <= Math.abs(dx) * 1.5) return false;
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
    <View pointerEvents={open ? 'auto' : 'box-none'} style={[s.bar, open && s.expanded]} {...swipe.panHandlers}>
      {open && <Pressable testID="mobile-navigation-toggle" accessibilityRole="button" accessibilityLabel="Close StillWave navigation" accessibilityHint="Swipe up here or tap to close navigation." accessibilityState={{ expanded: true }} onPress={() => setOpen(false)} style={s.logoButton}>
        <Image accessibilityIgnoresInvertColors source={require('../../../assets/branding/stillwave-mark-v2.png')} resizeMode="contain" style={s.logo} />
      </Pressable>}
      {open ? <View style={s.links}>
        {(['guide', 'dvr'] as const).map(next => <Pressable key={next} accessibilityRole="tab" accessibilityState={{ selected: next === screen }} onPress={() => { onScreen(next); setOpen(false); }} style={[s.link, next === screen && s.selected]}><Text style={s.text}>{next === 'guide' ? 'Guide' : 'My DVR'}</Text></Pressable>)}
        {onMenu && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); onMenu(); }} style={s.link}><Text style={s.text}>Menu</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel="Close navigation" onPress={() => setOpen(false)} style={s.close}><Text style={s.text}>×</Text></Pressable>
      </View> : <Pressable testID="mobile-navigation-toggle" accessibilityRole="button" accessibilityLabel="Open navigation" accessibilityHint="Swipe down or tap to show Guide, My DVR and Menu." accessibilityState={{ expanded: false }} onPress={() => setOpen(true)} style={s.handleButton}><View style={s.handle} /></Pressable>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#0008' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  expanded: { backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 4 },
  logoButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 44, height: 44 },
  handleButton: { position: 'absolute', top: 0, left: '50%', marginLeft: -36, width: 72, height: 44, alignItems: 'center', paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.muted },
  links: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: C.panel, borderRadius: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  selected: { borderBottomColor: C.accent },
  text: { color: C.text, fontSize: 16, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
