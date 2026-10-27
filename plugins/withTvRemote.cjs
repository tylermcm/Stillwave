const { withMainActivity, withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

function addTvDispatch(contents) {
  contents = contents.replace(/\n[ \t]*\/\/ @generated begin stillwave-tv-remote[\s\S]*?\/\/ @generated end stillwave-tv-remote\n?/g, '');
  const anchor = /class MainActivity : ReactActivity\(\) \{/;
  if (!anchor.test(contents)) throw new Error('Could not find MainActivity for TV remote input.');
  return contents.replace(anchor, match => match + `
  // @generated begin stillwave-tv-remote
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (expo.modules.stillwavedvr.TvRemote.dispatch(event)) return true
    return super.dispatchKeyEvent(event)
  }
  // @generated end stillwave-tv-remote
`);
}
module.exports = config => {
  config = withMainActivity(config, config => { config.modResults.contents = addTvDispatch(config.modResults.contents); return config; });
  config = withAppBuildGradle(config, config => {
    const dependency = 'implementation(project(":stillwave-dvr"))';
    if (!config.modResults.contents.includes(dependency)) config.modResults.contents = config.modResults.contents.replace(/dependencies\s*\{/, match => `${match}\n    ${dependency}`);
    return config;
  });
  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    manifest['uses-feature'] ??= [];
    for (const name of ['android.hardware.touchscreen', 'android.software.leanback']) {
      const feature = manifest['uses-feature'].find(f => f.$['android:name'] === name);
      if (feature) feature.$['android:required'] = 'false';
      else manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    const activity = manifest.application[0].activity.find(a => a.$['android:name'] === '.MainActivity');
    // The same landscape TV interface is the default on every Android device.
    if (activity) activity.$['android:screenOrientation'] = 'landscape';
    const launcher = activity?.['intent-filter']?.find(f => f.action?.some(a => a.$['android:name'] === 'android.intent.action.MAIN'));
    if (launcher && !launcher.category?.some(c => c.$['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER')) {
      launcher.category ??= []; launcher.category.push({ $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' } });
    }
    return config;
  });
};
module.exports.addTvDispatch = addTvDispatch;
