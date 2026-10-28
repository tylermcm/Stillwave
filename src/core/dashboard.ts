import { SaxesParser } from 'saxes';

/**
 * Daily Dashboard: weather for a city the person chose, a short news briefing and the astronomy
 * picture of the day. All parsers treat the network as untrusted and return nothing, not garbage,
 * when a response is unusable.
 */
export type Units = 'imperial' | 'metric';
export interface City { name: string; region?: string; country?: string; lat: number; lon: number }
export type WeatherKind = 'clear' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export interface WeatherHour { time: string; label: string; temp: number; kind: WeatherKind; rain: number }
export interface WeatherDay { date: string; label: string; hi: number; lo: number; kind: WeatherKind }
export interface Weather {
  city: City; units: Units; temp: number; kind: WeatherKind; label: string; isDay: boolean;
  hi: number; lo: number; hours: WeatherHour[]; days: WeatherDay[]; sentence: string; fetchedAt: number;
}
export interface Picture { date: string; title: string; explanation: string; imageUrl: string; link: string }
export interface Headline { id: string; title: string; link: string; published?: number; summary?: string; image?: string }
export interface News { source: string; items: Headline[]; fetchedAt: number }

export const DEFAULT_FEED = 'https://feeds.npr.org/1001/rss.xml';
export const MAX_AGE = { weather: 30 * 60_000, news: 60 * 60_000, picture: 6 * 3_600_000 } as const;
export const isStale = (fetchedAt: number | undefined, now: number, maxAge: number) => fetchedAt === undefined || now - fetchedAt > maxAge;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/* ---------------- weather ---------------- */
export function weatherKind(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Clear' };
  if (code === 1 || code === 2) return { kind: 'partly', label: 'Partly cloudy' };
  if (code === 3) return { kind: 'cloud', label: 'Cloudy' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Foggy' };
  if (code >= 51 && code <= 57) return { kind: 'drizzle', label: 'Light rain' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Snow' };
  if (code >= 95 && code <= 99) return { kind: 'storm', label: 'Thunderstorms' };
  return { kind: 'cloud', label: 'Cloudy' };
}
const wet = (kind: WeatherKind) => kind === 'drizzle' || kind === 'rain' || kind === 'snow' || kind === 'storm';

export const geocodeUrl = (query: string) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`;
export function forecastUrl(city: City, units: Units) {
  const unit = units === 'imperial' ? '&temperature_unit=fahrenheit' : '';
  return `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min${unit}&timezone=auto&forecast_days=4`;
}

export function parseGeocoding(json: unknown): City[] {
  if (!isRecord(json) || !Array.isArray(json.results)) return [];
  const seen = new Set<string>();
  const cities: City[] = [];
  for (const raw of json.results) {
    if (!isRecord(raw) || typeof raw.name !== 'string' || !finite(raw.latitude) || !finite(raw.longitude)) continue;
    if (Math.abs(raw.latitude) > 90 || Math.abs(raw.longitude) > 180) continue;
    const city: City = { name: raw.name, region: typeof raw.admin1 === 'string' ? raw.admin1 : undefined, country: typeof raw.country === 'string' ? raw.country : undefined, lat: raw.latitude, lon: raw.longitude };
    const key = `${city.name}|${city.region}|${city.country}`;
    if (!seen.has(key)) { seen.add(key); cities.push(city); }
  }
  return cities;
}
export const cityLabel = (city: City) => [city.name, city.region].filter(Boolean).join(', ');

/** Local hour label from an Open-Meteo local timestamp such as `2026-10-28T21:00`. */
export function hourLabel(time: string): string {
  const hour = Number(time.slice(11, 13));
  if (!Number.isFinite(hour)) return '';
  return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
}
const dayLabel = (date: string, index: number) => index === 0 ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T12:00:00Z`).getUTCDay()] ?? date;

function describeTemperature(temp: number, units: Units): string {
  const c = units === 'imperial' ? (temp - 32) * 5 / 9 : temp;
  return c < 0 ? 'freezing' : c < 8 ? 'cold' : c < 15 ? 'cool' : c < 22 ? 'mild' : c < 28 ? 'warm' : 'hot';
}

