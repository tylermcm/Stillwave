import { useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import type { Channel, Library } from '../../types';
import type { TvGuideRow } from '../../core/tvGuide';
import type { MobileInsets } from '../../core/mobileDashboard';
import type { LocalItem } from '../../core/localMedia';
import { homeModel, type HubDestination } from '../../core/mobileHub';
import { MobileNavigation } from '../tv/MobileNavigation';
import { MobileHome } from './MobileHome';
import { MobileDiscover } from './MobileDiscover';
import { MobileLocalMedia } from './MobileLocalMedia';
import { LocalPlayer } from './LocalPlayer';
import { MobileDashboard } from './MobileDashboard';
import { useDashboard } from './useDashboard';
import { useLocalMedia } from './useLocalMedia';
import { T } from '../../ui/theme';

/** Loads the dashboard only once it is opened, so Home never triggers network requests. */
function DashboardModule({ insets, now, onBack }: { insets: MobileInsets; now: number; onBack: () => void }) {
  const dash = useDashboard();
  return <MobileDashboard dash={dash} insets={insets} now={now} onBack={onBack} />;
}

/** Phone Home, Discover and its modules. Guide and My DVR stay on the guide canvas. */
export function MobileHub({ screen, rows, library, now, insets, busy, onDestination, onWatch, onFavorite, onSetup, onMenu }: {
  screen: 'home' | 'discover'; rows: TvGuideRow[]; library: Library; now: number; insets: MobileInsets; busy: string;
  onDestination: (destination: HubDestination) => void; onWatch: (channel: Channel) => void; onFavorite: (channel: Channel) => void; onSetup: () => void; onMenu?: () => void;
}) {
  const model = useMemo(() => homeModel(rows, library.favorites, library.recents, now, library.hiddenChannels), [rows, library.favorites, library.recents, library.hiddenChannels, now]);
  const media = useLocalMedia();
  // Modules open inside Discover; choosing any drawer destination leaves them.
  const [module, setModule] = useState<'local' | 'dashboard'>();
  const [playing, setPlaying] = useState<string>();
  const item: LocalItem | undefined = media.items.find(i => i.id === playing);
  const current = module ?? screen;
  useEffect(() => { setModule(undefined); setPlaying(undefined); }, [screen]);
  useEffect(() => {
    // The system Back button steps out of a module or player instead of leaving the app.
    if (!module || playing) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setModule(undefined); return true; });
    return () => back.remove();
  }, [module, playing]);

  if (item) return <LocalPlayer key={item.id} item={item} insets={insets} onClose={() => setPlaying(undefined)} onProgress={media.progress} onProblem={media.problem} onChooseAgain={() => void media.choose()} />;
  return <View style={s.root}>
    {current === 'home' ? <MobileHome model={model} now={now} insets={insets} busy={busy} favorites={library.favorites} onWatch={onWatch} onFavorite={onFavorite} onSetup={onSetup} />
      : current === 'dashboard' ? <DashboardModule insets={insets} now={now} onBack={() => setModule(undefined)} />
      : current === 'local' ? <MobileLocalMedia items={media.items} loaded={media.loaded} notice={media.notice} insets={insets} onBack={() => setModule(undefined)} onChoose={() => void media.choose()} onOpen={open => setPlaying(open.id)} onRemove={open => media.remove(open.id)} onClear={media.clear} />
      : <MobileDiscover insets={insets} onOpen={id => { if (id === 'local' || id === 'dashboard') setModule(id); }} />}
    <MobileNavigation screen={screen} onScreen={destination => { setModule(undefined); onDestination(destination); }} onMenu={onMenu} insets={insets} />
  </View>;
}
const s = StyleSheet.create({ root: { flex: 1, backgroundColor: T.ink } });
