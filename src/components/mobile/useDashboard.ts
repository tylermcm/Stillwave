import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FEED, EMPTY_STORE, MAX_AGE, isStale, type City, type DashboardStore, type Units } from '../../core/dashboard';
import { fetchNews, fetchPicture, fetchWeather } from '../../data/dashboardApi';
import { loadDashboardStore, saveDashboardStore } from '../../data/dashboardStore';

export type Part = 'weather' | 'news' | 'picture';
export interface PartState { loading: boolean; error?: string }
const IDLE: Record<Part, PartState> = { weather: { loading: false }, news: { loading: false }, picture: { loading: false } };

/** Shows saved data immediately, then refreshes whatever is stale. A failed refresh never discards saved data. */
export function useDashboard() {
  const [store, setStore] = useState<DashboardStore>(EMPTY_STORE);
  const [loaded, setLoaded] = useState(false);
  const [parts, setParts] = useState(IDLE);
  const latest = useRef<DashboardStore>(EMPTY_STORE);
  const requests = useRef<Record<Part, number>>({ weather: 0, news: 0, picture: 0 });
  const commit = useCallback((change: (previous: DashboardStore) => DashboardStore) => {
    const next = change(latest.current);
    latest.current = next; setStore(next);
    void saveDashboardStore(next).catch(() => undefined);
  }, []);
  const mark = useCallback((part: Part, state: PartState) => setParts(previous => ({ ...previous, [part]: state })), []);

  const refresh = useCallback(async (part: Part) => {
    const request = ++requests.current[part];
    const current = latest.current;
    if (part === 'weather' && !current.city) return;
    mark(part, { loading: true });
    try {
      if (part === 'weather') {
        const weather = await fetchWeather(current.city!, current.units);
        if (request !== requests.current.weather || latest.current.city?.name !== current.city!.name || latest.current.units !== current.units) return;
        commit(previous => ({ ...previous, weather }));
      } else if (part === 'news') {
        const news = await fetchNews(DEFAULT_FEED);
        if (request !== requests.current.news) return;
        commit(previous => ({ ...previous, news }));
      } else {
        const picture = await fetchPicture();
        if (request !== requests.current.picture) return;
        commit(previous => ({ ...previous, picture: { picture, fetchedAt: Date.now() } }));
      }
      if (request === requests.current[part]) mark(part, { loading: false });
    } catch (error) {
      if (request === requests.current[part]) mark(part, { loading: false, error: error instanceof Error ? error.message : 'Could not refresh.' });
    }
  }, [commit, mark]);

  const refreshStale = useCallback(() => {
    const now = Date.now(), s = latest.current;
    if (s.city && isStale(s.weather?.fetchedAt, now, MAX_AGE.weather)) void refresh('weather');
    if (isStale(s.news?.fetchedAt, now, MAX_AGE.news)) void refresh('news');
    if (isStale(s.picture?.fetchedAt, now, MAX_AGE.picture)) void refresh('picture');
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    loadDashboardStore().then(saved => { if (!mounted) return; latest.current = saved; setStore(saved); }).catch(() => undefined)
      .finally(() => { if (!mounted) return; setLoaded(true); refreshStale(); });
    return () => { mounted = false; };
  }, [refreshStale]);

  const setCity = useCallback((city: City) => {
    commit(previous => ({ ...previous, city, weather: undefined }));
    void refresh('weather');
  }, [commit, refresh]);
  const setUnits = useCallback((units: Units) => {
    if (latest.current.units === units) return;
    commit(previous => ({ ...previous, units, weather: undefined }));
    void refresh('weather');
  }, [commit, refresh]);
  const refreshAll = useCallback(() => { void refresh('weather'); void refresh('news'); void refresh('picture'); }, [refresh]);
  return { store, loaded, parts, setCity, setUnits, refreshAll };
}
