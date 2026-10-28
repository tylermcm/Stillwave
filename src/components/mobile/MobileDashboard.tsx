import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cityLabel, timeAgo, type Picture, type City, type Headline, type Units, type Weather, type WeatherKind } from '../../core/dashboard';
import { greeting, type MeshId } from '../../core/mobileHub';
import type { MobileInsets } from '../../core/mobileDashboard';
import { searchCities } from '../../data/dashboardApi';
import { MeshArt, Scrim } from '../../ui/MeshArt';
import { FONT, R, T, TYPE } from '../../ui/theme';
import type { useDashboard } from './useDashboard';

type Dash = ReturnType<typeof useDashboard>;
const ICON: Record<WeatherKind, [day: keyof typeof Ionicons.glyphMap, night: keyof typeof Ionicons.glyphMap]> = {
  clear: ['sunny-outline', 'moon-outline'], partly: ['partly-sunny-outline', 'cloudy-night-outline'], cloud: ['cloud-outline', 'cloud-outline'],
  fog: ['cloud-outline', 'cloud-outline'], drizzle: ['rainy-outline', 'rainy-outline'], rain: ['rainy-outline', 'rainy-outline'],
  snow: ['snow-outline', 'snow-outline'], storm: ['thunderstorm-outline', 'thunderstorm-outline'],
};
const isNight = (time: string) => { const h = Number(time.slice(11, 13)); return h < 6 || h >= 18; };
const backdrop = (w?: Weather): MeshId => !w ? 'ocean' : w.kind === 'rain' || w.kind === 'drizzle' || w.kind === 'storm' ? 'ocean' : w.kind === 'clear' ? (w.isDay ? 'coast' : 'aurora') : w.kind === 'partly' ? (w.isDay ? 'mountain' : 'dusk') : 'dusk';
const open = (url?: string) => { if (url) void Linking.openURL(url).catch(() => undefined); };

function Skeleton({ style }: { style: object }) { return <View style={[{ backgroundColor: T.mat2, borderRadius: R.card }, style]} />; }

