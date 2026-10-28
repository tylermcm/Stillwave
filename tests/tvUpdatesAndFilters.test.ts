import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAppRelease, githubAppRelease, installLatestAppRelease, newerVersion, RELEASE_API } from '../src/core/appUpdates';
import { browseChannelRows, channelCategories, channelHiddenKey, filterTvRows, isChannelHidden, toggleHiddenChannel } from '../src/core/channelBrowsing';
import { addPlaylist, restoreLibrary } from '../src/core/playlists';
import { completeTvSetup } from '../src/core/tvDefaults';
import { EMPTY_LIBRARY, type Channel } from '../src/types';

const channel: Channel = { id: 'p:old', sourceId: 'old', playlistId: 'p', tvgId: 'Station.us@East', name: 'Station', group: 'Sports;News', number: '10', kind: 'hls', url: 'https://example.org/one.m3u8', headers: {} };
const release = (overrides = {}) => ({ tag_name: 'v0.4.7', draft: false, prerelease: false, assets: [{ name: 'Stillwave-FireTV-0.4.7.apk', browser_download_url: 'https://github.com/tylermcm/Stillwave/releases/download/v0.4.7/Stillwave-FireTV-0.4.7.apk', size: 40000000, digest: 'sha256:' + 'a'.repeat(64) }], ...overrides });

test('install refreshes an old offer and skips directly to the newest stable release', async () => {
  const data = (version: string) => release({ tag_name: `v${version}`, assets: [
    { ...release().assets[0], name: `Stillwave-${version}.apk`, browser_download_url: `https://github.com/tylermcm/Stillwave/releases/download/v${version}/Stillwave-${version}.apk` },
    { ...release().assets[0], name: `Stillwave-FireTV-${version}.apk`, browser_download_url: `https://github.com/tylermcm/Stillwave/releases/download/v${version}/Stillwave-FireTV-${version}.apk` },
  ] });
  for (const television of [false, true]) {
    let calls = 0;
    const request: typeof fetch = async (url, options) => {
      assert.equal(new URL(String(url)).origin + new URL(String(url)).pathname, RELEASE_API);
      assert.ok(new URL(String(url)).searchParams.has('check'));
      assert.equal(options?.cache, 'no-store');
      assert.equal((options?.headers as Record<string, string>)['Cache-Control'], 'no-cache');
      return Response.json(data(++calls === 1 ? '0.4.9' : '0.4.10'));
    };
    const check = () => fetchAppRelease('0.4.8', television, request);
    assert.equal((await check()).release?.version, '0.4.9');
    const downloaded: string[] = [];
    const latest = await installLatestAppRelease(check, async (url, digest) => {
      downloaded.push(url); assert.equal(digest, 'a'.repeat(64)); return 'installer';
    });
    assert.equal(latest.release?.version, '0.4.10');
    assert.equal(calls, 2);
    assert.deepEqual(downloaded, [`https://github.com/tylermcm/Stillwave/releases/download/v0.4.10/Stillwave-${television ? 'FireTV-' : ''}0.4.10.apk`]);
  }
});

test('install never falls back to an old offer when a fresh check fails or finds no update', async () => {
  let installs = 0;
  const install = async () => { installs++; return 'installer'; };
  await assert.rejects(installLatestAppRelease(() => fetchAppRelease('0.4.8', false, async () => new Response('', { status: 503 })), install), /503/);
  const current = await installLatestAppRelease(() => fetchAppRelease('0.4.7', false, async () => Response.json(release())), install);
  assert.equal(current.result, 'current');
  assert.equal(current.release, undefined);
  assert.equal(installs, 0);
});

