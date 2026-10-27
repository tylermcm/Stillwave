import { useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { useTvKeys } from '../../data/tv';
import { TvButton, tvColors, tvUi } from './TvUi';

export interface TvAction { id: string; label: string; icon?: keyof typeof Ionicons.glyphMap; run: () => void; disabled?: boolean }
export function TvPlayerControls({ title, subtitle, badge, message, actions, options = [], settled, paused, onClose, onPause, onSeek }: {
  title: string; subtitle?: string; badge: string; message?: string; actions: TvAction[]; options?: TvAction[];
  settled: boolean; paused: boolean; onClose: () => void; onPause?: () => void; onSeek?: (seconds: number) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [menu, setMenu] = useState(false);
  const [index, setIndex] = useState(Math.max(0, actions.findIndex(a => a.id === 'pause')));
  const [interaction, setInteraction] = useState(0);
  const menuList = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const choices = menu ? [...options, { id: 'done', label: 'Back to player', run: () => { setMenu(false); setIndex(Math.max(0, actions.findIndex(a => a.id === 'pause'))); } }] : actions;
  const focus = Math.min(index, Math.max(0, choices.length - 1));
  useEffect(() => { if (menu) menuList.current?.scrollTo({ y: Math.max(0, (focus - 2) * 44), animated: false }); }, [menu, focus]);
  const close = () => { if (menu) { setMenu(false); setIndex(Math.max(0, actions.findIndex(a => a.id === 'pause'))); } else onClose(); };
  useEffect(() => {
    if (!visible || menu || !settled || paused) return;
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [visible, menu, settled, paused, interaction]);
  useEffect(() => { if (!settled || paused || message) setVisible(true); }, [settled, paused, message]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; }); return () => sub.remove(); });
  useTvKeys(key => {
    setInteraction(n => n + 1);
    if (key === 'back') { close(); return; }
    if (key === 'playPause') { onPause?.(); setVisible(true); return; }
    if (key === 'rewind' || key === 'fastForward') { onSeek?.(key === 'rewind' ? -30 : 30); setVisible(true); return; }
    if (key === 'menu') { setMenu(value => !value); setIndex(0); setVisible(true); return; }
    if (!visible) { setVisible(true); setIndex(Math.max(0, actions.findIndex(a => a.id === 'pause'))); return; }
    if (key === 'select') { if (!choices[focus]?.disabled) choices[focus]?.run(); return; }
    if (menu) {
      if (key === 'up' || key === 'down') setIndex(Math.max(0, Math.min(choices.length - 1, focus + (key === 'up' ? -1 : 1))));
    } else {
      if (key === 'left' || key === 'right') setIndex(Math.max(0, Math.min(actions.length - 1, focus + (key === 'left' ? -1 : 1))));
      if (key === 'up' && options.length) { setMenu(true); setIndex(0); }
      if (key === 'down' && settled && !paused) setVisible(false);
    }
  });
  if (!visible) return null;
  return <View testID="tv-player-controls" style={styles.overlay} pointerEvents="box-none">
    <View style={styles.heading}><View style={{ flex: 1 }}><Text style={tvUi.heading}>{title}</Text>{!!subtitle && <Text style={tvUi.text}>{subtitle}</Text>}</View><Text style={tvUi.text}>{badge}</Text></View>
    {menu ? <View style={styles.menu}><Text style={[tvUi.heading, { marginBottom: 12 }]}>Player options</Text><ScrollView ref={menuList}>{choices.map((action, i) => <TvButton key={action.id} {...action} focused={i === focus} onFocus={() => setIndex(i)} onPress={action.run} />)}</ScrollView></View>
      : <View style={styles.bottom}>
        {!!message && <Text accessibilityRole="alert" style={styles.message} numberOfLines={3}>{message}</Text>}
        <View style={styles.actions}>{actions.map((action, i) => <TvButton key={action.id} {...action} focused={i === focus} onFocus={() => setIndex(i)} onPress={action.run} style={styles.action} />)}</View>
        <Text style={styles.hint}>← → Controls     OK Select     ↑ Options     Back Channels</Text>
      </View>}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#0003' },
  heading: { position: 'absolute', top: 24, left: 32, right: 32, padding: 15, borderRadius: 10, backgroundColor: '#091315dc', flexDirection: 'row', alignItems: 'center', gap: 20 },
  bottom: { position: 'absolute', bottom: 22, left: 32, right: 32, gap: 12, backgroundColor: '#091315ec', padding: 15, borderRadius: 12 },
  actions: { flexDirection: 'row', gap: 6, justifyContent: 'center' }, action: { flex: 1, minHeight: 56, flexDirection: 'column', paddingHorizontal: 6, paddingVertical: 7, gap: 3 },
  hint: { color: tvColors.muted, textAlign: 'center', fontSize: 12 }, message: { color: tvColors.error, fontSize: 14 },
  menu: { position: 'absolute', right: 32, top: 110, bottom: 24, width: 390, padding: 18, backgroundColor: tvColors.background, borderRadius: 12 },
});
