import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

/** The same branding is used for the launch handoff and the review preview. */
export function LaunchSplash({ onReady }: { onReady?: () => void }) {
  return <View testID="stillwave-launch-splash" style={s.screen}>
    <StatusBar hidden />
    <View style={s.identity} accessible accessibilityLabel="StillWave">
      <Image source={require('../../assets/branding/stillwave-mark-v2.png')} style={s.mark} resizeMode="contain" onLoadEnd={onReady} />
      <Text style={s.name}>Still<Text style={s.wave}>Wave</Text></Text>
    </View>
    <View style={s.loading} accessibilityRole="progressbar" accessibilityLabel="Loading your library">
      <ActivityIndicator size="small" color="#8fd6c0" />
      <Text style={s.caption}>Loading your library</Text>
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0f10', alignItems: 'center', justifyContent: 'center' },
  identity: { alignItems: 'center', marginTop: -24 },
  mark: { width: 168, height: 168 },
  name: { color: '#e1e8e8', fontSize: 38, lineHeight: 48, fontWeight: '600', letterSpacing: -1.2, marginTop: -8 },
  wave: { color: '#8fd6c0' },
  loading: { position: 'absolute', bottom: 28, alignItems: 'center', gap: 10 },
  caption: { color: '#7f8f90', fontSize: 12, letterSpacing: .3 },
});
