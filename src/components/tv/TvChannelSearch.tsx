import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { tvNative, useTvKeys } from '../../data/tv';
import { TvButton } from './TvUi';

export function TvChannelSearch({ categories, query, category, onApply, onClose }: {
  categories: string[]; query: string; category: string; onApply: (query: string, category: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState(query), [group, setGroup] = useState(category);
  const [index, setIndex] = useState(0), [typing, setTyping] = useState(false);
  const viewport = useWindowDimensions();
  const compact = viewport.height < 600;
  const input = useRef<ComponentRef<typeof TextInput>>(null), scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const options = ['all', ...categories];
  const press = (i: number) => {
    if (i === 0) input.current?.focus();
    else if (i === 1) { setText(''); setGroup('all'); }
    else if (i === 2) onApply(text, group);
    else if (i === 3) onClose();
    else setGroup(options[i - 4]!);
  };
  useEffect(() => { tvNative?.setRemoteEnabled(!typing); return () => tvNative?.setRemoteEnabled(true); }, [typing]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (typing) { input.current?.blur(); setTyping(false); } else onClose(); return true; }); return () => sub.remove(); }, [typing, onClose]);
  useEffect(() => { scroll.current?.scrollTo({ y: Math.max(0, (index - 6) * 46), animated: false }); }, [index]);
  useTvKeys(key => {
    if (key === 'back' || key === 'menu') onClose();
    else if (key === 'up' || key === 'down') setIndex(i => Math.max(0, Math.min(options.length + 3, i + (key === 'up' ? -1 : 1))));
    else if (key === 'select') press(index);
  }, !typing);
  return <KeyboardAvoidingView style={s.backdrop}><View style={[s.panel, compact && { width: '94%', height: '94%', padding: 12 }]} accessibilityViewIsModal>
    <Text style={[s.title, compact && { fontSize: 20, marginBottom: 6 }]}>Search and filter channels</Text>
    <TextInput ref={input} value={text} onChangeText={setText} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onSubmitEditing={() => { input.current?.blur(); setTyping(false); setIndex(2); }} returnKeyType="done" placeholder="Channel name, number or upcoming show" placeholderTextColor="#7f8f90" maxLength={160} style={[s.input, compact && { fontSize: 18, padding: 8 }]} accessibilityLabel="Search channels and shows" />
    <Text numberOfLines={1} style={[s.hint, compact && { marginVertical: 4, fontSize: 14 }]}>Category: {group === 'all' ? 'All categories' : group}. Select Apply when ready.</Text>
    <View style={s.actions}>{['Enter search', 'Clear filters', 'Apply', 'Cancel'].map((label, i) => <TvButton key={label} label={label} focused={!typing && index === i} onPress={() => press(i)} />)}</View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" style={s.list}>{options.map((name, i) => <TvButton key={name} label={`${group === name ? '✓ ' : ''}${name === 'all' ? 'All categories' : name}`} selected={group === name} focused={!typing && index === i + 4} onPress={() => { setIndex(i + 4); press(i + 4); }} />)}</ScrollView>
  </View></KeyboardAvoidingView>;
}
const s = StyleSheet.create({ backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center' }, panel: { width: '76%', maxWidth: 1000, height: '86%', padding: 20, backgroundColor: '#11171a', borderWidth: 1, borderColor: '#8fd6c0' }, title: { fontSize: 25, color: '#e1e8e8', marginBottom: 10 }, input: { color: '#e1e8e8', fontSize: 22, padding: 10, backgroundColor: '#0b0f10', borderWidth: 1, borderColor: '#55646a' }, hint: { color: '#a9b6b6', fontSize: 16, marginVertical: 8 }, actions: { flexDirection: 'row', gap: 8 }, list: { flex: 1, marginTop: 8 } });
