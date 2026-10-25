import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; generation: number }> {
  state = { failed: false, generation: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return <View key={this.state.generation} style={{ flex: 1 }}>{this.props.children}</View>;
    return <View style={s.container}><Text style={s.title}>The app hit an error.</Text><Text style={s.body}>Something in the app’s interface stopped unexpectedly. This is an app failure; it does not tell us whether your channel is working.</Text><Pressable accessibilityRole="button" onPress={() => this.setState(previous => ({ failed: false, generation: previous.generation + 1 }))} style={s.button}><Text style={s.buttonText}>Reopen the app</Text></Pressable></View>;
  }
}
const s = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#091315', gap: 20 },
  title: { fontSize: 27, color: '#e0eee7', fontWeight: '600' }, body: { fontSize: 15, lineHeight: 25, color: '#a8bdb4' },
  button: { backgroundColor: '#a7eccb', borderRadius: 12, padding: 16, alignItems: 'center' }, buttonText: { color: '#09241b', fontWeight: '700' },
});