test('release updater chooses the TV APK, compares numeric versions and rejects previews, stale builds and external assets', () => {
  assert.equal(githubAppRelease(release(), '0.4.6')?.version, '0.4.7');
  assert.equal(githubAppRelease(release(), '0.4.7'), undefined);
  assert.equal(githubAppRelease(release({ draft: true }), '0.4.6'), undefined);
  assert.equal(githubAppRelease(release({ prerelease: true }), '0.4.6'), undefined);
  assert.ok(newerVersion('0.10.0', '0.9.9'));
  assert.equal(newerVersion('0.4.8-beta', '0.4.6'), false);
  for (const url of ['https://evil.example/update.apk', 'http://github.com/tylermcm/Stillwave/releases/download/v0.4.7/update.apk', 'https://github.com/tylermcm/Stillwave/releases/download/../../other.apk']) {
    assert.equal(githubAppRelease(release({ assets: [{ ...release().assets[0], browser_download_url: url }] }), '0.4.6'), undefined);
  }
  assert.equal(githubAppRelease(release({ assets: [{ ...release().assets[0], digest: 'sha256:bad' }] }), '0.4.6'), undefined);
  assert.equal(githubAppRelease(release({ assets: [{ ...release().assets[0], size: 999999999 }] }), '0.4.6'), undefined);
});

test('phones prefer the universal APK while televisions prefer the Fire TV APK', () => {
  const universal = { ...release().assets[0]!, name: 'Stillwave-0.4.7.apk', browser_download_url: 'https://github.com/tylermcm/Stillwave/releases/download/v0.4.7/Stillwave-0.4.7.apk' };
  const data = release({ assets: [...release().assets, universal] });
  assert.equal(githubAppRelease(data, '0.4.6', false)?.url, universal.browser_download_url);
  assert.equal(githubAppRelease(data, '0.4.6', true)?.url, release().assets[0]!.browser_download_url);
});

test('hidden stations survive restart and changing stream URLs, stay scoped to their playlist and preserve saved preferences during imports', () => {
  const hiddenChannels = toggleHiddenChannel([], channel);
  const library = restoreLibrary({ ...EMPTY_LIBRARY, channels: [channel], playlists: [{ id: 'p', name: 'P' }], hiddenChannels });
  assert.ok(isChannelHidden(library.channels[0]!, library.hiddenChannels));
  const refreshed = addPlaylist(library, { channels: [{ ...channel, id: 'new', url: 'https://example.org/changed.m3u8' }], guideUrls: [], warnings: [] }, { id: 'p', name: 'P' });
  assert.ok(isChannelHidden(refreshed.channels[0]!, refreshed.hiddenChannels));
  assert.equal(isChannelHidden({ ...channel, playlistId: 'other' }, hiddenChannels), false);
  assert.deepEqual(toggleHiddenChannel(hiddenChannels, channel), []);
  assert.deepEqual(completeTvSetup({ ...library, hiddenChannels: [] }, library).hiddenChannels, hiddenChannels);
  assert.equal(channelHiddenKey(channel), channelHiddenKey({ ...channel, url: 'https://example.org/other.m3u8' }));
});

test('category and title search combine with guide/favorite filters and hidden channels remain restorable', () => {
  const now = 100;
  const rows = [{ channel, number: '10', programmes: [{ channelId: 'g', title: 'NBA live', start: 90, stop: 200 }] },
    { channel: { ...channel, id: 'two', tvgId: 'Other.us', name: 'Other', group: 'Movies' }, number: '11', programmes: [] }];
  assert.deepEqual(channelCategories(rows), ['Movies', 'News', 'Sports']);
  assert.deepEqual(filterTvRows(rows, 'nba', 'Sports', now).map(r => r.channel.id), [channel.id]);
  assert.equal(filterTvRows(rows, 'nba', 'Movies', now).length, 0);
  assert.equal(filterTvRows(rows, 'nba', 'all', 200).length, 0);
  assert.equal(filterTvRows(rows, '11', 'all', now)[0]?.channel.id, 'two');
  const hidden = [channelHiddenKey(channel)];
  assert.deepEqual(browseChannelRows(rows, 'all', [], now, hidden).map(r => r.channel.id), ['two']);
  assert.equal(browseChannelRows(rows, 'favorites', [channel.id], now, hidden).length, 0);
  assert.equal(browseChannelRows(rows, 'hidden', [], now, hidden)[0]?.channel.id, channel.id);
});
