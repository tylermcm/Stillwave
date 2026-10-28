# Android app updates and channel management

Starting with 0.4.7, Android phones and Fire TV/Android TV check the latest public GitHub release at startup, every six hours while open, and on resume when the last check is six hours old. TV automatic checks were introduced in 0.4.6. Use Menu → Check for app updates to check immediately. An available release changes that menu item to Install update. Downloading occurs when selected; Android/Fire OS still asks the user to confirm installation. Active recordings must finish before an update is installed.

The first time, allow StillWave to install unknown apps in device settings, then select Install update again. Fire OS may place this under My Fire TV → Developer Options → Install unknown apps. Device menus vary. If the permission page cannot open, enable it from Settings manually.

## Publishing the next update

1. Increase `expo.version` and `expo.android.versionCode` in app.json and the version in package.json. Use a higher version code every time; for example 0.4.9 / code 16 after 0.4.8 / code 15.
2. Build with `scripts/build-android-apk.ps1` using the original private signing key. The key and passwords must stay out of Git and GitHub releases.
3. Create a **published, stable** release in `tylermcm/Stillwave`, tagged `v0.4.9` (using the actual version).
4. Attach the signed APK named exactly `Stillwave-FireTV-0.4.9.apk` or `Stillwave-0.4.9.apk`. Phones prefer the universal filename; televisions prefer the TV filename. Both are currently the same signed universal app with hardware-selected controls. Upload the APK before publishing the release.
5. On the device, use Menu → Check for app updates, or wait for the automatic check. Install over the existing app to preserve settings and recordings.

The updater ignores drafts, prereleases, lower/equal versions, unrelated assets and oversized downloads. APKs must come from this repository's HTTPS release downloads. Downloads are bounded and optional GitHub SHA-256 asset digests are checked. Native validation checks the package, a higher installed version code, device minimum SDK and the original signing certificate before opening the OS installer. Android verifies installation again. There is no silent installation or automatic rollback.

Older builds without the updater must be sideloaded once to reach 0.4.7. Future APK releases can then be installed inside StillWave. A TV running 0.4.6 can discover 0.4.7 through its updater. Pushing source code or a tag alone does not publish an APK update. These APKs support Android and Android-based Fire OS; the Fire TV Stick 4K Select runs Vega OS and requires a separate Vega port.

## Phone and TV channel menu

- **Search and filter channels:** search channel names, numbers or current/upcoming show titles within any actual playlist category. Existing Favorites, Sports, Movies, With guide and No guide views can be combined with these filters. Search/category filters last for the current app session.
- **Hide selected channel:** removes it from normal guide views, Favorites browsing, channel-number lookup and player channel stepping. It keeps the stream and recording rules in the library.
- **Hidden channels:** inspect hidden stations, select one and use Menu → Unhide selected channel. Unhide all channels restores the complete lineup.
- Hiding is saved locally. Its playlist/station identity survives URL changes during refresh and stays separate from other playlists. Existing recording rules keep expanding from all channels, including hidden ones.
- Phone search panels use a compact layout and touch category selection. Since 0.4.8, the landscape guide fills the available safe area and hides its navigation until the small top handle is tapped or swiped down. The logo appears only in the open navigation. Swipe up there, tap outside, or choose a destination to dismiss it. TV layout and remote controls are unchanged. iOS has no APK installation support.
