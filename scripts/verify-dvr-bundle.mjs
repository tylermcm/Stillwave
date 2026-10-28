import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const map = JSON.parse(fs.readFileSync('android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map', 'utf8'));
const flatten = entry => entry.sections ? entry.sections.flatMap(section => flatten(section.map)) : [entry];
const maps = flatten(map);
assert.ok(!maps.some(part => part.sources?.some(source => /\/tests\/[^/]*preview\.tsx$/.test(source.replaceAll('\\', '/')))), 'UI preview harnesses must not be bundled in the app.');
const version = process.argv[2] || JSON.parse(fs.readFileSync('app.json', 'utf8')).expo.version;
const tvFiles = ['src/components/tv/TvDashboard.tsx', 'src/components/tv/TvDvrShell.tsx', 'src/components/tv/MobileNavigation.tsx', 'src/components/tv/MobileGuideActions.tsx', 'src/core/mobileDashboard.ts', 'src/core/mobilePlayback.ts', 'src/components/tv/TvRecordingPlayer.tsx', 'src/core/tvGuide.ts', 'src/core/tvDvr.ts', 'src/core/tvDefaults.ts', 'src/core/xmltv.ts', 'src/data/tv.ts', 'src/data/recordingPlanner.ts'];
const files = ['App.tsx', 'src/components/LaunchSplash.tsx', 'src/components/tv/TouchTvList.tsx', 'src/components/tv/TvPlayerControls.tsx', 'src/core/tvNavigation.ts', 'src/components/LivePlayer.tsx', 'src/components/MobilePlayerControls.tsx', 'src/components/tv/ChannelNumberPad.tsx', 'src/core/channelBrowsing.ts', 'src/core/channelNumbers.ts', 'src/core/history.ts', 'src/components/Recordings.tsx', 'src/components/useDvrSession.ts', 'src/components/useAndroidFullscreen.ts', 'src/core/dvr.ts', 'src/data/dvr.ts', ...tvFiles];
files.push('src/core/appUpdates.ts', 'src/data/appUpdates.ts', 'package.json');
const matched = files.map(file => {
  const part = maps.find(entry => entry.sources?.some(source => source.replaceAll('\\', '/').endsWith(`/${file}`) || source.replaceAll('\\', '/') === file));
  assert.ok(part, `Missing bundled source: ${file}`);
  const index = part.sources.findIndex(source => source.replaceAll('\\', '/').endsWith(`/${file}`) || source.replaceAll('\\', '/') === file);
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(part.sourcesContent[index], source, `Bundled source differs: ${file}`);
  return { file, sha256: crypto.createHash('sha256').update(source).digest('hex'), bundledSourceMatches: true };
});
const nativeRoot = 'modules/stillwave-dvr/android/src/main/';
const nativeFiles = ['AndroidManifest.xml', ...['DvrEngine', 'DvrServer', 'DvrService', 'Hls', 'StillwaveDvrModule', 'RecordingPlanner', 'TvRemote', 'Reminders'].map(name => `java/expo/modules/stillwavedvr/${name}.kt`)];
const apkTime = fs.statSync(`artifacts/Stillwave-${version}.apk`).mtimeMs;
const native = nativeFiles.map(name => {
  const file = nativeRoot + name;
  assert.ok(fs.statSync(file).mtimeMs <= apkTime, `Native source changed after the APK build: ${file}`);
  return { file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), modifiedBeforeApk: true };
});
fs.writeFileSync(`artifacts/v${version.replaceAll('.', '')}-bundle-source-check.json`, JSON.stringify({ javascript: matched, native }, null, 2));
console.log('All DVR/player JavaScript sources exactly match the native bundle source map.');
