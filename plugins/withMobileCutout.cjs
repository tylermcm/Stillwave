const { withMainActivity } = require('expo/config-plugins');

function addMobileCutout(contents) {
  contents = contents.replace(/\n[ \t]*\/\/ @generated begin stillwave-mobile-cutout[\s\S]*?\/\/ @generated end stillwave-mobile-cutout\n?/g, '');
  const anchor = /super\.onCreate\([^\r\n]*\)/;
  if (!anchor.test(contents)) throw new Error('Could not find MainActivity.onCreate for mobile cutout support.');
  return contents.replace(anchor, match => match + `
    // @generated begin stillwave-mobile-cutout
    val mode = (getSystemService(android.content.Context.UI_MODE_SERVICE) as android.app.UiModeManager).currentModeType
    if (mode != android.content.res.Configuration.UI_MODE_TYPE_TELEVISION && android.os.Build.VERSION.SDK_INT >= 28) {
      val attributes = window.attributes
      attributes.layoutInDisplayCutoutMode = if (android.os.Build.VERSION.SDK_INT >= 30) {
        android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      } else {
        android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
      window.attributes = attributes
      androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
    }
    // @generated end stillwave-mobile-cutout
`);
}

module.exports = config => withMainActivity(config, config => {
  if (config.modResults.language !== 'kt') throw new Error('Mobile cutout support requires Kotlin MainActivity.');
  config.modResults.contents = addMobileCutout(config.modResults.contents);
  return config;
});
module.exports.addMobileCutout = addMobileCutout;
