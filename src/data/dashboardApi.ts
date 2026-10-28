import { DEFAULT_FEED, PICTURE_URL, forecastUrl, geocodeUrl, parseForecast, parseGeocoding, parseImageOfDay, parseRss, type City, type News, type Picture, type Units, type Weather } from '../core/dashboard';

const TIMEOUT_MS = 12_000;
const MAX_FEED_CHARS = 2_000_000;

async function get(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`The service answered with an error (${response.status}).`);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The service took too long to answer.');
    if (error instanceof Error && /^The service/.test(error.message)) throw error;
    throw new Error('Couldn’t reach the service. Check your connection.');
  } finally { clearTimeout(timer); }
}

/** Cities come from the public Open-Meteo geocoder; the person picks one, nothing uses device location. */
export async function searchCities(query: string): Promise<City[]> {
  if (query.trim().length < 2) return [];
  return parseGeocoding(await (await get(geocodeUrl(query))).json());
}
export async function fetchWeather(city: City, units: Units): Promise<Weather> {
  const weather = parseForecast(await (await get(forecastUrl(city, units))).json(), city, units, Date.now());
  if (!weather) throw new Error('The forecast could not be read.');
  return weather;
}
export async function fetchPicture(): Promise<Picture> {
  const text = await (await get(PICTURE_URL)).text();
  if (text.length > MAX_FEED_CHARS) throw new Error('The picture feed is too large.');
  const picture = parseImageOfDay(text);
  if (!picture) throw new Error('Today’s picture is not available.');
  return picture;
}
export async function fetchNews(url = DEFAULT_FEED): Promise<News> {
  const text = await (await get(url)).text();
  if (text.length > MAX_FEED_CHARS) throw new Error('The news feed is too large.');
  const feed = parseRss(text);
  if (!feed.items.length) throw new Error('The news feed had no readable stories.');
  return { source: feed.source || 'News', items: feed.items, fetchedAt: Date.now() };
}
