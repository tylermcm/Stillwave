# Install StillWave 0.4.3

APK: Stillwave-0.4.3.apk, version code 10, 35.2 MiB. ARM32 and ARM64; Android 7.0 or newer. Local DVR requires Android 8.0 or newer.

Install as an update over Stillwave. The original signing certificate is retained. Do not uninstall first; saved playlists, favorites, channel numbers and guide mappings remain in app storage.

All Android devices share the landscape TV Guide and My DVR. Phones/tablets use the mobile video player; TV hardware uses remote player controls. This release includes the approved StillWave splash, larger top navigation buttons and smooth mobile scrolling. Fresh installs load the full US playlist and partial Pluto US guide. Existing sources are preserved.

On Fire Stick, use your authorized ADB connection at home:

    adb -s <fire-tv-ip>:5555 install -r artifacts/Stillwave-0.4.3.apk

On an Android phone, transfer the APK and open it from Files/Downloads, then choose Update. The app opens in landscape. Use Menu for categories, favorites, No guide, channel-number lookup and feed refresh. Swipe the guide to browse; tap a cell to focus it and tap it again or choose Watch. Touch and remote input use the same interface. Tap video to reveal auto-hidden controls; Options opens player actions.

Supported HLS provides pause, a rolling buffer, 10-second seeking on mobile / 30-second seeking on TV, Go live and recording. My DVR shows saved and scheduled recordings and series rules. One capture channel is supported at a time. Schedules depend on downloaded guide data; sports guide coverage remains partial. iOS retains its separate UI and has not been built here.

The app, assets and native engine are embedded. No Expo Go, developer server, computer or app account is required to run it. Remote streams/guides require access to their providers.

Verification: typecheck and 82 tests passed. Native release compilation/lint, original signer, signature/alignment, version, landscape manifest, native splash theme/PNG assets and approved v2 logo, both ARM architectures, private DVR service, non-debuggable status and embedded bundle were checked. Current TV/controller/player JavaScript matches the native build source map. Signing files and preview harness are excluded. Reports: release-v043-check.json and v043-bundle-source-check.json.

This build was not installed on a physical device or emulator. Test remote/touch browsing, playback, fullscreen and recordings on your own hardware.

SHA-256: 8367f233bdb6e076f0ffc5fcedbd7252bc15701f9681c2746f5a1f31af849cc7