function WeatherCard({ weather, loading, error, units, onUnits, onCity, onRetry, city }: { weather?: Weather; loading: boolean; error?: string; units: Units; onUnits: (u: Units) => void; onCity: () => void; onRetry: () => void; city: City }) {
  return <View style={[s.card, s.weather]}>
    <View style={s.cardTop}>
      <Pressable accessibilityRole="button" accessibilityLabel={`City: ${cityLabel(city)}. Change city.`} onPress={onCity} style={({ pressed }) => [s.cityButton, pressed && { opacity: 0.7 }]}>
        <Ionicons name="location-outline" size={16} color={T.text} /><Text style={s.cityText} numberOfLines={1}>{cityLabel(city)}</Text><Ionicons name="chevron-down" size={14} color={T.text2} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Units: ${units === 'imperial' ? 'Fahrenheit' : 'Celsius'}. Switch.`} onPress={() => onUnits(units === 'imperial' ? 'metric' : 'imperial')} style={s.unitButton}><Text style={s.unitText}>{units === 'imperial' ? '°F' : '°C'}</Text></Pressable>
    </View>
    {weather ? <>
      <View style={s.tempRow}>
        <Text style={s.temp}>{Math.round(weather.temp)}°</Text>
        <View style={{ flex: 1, gap: 2 }}><Text style={s.sentence}>{weather.sentence}</Text><Text style={s.range}>H {Math.round(weather.hi)}° · L {Math.round(weather.lo)}°</Text></View>
      </View>
      <View style={s.hours}>{weather.hours.map(h => <View key={h.time} style={s.hour}>
        <Text style={s.hourLabel}>{h.label}</Text><Ionicons name={ICON[h.kind][isNight(h.time) ? 1 : 0]} size={18} color={T.text2} /><Text style={s.hourTemp}>{Math.round(h.temp)}°</Text>
      </View>)}</View>
    </> : loading ? <View style={{ gap: 10, paddingTop: 6 }}><Skeleton style={{ height: 56, width: '60%' }} /><Skeleton style={{ height: 40 }} /></View>
      : <View style={s.unavailable}><Ionicons name="cloud-offline-outline" size={24} color={T.warn} /><Text style={s.unavailableTitle}>Weather for {city.name} is unavailable</Text><Text style={s.muted}>{error || 'The forecast service didn’t respond.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry weather" onPress={onRetry} style={s.ghost}><Text style={s.ghostText}>Retry</Text></Pressable></View>}
  </View>;
}

function Astronomy({ picture, loading, onOpen }: { picture?: Picture; loading: boolean; onOpen: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={picture ? `Astronomy picture: ${picture.title}` : 'Astronomy picture unavailable'} disabled={!picture} onPress={onOpen} style={[s.card, s.astro]}>
    <MeshArt id="nebula" style={StyleSheet.absoluteFill} />
    {!!picture?.imageUrl && <Image accessibilityIgnoresInvertColors source={{ uri: picture.imageUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />}
    <Scrim from={0.1} to={0.92} start={0.2} />
    <View style={s.astroText}>
      <Text style={[s.label, { color: T.mint }]}>NASA IMAGE OF THE DAY</Text>
      <Text style={s.astroTitle} numberOfLines={2}>{picture ? picture.title : loading ? 'Loading…' : 'Not available right now'}</Text>
    </View>
  </Pressable>;
}

function Headlines({ count, items, source, loading, error, now, onOpen, onRetry }: { count: number; items?: Headline[]; source?: string; loading: boolean; error?: string; now: number; onOpen: (h: Headline) => void; onRetry: () => void }) {
  return <View style={[s.card, s.news]}>
    <Text style={s.label}>HEADLINES{source ? ` · ${source.toUpperCase()}` : ''}</Text>
    {items?.length ? items.slice(0, count).map((h, i) => <Pressable key={h.id} accessibilityRole="button" accessibilityLabel={`${h.title}${h.published ? `, ${timeAgo(h.published, now)}` : ''}`} onPress={() => onOpen(h)} style={({ pressed }) => [s.headline, i > 0 && s.rule, pressed && { opacity: 0.7 }]}>
      <Text style={[s.headlineText, i === 0 && { fontWeight: '800' }]} numberOfLines={2}>{h.title}</Text>
      {!!h.published && <Text style={s.muted}>{timeAgo(h.published, now)}</Text>}
    </Pressable>) : loading ? <View style={{ gap: 8, paddingTop: 6 }}><Skeleton style={{ height: 16 }} /><Skeleton style={{ height: 16, width: '80%' }} /></View>
      : <View style={{ gap: 6, paddingTop: 4 }}><Text style={s.muted}>{error || 'No stories right now.'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry headlines" onPress={onRetry} style={s.ghost}><Text style={s.ghostText}>Retry</Text></Pressable></View>}
  </View>;
}

function Sheet({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <View style={s.overlay}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
    <View style={[s.sheet, wide && { width: 520 }]} accessibilityViewIsModal>{children}</View>
  </View>;
}

function CityPicker({ current, onPick, onClose }: { current?: City; onPick: (city: City) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const request = useRef(0);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setState('idle'); return; }
    const id = ++request.current;
    setState('loading');
    const timer = setTimeout(() => {
      searchCities(query).then(found => { if (id !== request.current) return; setResults(found); setState(found.length ? 'idle' : 'empty'); })
        .catch(() => { if (id === request.current) setState('error'); });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);
  return <Sheet onClose={onClose}>
    <Text style={s.sheetTitle}>Choose your city</Text>
    <TextInput accessibilityLabel="Search for a city" autoFocus value={query} onChangeText={setQuery} placeholder="Search for a city" placeholderTextColor={T.text3} autoCapitalize="words" autoCorrect={false} style={s.input} />
    <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
      {state === 'loading' && <View style={s.row}><ActivityIndicator color={T.mint} /><Text style={s.muted}>Searching…</Text></View>}
      {state === 'empty' && <Text style={[s.muted, { paddingVertical: 8 }]}>No cities match “{query.trim()}”.</Text>}
      {state === 'error' && <Text style={[s.muted, { paddingVertical: 8, color: T.warn }]}>Couldn’t search right now. Check your connection.</Text>}
      {results.map(city => <Pressable key={`${city.name}${city.region}${city.lat}`} accessibilityRole="button" accessibilityLabel={`${cityLabel(city)}${city.country ? `, ${city.country}` : ''}`} onPress={() => onPick(city)} style={({ pressed }) => [s.result, pressed && { backgroundColor: T.mat2 }]}>
        <View style={{ flex: 1 }}><Text style={s.resultName}>{cityLabel(city)}</Text>{!!city.country && <Text style={s.muted}>{city.country}</Text>}</View>
        {current?.name === city.name && current.lat === city.lat && <Ionicons name="checkmark" size={18} color={T.mint} />}
      </Pressable>)}
    </ScrollView>
    <Text style={s.fine}>Cities are chosen manually. StillWave doesn’t ask for your location.</Text>
  </Sheet>;
}

/** Daily Dashboard: weather first, then one picture and a few headlines. Saved data survives going offline. */
export function MobileDashboard({ dash, insets, now, onBack }: { dash: Dash; insets: MobileInsets; now: number; onBack: () => void }) {
  const { store, loaded, parts, setCity, setUnits, refreshAll } = dash;
  const [picking, setPicking] = useState(false);
  const short = useWindowDimensions().height < 440;
  const [reading, setReading] = useState<{ kind: 'news'; item: Headline } | { kind: 'picture' }>();
  const pad = { paddingLeft: insets.left + 84, paddingRight: insets.right + 28, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 };
  const offline = !!store.weather && !!parts.weather.error && !parts.weather.loading;
  const busy = parts.weather.loading || parts.news.loading || parts.picture.loading;
  return <View style={s.root}>
    <MeshArt id={backdrop(store.weather)} style={StyleSheet.absoluteFill} />
    <Scrim from={0.62} to={0.78} start={0} />
    <ScrollView contentContainerStyle={[s.scroll, pad]} showsVerticalScrollIndicator={false}>
      <View style={s.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Discover" onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={22} color={T.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={s.title}>{greeting(now)}</Text><Text style={s.muted}>{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text></View>
        {busy ? <ActivityIndicator color={T.mint} /> : <Pressable accessibilityRole="button" accessibilityLabel="Refresh dashboard" onPress={refreshAll} style={s.back}><Ionicons name="refresh" size={20} color={T.text} /></Pressable>}
      </View>
      {offline && <View style={s.banner}><Ionicons name="cloud-offline-outline" size={16} color={T.warn} /><Text style={s.bannerText}>Couldn’t refresh. Showing the briefing saved {timeAgo(store.weather!.fetchedAt, now) || 'earlier'}.</Text></View>}
      {!loaded ? <Skeleton style={{ height: 200 }} /> : !store.city ? <View style={s.firstRun}>
        <View style={s.bigIcon}><Ionicons name="location-outline" size={26} color={T.mint} /></View>
        <Text style={s.firstTitle}>Choose your city</Text>
        <Text style={s.firstBody}>Pick a city for your forecast. StillWave doesn’t use your location unless you ask it to.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose city" onPress={() => setPicking(true)} style={({ pressed }) => [s.primary, pressed && { opacity: 0.8 }]}><Text style={s.primaryText}>Choose city</Text></Pressable>
      </View> : <View style={s.grid}>
        <WeatherCard city={store.city} weather={store.weather} loading={parts.weather.loading} error={parts.weather.error} units={store.units} onUnits={setUnits} onCity={() => setPicking(true)} onRetry={refreshAll} />
        <View style={s.right}>
          <Astronomy picture={store.picture?.picture} loading={parts.picture.loading} onOpen={() => setReading({ kind: 'picture' })} />
          <Headlines count={short ? 2 : 3} items={store.news?.items} source={store.news?.source} loading={parts.news.loading} error={parts.news.error} now={now} onOpen={item => setReading({ kind: 'news', item })} onRetry={refreshAll} />
        </View>
      </View>}
      <Text style={s.fine}>Weather by Open-Meteo.com · Image from NASA’s Image of the Day{store.news ? ` · Headlines from ${store.news.source}` : ''}</Text>
    </ScrollView>
    {picking && <CityPicker current={store.city} onPick={city => { setCity(city); setPicking(false); }} onClose={() => setPicking(false)} />}
    {reading?.kind === 'news' && <Sheet wide onClose={() => setReading(undefined)}>
      <Text style={s.label}>{store.news?.source?.toUpperCase()}{reading.item.published ? ` · ${timeAgo(reading.item.published, now).toUpperCase()}` : ''}</Text>
      <Text style={s.sheetTitle}>{reading.item.title}</Text>
      {!!reading.item.summary && <ScrollView style={{ maxHeight: 110 }}><Text style={s.sheetBody}>{reading.item.summary}</Text></ScrollView>}
      <View style={s.actions}><Pressable accessibilityRole="button" accessibilityLabel="Open article" onPress={() => open(reading.item.link)} style={({ pressed }) => [s.primary, pressed && { opacity: 0.8 }]}><Text style={s.primaryText}>Open article</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setReading(undefined)} style={s.ghost}><Text style={s.ghostText}>Done</Text></Pressable></View>
    </Sheet>}
    {reading?.kind === 'picture' && store.picture && <Sheet wide onClose={() => setReading(undefined)}>
      <Text style={[s.label, { color: T.mint }]}>NASA IMAGE OF THE DAY · {store.picture.picture.date}</Text>
      <Text style={s.sheetTitle}>{store.picture.picture.title}</Text>
      <ScrollView style={{ maxHeight: 120 }}><Text style={s.sheetBody}>{store.picture.picture.explanation}</Text></ScrollView>
      <Text style={s.fine}>Courtesy of NASA. Opens on nasa.gov.</Text>
      <View style={s.actions}><Pressable accessibilityRole="button" accessibilityLabel="Open full story" onPress={() => open(store.picture!.picture.link)} style={({ pressed }) => [s.primary, pressed && { opacity: 0.8 }]}><Text style={s.primaryText}>Open full story</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setReading(undefined)} style={s.ghost}><Text style={s.ghostText}>Done</Text></Pressable></View>
    </Sheet>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.ink },
  scroll: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT, color: T.text, ...TYPE.title },
  muted: { fontFamily: FONT, color: T.text2, ...TYPE.caption },
  label: { fontFamily: FONT, color: T.text2, ...TYPE.label },
  fine: { fontFamily: FONT, color: T.text3, fontSize: 11.5, lineHeight: 16 },
  grid: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  right: { flex: 1, gap: 12, minWidth: 250 },
  card: { borderRadius: R.card, overflow: 'hidden', backgroundColor: T.mat, borderWidth: 1, borderColor: T.hairline },
  weather: { flex: 1.15, minWidth: 300, padding: 16, gap: 8, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cityButton: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: T.mat2, alignSelf: 'flex-start', maxWidth: 240 },
  cityText: { fontFamily: FONT, color: T.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  unitButton: { minWidth: 44, minHeight: 40, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.mat2 },
  unitText: { fontFamily: FONT, color: T.text, fontSize: 14, fontWeight: '800' },
  tempRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  temp: { fontFamily: FONT, color: T.text, fontSize: 68, lineHeight: 72, fontWeight: '800', letterSpacing: -3 },
  sentence: { fontFamily: FONT, color: T.text, fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.2 },
  range: { fontFamily: FONT, color: T.text2, ...TYPE.caption },
  hours: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: T.hairline },
  hour: { alignItems: 'center', gap: 3 },
  hourLabel: { fontFamily: FONT, color: T.text2, fontSize: 11.5 },
  hourTemp: { fontFamily: FONT, color: T.text, fontSize: 13.5, fontWeight: '700' },
  unavailable: { gap: 6, alignItems: 'flex-start', paddingVertical: 8 },
  unavailableTitle: { fontFamily: FONT, color: T.text, ...TYPE.headline },
  astro: { height: 104, justifyContent: 'flex-end' },
  astroText: { padding: 14, gap: 2 },
  astroTitle: { fontFamily: FONT, color: T.text, fontSize: 18, lineHeight: 22, fontWeight: '800', letterSpacing: -0.3 },
  news: { padding: 14, gap: 2 },
  headline: { paddingVertical: 8, gap: 2 },
  rule: { borderTopWidth: 1, borderTopColor: T.hairline },
  headlineText: { fontFamily: FONT, color: T.text, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,196,107,0.12)' },
  bannerText: { fontFamily: FONT, color: T.warn, fontSize: 12.5, fontWeight: '600', flex: 1 },
  firstRun: { alignItems: 'flex-start', gap: 8, maxWidth: 420, paddingVertical: 16 },
  bigIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: T.mat2 },
  firstTitle: { fontFamily: FONT, color: T.text, ...TYPE.title },
  firstBody: { fontFamily: FONT, color: T.text2, ...TYPE.body },
  primary: { minHeight: 46, paddingHorizontal: 22, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.light },
  primaryText: { fontFamily: FONT, color: T.lightInk, fontSize: 15, fontWeight: '700' },
  ghost: { minHeight: 40, paddingHorizontal: 18, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: T.glassLight },
  ghostText: { fontFamily: FONT, color: T.text, fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,6,12,0.7)' },
  sheet: { width: 400, maxWidth: '92%', padding: 20, gap: 8, borderRadius: R.sheet, backgroundColor: T.glass, borderWidth: 1, borderColor: T.edge },
  sheetTitle: { fontFamily: FONT, color: T.text, ...TYPE.title, fontSize: 22, lineHeight: 26 },
  sheetBody: { fontFamily: FONT, color: T.text, ...TYPE.body },
  input: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: T.mat2, color: T.text, fontFamily: FONT, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  result: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 10, borderRadius: 12 },
  resultName: { fontFamily: FONT, color: T.text, fontSize: 15, fontWeight: '700' },
});
