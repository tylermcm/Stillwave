import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { discoverModules, type HubModule, type HubModuleId } from '../../core/mobileHub';
import type { MobileInsets } from '../../core/mobileDashboard';
import { MeshArt } from '../../ui/MeshArt';
import { FONT, R, T, TYPE } from '../../ui/theme';

function Card({ module, onPress }: { module: HubModule; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={module.available ? module.title : `${module.title}. Coming soon.`} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
    <MeshArt id={module.mesh} style={StyleSheet.absoluteFill} />
    <View style={s.cardShade} />
    <View style={s.cardBody}>
      <View style={s.icon}><Ionicons name={module.icon} size={20} color={T.text} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.cardTitle} numberOfLines={1}>{module.title}</Text>
        <Text style={s.cardSummary} numberOfLines={2}>{module.summary}</Text>
      </View>
    </View>
    {module.available ? <View style={s.soon}><Ionicons name="chevron-forward" size={14} color={T.text2} /></View> : <View style={s.soon}><Text style={s.soonText}>COMING SOON</Text></View>}
  </Pressable>;
}

/**
 * Discover is the one door to everything that is not a channel. The modules are approved scope but
 * not built yet, so each card says so plainly instead of pretending to open.
 */
export function MobileDiscover({ insets, hidden, onOpen }: { insets: MobileInsets; hidden?: readonly string[]; onOpen: (id: HubModuleId) => void }) {
  const modules = discoverModules('phone', hidden);
  const [open, setOpen] = useState<HubModule>();
  const pad = { paddingLeft: insets.left + 84, paddingRight: insets.right + 28, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 };
  return <View style={s.root}>
    <ScrollView contentContainerStyle={[s.scroll, pad]} showsVerticalScrollIndicator={false}>
      <View style={s.head}>
        <Text style={s.title}>Discover</Text>
        <Text style={s.sub}>More than television</Text>
      </View>
      {modules.length ? <View style={s.grid}>{modules.map(module => <Card key={module.id} module={module} onPress={() => module.available ? onOpen(module.id) : setOpen(module)} />)}</View>
        : <View style={s.empty}><Text style={s.emptyTitle}>All sections are hidden</Text><Text style={s.sub}>Turn Discover sections back on in Menu → Preferences.</Text></View>}
    </ScrollView>
    {open && <View style={s.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(undefined)} style={StyleSheet.absoluteFill} />
      <View style={s.sheet} accessibilityViewIsModal>
        <View style={s.icon}><Ionicons name={open.icon} size={22} color={T.mint} /></View>
        <Text style={s.sheetTitle}>{open.title}</Text>
        <Text style={s.sheetBody}>{open.summary}</Text>
        <Text style={s.sheetNote}>This section is part of the approved plan and is not available in this build yet.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setOpen(undefined)} style={({ pressed }) => [s.close, pressed && { opacity: 0.8 }]}><Text style={s.closeText}>Got it</Text></Pressable>
      </View>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.ink },
  scroll: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 14, minHeight: 44 },
  title: { fontFamily: FONT, color: T.text, ...TYPE.title },
  sub: { fontFamily: FONT, color: T.text2, ...TYPE.body },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { flexGrow: 1, flexBasis: 280, minHeight: 112, borderRadius: R.card, overflow: 'hidden', justifyContent: 'flex-end' },
  cardShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,11,23,0.52)' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingTop: 30 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,11,23,0.55)', borderWidth: 1, borderColor: T.edge },
  cardTitle: { fontFamily: FONT, color: T.text, ...TYPE.headline },
  cardSummary: { fontFamily: FONT, color: T.text2, fontSize: 12.5, lineHeight: 17 },
  soon: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(8,11,23,0.7)' },
  soonText: { fontFamily: FONT, color: T.text2, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  empty: { gap: 6, paddingVertical: 24 },
  emptyTitle: { fontFamily: FONT, color: T.text, ...TYPE.headline },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,6,12,0.7)' },
  sheet: { width: 360, maxWidth: '90%', padding: 22, gap: 8, borderRadius: R.sheet, backgroundColor: T.glass, borderWidth: 1, borderColor: T.edge },
  sheetTitle: { fontFamily: FONT, color: T.text, ...TYPE.title, fontSize: 22, lineHeight: 26, marginTop: 6 },
  sheetBody: { fontFamily: FONT, color: T.text, ...TYPE.body },
  sheetNote: { fontFamily: FONT, color: T.text2, ...TYPE.caption },
  close: { alignSelf: 'flex-start', minHeight: 46, paddingHorizontal: 22, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.light, marginTop: 8 },
  closeText: { fontFamily: FONT, color: T.lightInk, fontSize: 15, fontWeight: '700' },
});
