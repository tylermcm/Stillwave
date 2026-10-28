const { withFinalizedMod } = require('expo/config-plugins');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

// Reuse the approved mark without changing the artwork. Android adaptive masks
// expose only the center of their foreground layer; inset the drawable so the
// complete S remains visible on circular and rounded-square launchers.
module.exports = config => withFinalizedMod(config, ['android', async config => {
  const resources = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
  const drawable = path.join(resources, 'drawable');
  await mkdir(drawable, { recursive: true });
  await writeFile(path.join(drawable, 'stillwave_launcher_foreground.xml'), `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@mipmap/ic_launcher_foreground"
    android:inset="12%" />
`);
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const file = path.join(resources, 'mipmap-anydpi-v26', name);
    const xml = await readFile(file, 'utf8');
    const updated = xml.replace('android:drawable="@mipmap/ic_launcher_foreground"', 'android:drawable="@drawable/stillwave_launcher_foreground"');
    if (!updated.includes('@drawable/stillwave_launcher_foreground')) throw new Error('Adaptive launcher icon structure changed.');
    await writeFile(file, updated);
  }
  return config;
}]);
