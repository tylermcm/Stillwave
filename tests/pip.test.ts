import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PipHandoff } from '../src/core/pipHandoff';

const require = createRequire(import.meta.url);
const { addPipStopHandler, addMediaDependency } = require('../plugins/withPipLifecycle.cjs');

test('automatic PiP preserves the stream with either Android callback order', () => {
  for (const enterFirst of [true, false]) {
    for (const stopFirst of [true, false]) {
      const pip = new PipHandoff();
      if (enterFirst) pip.enter();
      assert.equal(pip.background(true), true);
      if (!enterFirst) pip.enter();
      if (stopFirst) pip.stop();
      assert.equal(pip.foreground(), true);
      if (!stopFirst) pip.stop();
      assert.equal(pip.foreground(), false);
    }
  }
});

test('manual minimize preserves the player before the PiP start event arrives', () => {
  const pip = new PipHandoff();
  pip.request();
  assert.equal(pip.background(false), true);
  pip.enter();
  pip.stop();
  assert.equal(pip.foreground(), true);
});

test('failed minimize and ordinary backgrounding do not suppress pause/resume handling', () => {
  const pip = new PipHandoff();
  pip.request();
  pip.cancelRequest();
  assert.equal(pip.background(false), false);
  assert.equal(pip.foreground(), false);
});

test('PiP stop does not discard a pending expansion before AppState becomes active', () => {
  const pip = new PipHandoff();
  pip.enter();
  pip.background(true);
  pip.stop();
  assert.equal(pip.inPip, false);
  assert.equal(pip.foreground(), true);
  assert.equal(pip.background(false), false);
});

test('native PiP handler survives repeated prebuild and preserves application initialization', () => {
  const source = 'class MainApplication : Application() {\n  override fun onCreate() {\n    super.onCreate()\n    loadReactNative(this)\n  }\n}\n';
  const once = addPipStopHandler(source);
  assert.equal(addPipStopHandler(once), once);
  assert.equal(once.match(/registerActivityLifecycleCallbacks/g)?.length, 1);
  assert.ok(once.includes('loadReactNative(this)'));
  assert.ok(once.includes('if (!manager.hasRegisteredPlayers()) return'));
  assert.ok(once.includes('activity is expo.modules.video.FullscreenPlayerActivity'));
  assert.throws(() => addPipStopHandler('class Unexpected {}'), /onCreate/);
});

test('native lifecycle uses the installed expo-video Media3 version without duplicate dependencies', () => {
  const source = 'dependencies {\n    implementation("com.facebook.react:react-android")\n}\n';
  const once = addMediaDependency(source, '1.9.1');
  assert.equal(addMediaDependency(once, '1.9.1'), once);
  assert.ok(once.includes('com.facebook.react:react-android'));
  assert.throws(() => addMediaDependency('android {}', '1.9.1'), /dependencies/);
});
