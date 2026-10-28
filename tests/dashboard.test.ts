import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_STORE, MAX_AGE, hourLabel, isStale, parseForecast, parseGeocoding, parseImageOfDay, parseRss, sizedImage, parseStore, plainText, timeAgo, weatherKind, weatherSentence, type City } from '../src/core/dashboard';

const city: City = { name: 'Seaview', region: 'Washington', country: 'United States', lat: 47.6, lon: -122.3 };

/** Three days of hourly data from midnight on the 28th; clear overnight, rain from 6 AM on the 29th. */
function forecast(overrides: { current?: Record<string, unknown> } = {}) {
  const time: string[] = [], temp: number[] = [], code: number[] = [], rain: number[] = [];
  for (let i = 0; i < 72; i++) {
    const day = 28 + Math.floor(i / 24), hour = i % 24;
    time.push(`2026-10-${day}T${String(hour).padStart(2, '0')}:00`);
    temp.push(i < 20 ? 52 : i <= 29 ? 49 - (i - 20) : 41 + (i - 29));
    const raining = i >= 30 && i < 40;
    code.push(raining ? 61 : 0); rain.push(raining ? 80 : 5);
  }
  return {
    current: { time: '2026-10-28T20:00', temperature_2m: 49, weather_code: 0, is_day: 0, ...overrides.current },
    hourly: { time, temperature_2m: temp, weather_code: code, precipitation_probability: rain },
    daily: { time: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'], temperature_2m_max: [55, 52, 54, 56], temperature_2m_min: [40, 41, 42, 43], weather_code: [0, 61, 3, 1] },
  };
}

test('weather codes map to calm, honest labels', () => {
  assert.deepEqual(weatherKind(0), { kind: 'clear', label: 'Clear' });
  assert.equal(weatherKind(2).kind, 'partly');
  assert.equal(weatherKind(63).kind, 'rain');
  assert.equal(weatherKind(81).kind, 'rain');
  assert.equal(weatherKind(73).kind, 'snow');
  assert.equal(weatherKind(96).kind, 'storm');
  assert.equal(weatherKind(999).kind, 'cloud');
});

test('a forecast becomes a headline sentence, an hourly strip and upcoming days', () => {
  const weather = parseForecast(forecast(), city, 'imperial', 1000)!;
  assert.equal(weather.temp, 49);
  assert.equal(weather.hi, 55); assert.equal(weather.lo, 40);
  assert.equal(weather.sentence, 'Clear and cool tonight, 40° by 5 AM. Rain arrives after 6 AM.');
  assert.deepEqual(weather.hours.map(h => h.label), ['10 PM', '12 AM', '2 AM', '4 AM', '6 AM', '8 AM']);
  assert.deepEqual(weather.days.map(d => d.label), ['Thu', 'Fri', 'Sat']);
  assert.equal(weather.fetchedAt, 1000);
});

test('the sentence handles rain that is already falling, daytime and metric units', () => {
  const hours = (kinds: ('rain' | 'clear')[], temp = 12) => kinds.map((kind, i) => ({ time: `2026-10-28T${String(10 + i).padStart(2, '0')}:00`, label: hourLabel(`2026-10-28T${String(10 + i).padStart(2, '0')}:00`), temp, kind, rain: kind === 'rain' ? 80 : 0 }));
  assert.equal(weatherSentence({ kind: 'rain', label: 'Rain', isDay: true, temp: 12, units: 'metric', hours: hours(['rain', 'rain', 'clear']) }), 'Rain and cool today. Clearing after 12 PM.');
  assert.equal(weatherSentence({ kind: 'clear', label: 'Clear', isDay: true, temp: 30, units: 'metric', hours: hours(['clear', 'clear'], 30) }), 'Clear and hot today.');
  assert.equal(weatherSentence({ kind: 'clear', label: 'Clear', isDay: false, temp: -3, units: 'metric', hours: [] }), 'Clear and freezing tonight.');
});

test('unusable forecasts are rejected instead of half-rendered', () => {
  assert.equal(parseForecast(null, city, 'metric', 0), undefined);
  assert.equal(parseForecast({}, city, 'metric', 0), undefined);
  assert.equal(parseForecast(forecast({ current: { temperature_2m: 'warm' } }), city, 'metric', 0), undefined);
  assert.equal(parseForecast({ ...forecast(), daily: { time: [] } }, city, 'metric', 0), undefined);
  assert.equal(parseForecast(forecast({ current: { time: '2030-01-01T00:00' } }), city, 'metric', 0), undefined);
});

test('city search results are validated and de-duplicated', () => {
  const cities = parseGeocoding({ results: [
    { name: 'Seattle', latitude: 47.6, longitude: -122.3, admin1: 'Washington', country: 'United States' },
    { name: 'Seattle', latitude: 47.61, longitude: -122.33, admin1: 'Washington', country: 'United States' },
    { name: 'Nowhere', latitude: 200, longitude: 0 }, { name: 4, latitude: 1, longitude: 1 }, null,
  ] });
  assert.deepEqual(cities.map(c => c.name), ['Seattle']);
  assert.deepEqual(parseGeocoding({}), []);
  assert.deepEqual(parseGeocoding('nope'), []);
});

test('NASA Image of the Day picks the newest story with a picture and description, resized for phones', () => {
  const feed = (items: string) => `<rss><channel><title>NASA Image of the Day</title>${items}</channel></rss>`;
  const item = (title: string, enclosure: string, description = 'A turbulent cauldron of star formation seen by a space telescope.') => `<item><title>${title}</title><link>https://www.nasa.gov/image-detail/x/</link><description>${description}</description>${enclosure}<pubDate>Wed, 28 Oct 2026 15:35 GMT</pubDate></item>`;
  const jpg = '<enclosure url="https://www.nasa.gov/wp-content/uploads/2026/10/a.jpg" length="19834160" type="image/jpeg" />';
  const picture = parseImageOfDay(feed(item('No picture', '') + item('Webb Sees Turbulent Star Nursery', jpg)))!;
  assert.equal(picture.title, 'Webb Sees Turbulent Star Nursery');
  assert.equal(picture.imageUrl, 'https://www.nasa.gov/wp-content/uploads/2026/10/a.jpg?resize=800,450');
  assert.equal(picture.date, '2026-10-28');
  assert.equal(picture.link, 'https://www.nasa.gov/image-detail/x/');
  assert.equal(parseImageOfDay(feed(item('Insecure', '<enclosure url="http://nasa.gov/a.jpg" type="image/jpeg" />'))), undefined);
  assert.equal(parseImageOfDay(feed(item('Video', '<enclosure url="https://nasa.gov/a.mp4" type="video/mp4" />'))), undefined);
  assert.equal(parseImageOfDay(feed(item('Thin', jpg, 'Short.'))), undefined);
  assert.equal(parseImageOfDay('<broken'), undefined);
  assert.equal(sizedImage('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(sizedImage('https://www.nasa.gov/a.jpg?w=10'), 'https://www.nasa.gov/a.jpg?w=10');
});

test('RSS items are cleaned of markup and entities, capped, and must have web links', () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Sample &amp; News</title>
    <item><title><![CDATA[Council approves <b>park</b> plan]]></title><link>https://example.test/a</link><pubDate>Wed, 28 Oct 2026 14:00:00 GMT</pubDate><description>&lt;p&gt;Votes 7&amp;#8211;2.&lt;/p&gt;</description><guid>a1</guid></item>
    <item><title>No link</title><link>/relative</link></item>
    <item><title>Second</title><link>https://example.test/b</link></item>
    <item><title>Third</title><link>https://example.test/c</link></item></channel></rss>`;
  const feed = parseRss(xml, 2);
  assert.equal(feed.source, 'Sample & News');
  assert.deepEqual(feed.items.map(i => i.title), ['Council approves park plan', 'Second']);
  assert.equal(feed.items[0]!.id, 'a1');
  assert.equal(feed.items[0]!.published, Date.parse('Wed, 28 Oct 2026 14:00:00 GMT'));
  assert.equal(feed.items[0]!.summary, 'Votes 7–2.');
  assert.deepEqual(parseRss('<not-xml').items, []);
  assert.equal(plainText('Fish &amp; <i>chips</i>&nbsp;&#x41;'), 'Fish & chips A');
});

test('freshness and relative times read naturally', () => {
  assert.equal(isStale(undefined, 100, MAX_AGE.weather), true);
  assert.equal(isStale(0, MAX_AGE.weather, MAX_AGE.weather), false);
  assert.equal(isStale(0, MAX_AGE.weather + 1, MAX_AGE.weather), true);
  const now = 10 * 3_600_000;
  assert.equal(timeAgo(now - 20_000, now), 'Just now');
  assert.equal(timeAgo(now - 12 * 60_000, now), '12 min ago');
  assert.equal(timeAgo(now - 2 * 3_600_000, now), '2 h ago');
  assert.equal(timeAgo(now - 50 * 3_600_000, now), '2 d ago');
  assert.equal(timeAgo(undefined, now), '');
});

test('the stored dashboard survives garbage and drops a forecast for a different city', () => {
  assert.deepEqual(parseStore(undefined), EMPTY_STORE);
  assert.deepEqual(parseStore('not json'), EMPTY_STORE);
  assert.deepEqual(parseStore('[1]'), EMPTY_STORE);
  const weather = parseForecast(forecast(), city, 'imperial', 5)!;
  const kept = parseStore(JSON.stringify({ city, units: 'metric', weather }));
  assert.equal(kept.units, 'metric'); assert.equal(kept.weather?.temp, 49);
  const other = parseStore(JSON.stringify({ city: { ...city, name: 'Elsewhere' }, weather }));
  assert.equal(other.weather, undefined);
  assert.equal(parseStore(JSON.stringify({ city: { name: 'x' } })).city, undefined);
});