/** One calm sentence: conditions now, where the temperature is heading, and when the weather changes. */
export function weatherSentence(args: { kind: WeatherKind; label: string; isDay: boolean; temp: number; units: Units; hours: readonly WeatherHour[] }): string {
  const { kind, label, isDay, temp, units, hours } = args;
  const lead = kind === 'partly' ? `${label} and ${describeTemperature(temp, units)}` : `${label} and ${describeTemperature(temp, units)}`;
  const parts = [`${lead} ${isDay ? 'today' : 'tonight'}`];
  const next12 = hours.slice(0, 12);
  const coldest = next12.reduce<WeatherHour | undefined>((low, h) => !low || h.temp < low.temp ? h : low, undefined);
  if (coldest && temp - coldest.temp >= 3) parts[0] += `, ${Math.round(coldest.temp)}° by ${coldest.label === '12 AM' ? 'midnight' : coldest.label}`;
  let sentence = `${parts[0]}.`;
  const change = hours.slice(0, 24).find(h => wet(h.kind) || h.rain >= 50);
  if (!wet(kind) && change) sentence += ` ${change.kind === 'snow' ? 'Snow' : 'Rain'} arrives after ${change.label}.`;
  else if (wet(kind)) {
    const dry = hours.slice(0, 24).find(h => !wet(h.kind) && h.rain < 30);
    if (dry) sentence += ` Clearing after ${dry.label}.`;
  }
  return sentence;
}

export function parseForecast(json: unknown, city: City, units: Units, fetchedAt: number): Weather | undefined {
  if (!isRecord(json) || !isRecord(json.current) || !isRecord(json.hourly) || !isRecord(json.daily)) return undefined;
  const { current, hourly, daily } = json;
  const times = hourly.time, temps = hourly.temperature_2m, codes = hourly.weather_code, rain = hourly.precipitation_probability;
  if (typeof current.time !== 'string' || !finite(current.temperature_2m) || !finite(current.weather_code)) return undefined;
  if (!Array.isArray(times) || !Array.isArray(temps) || !Array.isArray(codes)) return undefined;
  const from = times.findIndex(t => typeof t === 'string' && t >= (current.time as string).slice(0, 13));
  if (from < 0) return undefined;
  const hours: WeatherHour[] = [];
  for (let i = from + 1; i < times.length && hours.length < 36; i++) {
    const time = times[i], temp = temps[i], code = codes[i];
    if (typeof time !== 'string' || !finite(temp) || !finite(code)) continue;
    const probability = Array.isArray(rain) && finite(rain[i]) ? rain[i] as number : 0;
    hours.push({ time, label: hourLabel(time), temp, kind: weatherKind(code).kind, rain: probability });
  }
  const dates = daily.time, highs = daily.temperature_2m_max, lows = daily.temperature_2m_min, dailyCodes = daily.weather_code;
  if (!Array.isArray(dates) || !Array.isArray(highs) || !Array.isArray(lows) || !Array.isArray(dailyCodes) || !finite(highs[0]) || !finite(lows[0])) return undefined;
  const days: WeatherDay[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (typeof dates[i] !== 'string' || !finite(highs[i]) || !finite(lows[i]) || !finite(dailyCodes[i])) continue;
    days.push({ date: dates[i] as string, label: dayLabel(dates[i] as string, i), hi: highs[i] as number, lo: lows[i] as number, kind: weatherKind(dailyCodes[i] as number).kind });
  }
  const now = weatherKind(current.weather_code);
  const isDay = current.is_day !== 0;
  const temp = current.temperature_2m;
  return { city, units, temp, kind: now.kind, label: now.label, isDay, hi: highs[0] as number, lo: lows[0] as number,
    hours: hours.filter((_, i) => i % 2 === 1).slice(0, 6), days: days.slice(1), fetchedAt,
    sentence: weatherSentence({ kind: now.kind, label: now.label, isDay, temp, units, hours }) };
}

