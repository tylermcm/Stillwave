import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MobilePlayerControls, type MobileShortcut } from '../src/components/MobilePlayerControls';
function Preview() {
  const [paused, setPaused] = useState(true), [recording, setRecording] = useState(false), [progress, setProgress] = useState(.45);
  const [visible, setVisible] = useState(true), [message, setMessage] = useState('Simulated DVR state · UI layout check');
  const [cc, setCc] = useState(false), [speed, setSpeed] = useState(1);
  const fullscreen = new URLSearchParams(location.search).has('fullscreen');
  const touch = () => setVisible(true);
  const shortcuts: MobileShortcut[] = [
    { id:'rotate',label:'Rotation',icon:'phone-landscape-outline',run:()=>setMessage('Rotation action reached') },
    { id:'speed',label:`${speed}× Speed`,icon:'speedometer-outline',run:()=>setSpeed(s=>s===1?1.5:1) },
    { id:'pip',label:'PiP Play',icon:'browsers-outline',run:()=>{},disabled:true },
    { id:'audio',label:'Audio',icon:'headset-outline',run:()=>{},disabled:true },
    { id:'loop',label:'Loop',icon:'repeat',run:()=>{},disabled:true },
    { id:'live',label:'Go live',icon:'refresh',run:()=>setProgress(1) },
    { id:'record',label:recording?'Stop rec':'Record',icon:'radio-button-on',run:()=>setRecording(v=>!v),selected:recording },
    { id:'guide',label:'Guide',icon:'list-outline',run:()=>setMessage('Guide action reached') },
  ];
  return <View style={{ flex: 1, backgroundColor: '#091315', justifyContent: fullscreen ? 'flex-start' : 'center' }}>
    {!fullscreen && <Text style={{ color: '#a7eccb', padding: 16 }}>Mobile DVR controls · component preview</Text>}
    <View style={fullscreen ? { flex: 1 } : { minHeight: 224, aspectRatio: 16/9 }}>
      <video src="https://media.w3.org/2010/05/sintel/trailer.mp4" autoPlay muted loop style={{position:'absolute',width:'100%',height:'100%',objectFit:'cover'}} />
      <Text style={{position:'absolute',left:16,top:fullscreen?80:70,color:'#fff',fontSize:11}}>{message}</Text>
      <MobilePlayerControls title="DVR preview" number="1" programme="Simulated capture · not a broadcast" badge={paused ? 'PAUSED' : 'PLAYING'} fullscreen={fullscreen} paused={paused} failed={false} visible={visible} screenReader={false} opacity={new Animated.Value(visible ? 1 : 0)} dvr={{ duration: 1200, progress, delay: (1-progress)*1200, delayed: progress < .99 }}
        shortcuts={shortcuts} hasCc cc={cc} onCaptions={()=>setCc(v=>!v)} onAspectRatio={()=>setMessage('Aspect ratio action reached')} onPrevious={()=>setMessage('Previous channel reached')} onNext={()=>setMessage('Next channel reached')}
        onToggleControls={() => setVisible(v => !v)} onInteract={touch} onPause={() => setPaused(v => !v)} onSeek={n => setProgress(v => Math.max(0, Math.min(1, v+n/1200)))} onSeekFraction={setProgress} onGoLive={() => setProgress(1)} onOptions={() => setMessage('Options action reached')} onClose={() => setMessage('Close action reached')} />
    </View>
  </View>;
}
registerRootComponent(() => <SafeAreaProvider style={{ height: '100%' }}><Preview /></SafeAreaProvider>);
