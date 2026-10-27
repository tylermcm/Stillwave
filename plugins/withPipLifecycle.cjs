const fs = require('node:fs');
const path = require('node:path');
const { withMainApplication, withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Stillwave: stop playback when the floating window is dismissed.';

function addPipStopHandler(contents) {
  contents = contents.replace(/\n[ \t]*\/\/ @generated begin stillwave-pip-lifecycle[\s\S]*?\/\/ @generated end stillwave-pip-lifecycle\n?/g, '');
  const anchor = /super\.onCreate\(\)/;
  if (!anchor.test(contents)) throw new Error('Could not find MainApplication.onCreate for the PiP lifecycle handler.');
  return contents.replace(anchor, match => match + `
    // @generated begin stillwave-pip-lifecycle
    ${marker}
    registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {
      private var mainStarted = false

      @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
      override fun onActivityStopped(activity: android.app.Activity) {
        if (activity is MainActivity) mainStarted = false
        // PiP is visible through onPause. onStop means it is no longer visible,
        // including denied PiP, screen lock or dismissal. Cover both the app
        // Activity and expo-video's separate fullscreen Activity.
        val manager = expo.modules.video.managers.VideoManager
        if (!manager.hasRegisteredPlayers()) return
        val view = manager.pictureInPicture.currentPiPViewCandidate.get()
        // Normal fullscreen exit starts MainActivity before stopping the
        // fullscreen Activity. Preserve playback during that visible return.
        val stoppedPlayer = (activity is expo.modules.video.FullscreenPlayerActivity && !mainStarted) ||
          (activity is MainActivity && view?.isInFullscreen != true)
        if (stoppedPlayer) view?.videoPlayer?.player?.pause()
      }
      override fun onActivityCreated(activity: android.app.Activity, state: android.os.Bundle?) {}
      override fun onActivityStarted(activity: android.app.Activity) {
        if (activity is MainActivity) mainStarted = true
      }
      override fun onActivityResumed(activity: android.app.Activity) {}
      override fun onActivityPaused(activity: android.app.Activity) {}
      override fun onActivitySaveInstanceState(activity: android.app.Activity, state: android.os.Bundle) {}
      override fun onActivityDestroyed(activity: android.app.Activity) {}
    })
    // @generated end stillwave-pip-lifecycle
`);
}

function addMediaDependency(contents, version) {
  const dependency = `implementation("androidx.media3:media3-exoplayer:${version}")`;
  if (contents.includes(dependency)) return contents;
  if (!/dependencies\s*\{/.test(contents)) throw new Error('Could not find app Gradle dependencies for PiP lifecycle.');
  return contents.replace(/dependencies\s*\{/, match => `${match}\n    // Same Media3 version as expo-video; exposes its player API to the lifecycle hook.\n    ${dependency}`);
}

module.exports = config => {
  config = withAppBuildGradle(config, config => {
    const videoRoot = path.dirname(require.resolve('expo-video/package.json', { paths: [config.modRequest.projectRoot] }));
    const gradle = fs.readFileSync(path.join(videoRoot, 'android/build.gradle'), 'utf8');
    const version = gradle.match(/def androidxMedia3Version = "([\d.]+)"/)?.[1];
    if (!version) throw new Error('Could not read expo-video Media3 version for the PiP lifecycle hook.');
    config.modResults.contents = addMediaDependency(config.modResults.contents, version);
    return config;
  });
  return withMainApplication(config, config => {
    if (config.modResults.language !== 'kt') throw new Error('Stillwave PiP lifecycle requires Kotlin MainApplication.');
    config.modResults.contents = addPipStopHandler(config.modResults.contents);
    return config;
  });
};
module.exports.addPipStopHandler = addPipStopHandler;
module.exports.addMediaDependency = addMediaDependency;