/* ---------------- news ---------------- */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Feed text may carry markup and entities; keep plain text only. */
export function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') { const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10); return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' '; }
    return ENTITIES[entity.toLowerCase()] ?? match;
  }).replace(/\s+/g, ' ').trim();
}
export function parseRss(xml: string, limit = 12): { source: string; items: Headline[] } {
  const parser = new SaxesParser({ xmlns: false });
  const stack: string[] = [];
  let source = '';
  let item: Partial<Record<'title' | 'link' | 'pubDate' | 'description' | 'guid' | 'image', string>> | undefined;
  const items: Headline[] = [];
  let text = '';
  parser.on('opentag', tag => {
    stack.push(tag.name); text = '';
    if (tag.name === 'item' || tag.name === 'entry') item = {};
    else if (tag.name === 'enclosure' && item) { const url = String(tag.attributes.url ?? ''), type = String(tag.attributes.type ?? ''); if (/^https:\/\//.test(url) && type.startsWith('image/')) item.image = url; }
  });
  parser.on('text', t => { text += t; });
  parser.on('cdata', t => { text += t; });
  parser.on('closetag', tag => {
    const name = tag.name; stack.pop();
    const parent = stack[stack.length - 1];
    if (name === 'item' || name === 'entry') {
      const title = plainText(item?.title ?? ''), link = (item?.link ?? '').trim();
      if (title && /^https?:\/\//.test(link) && items.length < limit) {
        const published = item?.pubDate ? Date.parse(item.pubDate) : NaN;
        items.push({ id: item?.guid?.trim() || link, title, link, published: Number.isFinite(published) ? published : undefined, summary: item?.description ? plainText(item.description).slice(0, 400) || undefined : undefined, image: item?.image });
      }
      item = undefined;
    } else if (item && parent && (parent === 'item' || parent === 'entry') && (name === 'title' || name === 'link' || name === 'pubDate' || name === 'description' || name === 'guid')) item[name] = text;
    else if (!item && !source && name === 'title' && parent === 'channel') source = plainText(text);
    text = '';
  });
  try { parser.write(xml).close(); } catch { /* A truncated feed still yields the items read so far. */ }
  return { source, items };
}

/* ---------------- NASA Image of the Day ---------------- */
export const PICTURE_URL = 'https://www.nasa.gov/feeds/iotd-feed/';
/** NASA publishes originals of ~20 MB. Its image host serves a resized copy for the same address. */
export function sizedImage(url: string): string {
  try { const u = new URL(url); return u.hostname.endsWith('nasa.gov') && !u.search ? `${url}?resize=800,450` : url; } catch { return url; }
}
/** The newest story that has a picture, a title and a real description. */
export function parseImageOfDay(xml: string): Picture | undefined {
  const entry = parseRss(xml, 10).items.find(item => item.image && item.summary && item.summary.length >= 20);
  if (!entry?.image) return undefined;
  return { date: entry.published ? new Date(entry.published).toISOString().slice(0, 10) : '', title: entry.title, explanation: entry.summary!, imageUrl: sizedImage(entry.image), link: entry.link };
}

export function timeAgo(then: number | undefined, now: number): string {
  if (then === undefined || !Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/* ---------------- stored settings and cache ---------------- */
export interface DashboardStore { city?: City; units: Units; weather?: Weather; news?: News; picture?: { picture: Picture; fetchedAt: number } }
export const EMPTY_STORE: DashboardStore = { units: 'imperial' };
export function parseStore(text: string | null | undefined): DashboardStore {
  if (!text) return { ...EMPTY_STORE };
  try {
    const data = JSON.parse(text) as Partial<DashboardStore>;
    if (!isRecord(data)) return { ...EMPTY_STORE };
    const city = isRecord(data.city) && typeof data.city.name === 'string' && finite(data.city.lat) && finite(data.city.lon) ? data.city as City : undefined;
    return {
      city, units: data.units === 'metric' ? 'metric' : 'imperial',
      weather: city && isRecord(data.weather) && isRecord(data.weather.city) && data.weather.city.name === city.name && finite(data.weather.temp) && Array.isArray(data.weather.hours) ? data.weather as Weather : undefined,
      news: isRecord(data.news) && Array.isArray(data.news.items) && typeof data.news.source === 'string' ? data.news as News : undefined,
      picture: isRecord(data.picture) && isRecord(data.picture.picture) && typeof data.picture.picture.title === 'string' && typeof data.picture.picture.imageUrl === 'string' && finite(data.picture.fetchedAt) ? data.picture as DashboardStore['picture'] : undefined,
    };
  } catch { return { ...EMPTY_STORE }; }
}
