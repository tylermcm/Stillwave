const { withAndroidManifest } = require('expo/config-plugins');

module.exports = config => withAndroidManifest(config, config => {
  // Many user-supplied IPTV feeds and local guide servers still use HTTP.
  const app = config.modResults.manifest.application?.[0];
  if (app) app.$['android:usesCleartextTraffic'] = 'true';
  return config;
});
