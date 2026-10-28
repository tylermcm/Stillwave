import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { sleepDeadline } from '../core/preferences';
import { TvKeysSuspended } from '../data/tv';
import { OptionsPanel } from './tv/OptionsPanel';

type SleepControl = { label: string; menuOpen: boolean; open: (programmeEnd?: number) => void; register: (stop: () => void) => () => void };
const SleepContext = createContext<SleepControl>({ label: 'Sleep timer · Off', menuOpen: false, open: () => {}, register: () => () => {} });
export const useSleepTimer = () => useContext(SleepContext);
export function useSleepPlayback(stop: () => void) {
  const sleep = useSleepTimer(), latest = useRef(stop); latest.current = stop;
  useEffect(() => sleep.register(() => latest.current()), [sleep.register]);
  return sleep;
}
export function SleepTimerProvider({ children }: { children: ReactNode }) {
  const [deadline, setDeadline] = useState<number>();
  const [now, setNow] = useState(Date.now());
  const [choosing, setChoosing] = useState<{ programmeEnd?: number }>();
  const stoppers = useRef(new Set<() => void>());
  const register = useCallback((stop: () => void) => { stoppers.current.add(stop); return () => { stoppers.current.delete(stop); }; }, []);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const time = Date.now(); setNow(time);
      if (time >= deadline) { setDeadline(undefined); setChoosing(undefined); for (const stop of stoppers.current) stop(); }
    };
    tick(); const timer = setInterval(tick, 1000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); app.remove(); };
  }, [deadline]);
  const label = deadline ? `Sleep timer · ${Math.max(1, Math.ceil((deadline - now) / 60_000))} min left` : 'Sleep timer · Off';
  const set = (minutes: number | 'programme') => { setNow(Date.now()); setDeadline(sleepDeadline(minutes, Date.now(), choosing?.programmeEnd)); setChoosing(undefined); };
  return <SleepContext.Provider value={{ label, menuOpen: !!choosing, open: programmeEnd => setChoosing({ programmeEnd }), register }}>
    <TvKeysSuspended.Provider value={!!choosing}>{children}</TvKeysSuspended.Provider>
    {choosing && <OptionsPanel title="Sleep timer" description="Stop playback after a timer or at the end of this show. Active recordings continue. The timer stays set when you change channels." onClose={() => setChoosing(undefined)} actions={[
      ...[15, 30, 60].map(minutes => ({ label: `Stop after ${minutes} minutes`, run: () => set(minutes) })),
      { label: 'Stop at the end of this show', disabled: !choosing.programmeEnd || choosing.programmeEnd <= Date.now(), run: () => set('programme') },
      { label: 'Turn sleep timer off', run: () => { setDeadline(undefined); setChoosing(undefined); } },
    ]} />}
  </SleepContext.Provider>;
}
