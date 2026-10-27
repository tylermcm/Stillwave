# Validation â€” October 27, 2026

## Current signed APK: 0.4.3 / versionCode 10

The user approved the corrected StillWave logo and explicitly authorized this build. APK: `artifacts/Stillwave-0.4.3.apk`, 36,875,536 bytes (35.2 MiB), ARM32/ARM64, Android 7+ (local DVR Android 8+). SHA-256: `8367f233bdb6e076f0ffc5fcedbd7252bc15701f9681c2746f5a1f31af849cc7`. Original signing key retained; install as an update without uninstalling.

Includes the approved version-2 seafoam logo/native splash and branded library-loading handoff; shared landscape TV Guide/My DVR with larger top navigation and DVR tabs; mobile live/recording player on phones and tablets; remote player on TV hardware; mobile momentum scrolling and pinned channel names. Existing default US playlist, partial guide, stable numbering, no-guide browsing and DVR behavior are retained.

Full Android prebuild regenerated the project with expo-splash-screen 58.0.11. Typecheck and all 82 tests passed. Native release compilation, release lint, R8, packaging and signing succeeded in 7m59s. Verified original certificate, alignment, version, landscape launch, private DVR service, non-debuggable status, both ARM ABIs and embedded standalone bundle. Compiled resource table resolves the launch splash theme, all five native splash densities, and the approved v2 logo to their optimized APK ZIP paths. Current app/player/scroll/splash source matches the native source map. Signing files and isolated preview harness are excluded. Reports: `artifacts/release-v043-check.json`, `artifacts/v043-bundle-source-check.json`. Build log: `.build-tmp/apk-build-v043.log`.

No physical-device or emulator installation was performed. Startup timing, nested touch scrolling, provider playback and Fire Stick remote behavior still need hardware acceptance. No commit or push. Earlier in-progress/pending-approval sections below are historical and superseded by this completed authorized build.


## Previous signed review APK 0.4.2

All Android hardware now selects the same TV layout; the packaged MainActivity launches in landscape. Native release compilation/lint, typecheck and 81 tests passed. `artifacts/Stillwave-0.4.2.apk` is versionCode 9, 36,096,922 bytes, ARM32/ARM64, original signer. Signature/alignment, orientation, manifest capabilities, non-debuggable status, private DVR service and embedded standalone bundle passed verification. Current shared TV UI/player/controller source matches the native bundle source map; preview harness and signing files are excluded. Evidence: `artifacts/release-v042-check.json`, `artifacts/v042-bundle-source-check.json`. SHA-256: `f2a9e4f8beb1c9358d2497b7b811944ae597320bbce61a351c50545c0d388021`.

No emulator or physical installation was performed. Device acceptance is pending. A production web export passed; its real TV Guide and player were checked at phone-landscape size for touch Menu, Watch, auto-hide/reveal and player Options. Screenshot: `artifacts/v042-shared-tv-guide.png`. Static serving avoided a development watch-mode file-watcher timeout; the native release build and bundle verification succeeded independently.

## Previous signed review APK 0.4.1

Native release build and lint passed for ARM32 and ARM64; 80 TypeScript tests and typecheck passed. `artifacts/Stillwave-0.4.1.apk` is versionCode 8, 36,092,826 bytes, signed with the original certificate. Signature, alignment, non-debuggable manifest, private DVR service, embedded production bundle and absence of signing files were verified. Current mobile/TV/channel/player source matches the native bundle source map; the UI preview harness is excluded. Evidence: `artifacts/release-v041-check.json`, `artifacts/v041-bundle-source-check.json`. SHA-256: `a061470ffdf99c6c435df33ee0e46fa218cc8eaed56c6cde3d561e02446ae90c`.

No emulator or physical-device runtime test was performed for 0.4.1. The user will install and test on their Fire Stick at home. Earlier runtime reports below describe earlier versions and are not 0.4.1 acceptance.

## Current TV/DVR review build 0.4.0

See [TV_IMPLEMENTATION.md](TV_IMPLEMENTATION.md) for the current visual comparisons, real DVR integration checks and acceptance limits. Typecheck and 68 TypeScript tests passed. Native JVM checks and an isolated alarm-driven HLS recording integration passed. Guide browser parity is 99.999614% exact pixels against settled HTML; My DVR is 99.988281% within 16/255 per channel against the supplied PNG. Production APK and source-map verification passed. Physical Fire TV acceptance is pending; the user's device remains on 0.2.0.

The sections below preserve historical verification of earlier builds; their feature-limit statements describe those versions.

## Signed Android DVR release 0.2.0

- Signed standalone universal APK: `artifacts/Stillwave-0.2.0.apk`, version code 4, 53,014,686 bytes (50.6 MiB), ARM32/ARM64/x86_64. SHA-256: `f2fe7ba4d0b6063ece4814ce157cdbfdd08a7b974d1d1a0a7cc704e8b6cd91d7`.
- Original signing certificate matches the restored key: `0ba646c4573a26633392f443c9891b371891fb655a863fedfcdefb59fe732060`. Signature, 16 KiB alignment, embedded standalone bundle, non-debuggable manifest, private data-sync DVR service, foreground/wake/notification permissions, and absence of signing files in the APK verified. See `artifacts/release-v020-check.json`.
- All DVR/player JavaScript sources exactly match the native Metro source map, and the APK's embedded bundle matches the compiled build output. Native source fingerprints are included in `artifacts/v020-bundle-source-check.json`.
- TypeScript typecheck and **46 TypeScript tests passed**. Four native Kotlin/JVM tests passed, including capture with provider headers, shared upstream downloads, rolling-buffer eviction while saved recordings remain playable, file serving/ranges, recording persistence, clean failure of the first recording write, and a timed stop while the source playlist is frozen.
- Android/iOS/web bundle exports passed. Browser regression passed for legacy migration, multiple playlists, source refresh/removal, persisted favorites, source/category filtering, guide schedules, scrolling, compact controls, pause/resume, error status, options and video-only fullscreen. Expected media errors occur only for the deliberate unavailable-source fixture. See `artifacts/v020-ui-check.json`.
- The **final signed APK** was installed in an isolated Android 15/API 35 x86_64 emulator and exercised with a generated HLS live feed. Pause position stayed at 40 seconds while the buffer grew; resume continued at 41 seconds, 21 seconds behind live. Rewind moved to 12 seconds, forward to 43, and Go live returned to a 3-second live delay. Timeline dragging, landscape video-only fullscreen and PiP passed.
- Recording notification permission, record now, ongoing-recording playback, closing the live player, screen-off/background capture, stop/save, recorded fullscreen playback, resume positions, process restart, deletion and interrupted-recording recovery passed on that final APK. One screen-off interval grew the recording from 16 to 28 seconds. Recorded fullscreen playback advanced from 11 to 14 seconds. No AndroidRuntime or ReactNativeJS errors were reported. Evidence: `artifacts/v020-native-e2e.json` and `artifacts/v020-native-*.png`.
- A separate native fixture capture observed **101 upstream segment requests, with zero duplicates** while viewing and recording shared the session. See `artifacts/v020-native-upstream-stats.json`.
- A live-window regression was found during device testing: expo-video caches its duration at track/state changes, which can become stale as a DVR playlist grows. DVR seeks now derive the available range from captured timestamps instead of clamping a paused position against that cached duration. The final signed APK passed the resulting pause/resume check.

Limits: Android DVR requires API 26+. The first capture engine supports unencrypted HLS with multiplexed audio and complete segments; separate audio renditions, byte-range HLS and non-HLS formats use ordinary playback. Captures one channel at a time. Background data-sync time limits and process termination can interrupt capture; saved footage is retained. Scheduled start times, recurring/series recording, recording export and a PC/NAS companion are not implemented. Actual provider compatibility, physical ARM devices, sustained multi-hour capture, older Android versions and storage-pressure recovery still need device validation. The bounded-buffer eviction and deadline cases were tested with shortened native fixture limits rather than a 30-minute device run.

The remaining sections record earlier releases and intermediate work.

## Signed Android release 0.1.2

- Multiple playlists coexist with source-scoped channel IDs. Legacy single-playlist migration preserves channel IDs, favorites and guide mappings. Refresh/replace/remove operates on one source; URL reimport updates the existing source. Imports finish saving before reporting success. New channels are matched against cached XMLTV data when available. The app still has one shared guide source.
- Watch opens to a searchable category grid. All channels and Favorites are included; source selection works across Watch and Guide. The virtualized channel/schedule list has an instant floating scroll-to-top control.
- Guide renders channel schedules with on-now progress, next and later programs, playback buttons and full schedule/mapping access, rather than duplicating Watch's channel rows.
- Custom controls sit over the video in the requested positions. Two seconds of observed advancing playback trigger a 260 ms status-panel collapse and a control/badge fade. Tap reveals controls; pause, loading and error restore status. CC/audio/diagnostics are in Player options. Native screen readers keep controls visible and reduced-motion preferences disable animation.
- Android fullscreen now uses orientation locking and immersive system bars with the same VideoView and custom controls. Rotation requests are serialized, previous orientation is restored on exit, and hardware Back exits fullscreen before minimizing. iOS/web retain native fullscreen. Expo screen-orientation and navigation-bar modules are included in the native build.
- TypeScript and all **40 tests passed**. Tests cover legacy migration, channel identity collisions between sources, per-source refresh/removal, reference preservation, storage serialization and the existing recovery/PiP behavior. Android, iOS and web exports passed.
- Rendered Chrome verification at **390 Ã— 844**, using a generated moving video, a legacy 80-channel library, and a second two-channel playlist: playback advances; the 71 px status panel animates to zero; controls hide and reveal on tap; pause/resume and control positions work; sources coexist after refresh/reload; favorites and migrated ownership persist; the category-first screen and category search work; source filtering and cached-guide matching work; Guide shows now/next; scroll-to-top is immediate; removing a source preserves the other; web fullscreen targets only video. Screenshots and measurements are `artifacts/v012-*.png` and `artifacts/v012-ui-check.json`. This is browser evidence, not Android orientation/PiP runtime certification.
- Native ARM64/ARMv7 release build succeeded. Artifact: `artifacts/Stillwave-0.1.2.apk`, **35,847,066 bytes**, version code **3**. SHA-256: `740f0309d6aea7994135de0644caaa0cba4a227850b8567a1257b826314be7f1`.
- Signature matches the original key; alignment checks passed; packaged version, PiP capability, non-debuggable status, native ABIs and embedded app bundle were checked. No signing files are packaged. Details: `artifacts/release-v012-check.json`. The native Metro source map was compared with the current App, player, playlist and Android fullscreen sources; all matched.
- Device validation remains pending: updating an existing installation; Android landscape entry/exit and repeated rotation taps; controls/auto-hide with actual streams; PiP from inline and fullscreen; permission denial; screen lock; expand/dismiss; background/foreground and weak network recovery. Install over the existing app without uninstalling it.
- Feature proposals are in `ROADMAP.md`; they were not added to this release.

## Signed Android release 0.1.1

- Restored the original signing key and credentials from the user-provided archive into Git-ignored `private/android-signing/`. Verified the key opens with its original credentials. No replacement key was created; the original archive is unchanged.
- Recreated the project-local Java 21, SDK/build tools, NDK, CMake and Gradle toolchain. Used the Android SDK license already accepted on this PC.
- Native release build succeeded for **ARM64 and ARMv7**. The app's Kotlin PiP lifecycle hook compiled successfully. Version name **0.1.1**, version code **2**, package **com.stillwave.player**.
- Artifact: `artifacts/Stillwave-0.1.1.apk`, **35,793,818 bytes (34.1 MiB)**. SHA-256: `9d286d9c09594d9abd1e148ba11fae32f5cfd9439248a91f6e69669531bbaa1a`.
- APK signature verified and signer certificate matches the restored original key. Alignment passed with 16 KiB page checks. The app is not debuggable; the 1,575,088-byte application bundle is embedded; signing files are not packaged. The packaged main Activity enables picture-in-picture. Details: `artifacts/release-check.json`.
- Final TypeScript check and all **36 tests passed**. Earlier Android/iOS/web exports and browser layout checks also passed.
- No device/emulator is connected. Native runtime checks below remain pending; a successful APK build does not establish fullscreen/PiP behavior or stream reliability on the phone. Install this signed APK as an update without uninstalling the existing app.

## Android floating player update

- Enabled native Android picture-in-picture capability through the expo-video config plugin. A playing stream can be minimized with the overlapping windows button or Android Back on supported Android 8+ devices. Android 12+ also has automatic entry on Home/app switching. No auto-entry for paused or failed playback; unsupported devices hide the minimize button.
- PiP/AppState handoffs preserve the same native player rather than restarting its stream on expansion. Both callback orders are covered in the handoff tests. The watchdog skips PiP and resets its timing on return. Ordinary backgrounding still pauses; JS retries remain foreground-only.
- Added `withPipLifecycle.cjs` to pause a hidden player after either the main or native fullscreen Activity stops. It handles PiP dismissal, denied entry and screen lock, guards uninitialized playback, and preserves the visible return from fullscreen. The app declares the same Media3 version already used by expo-video so this native hook can access its player API.
- The APK script now reapplies Expo config plugins on every build so an existing generated Android project picks up PiP capability and lifecycle changes.
- `pnpm check`: TypeScript passed; **36 tests passed**, including PiP callback order, manual/automatic handoff, rejected entry, and config generation/idempotence checks.
- Android prebuild succeeded and produced the main Activity PiP capability, native lifecycle registration and matching Media3 declaration. Prebuild and bundle export do **not** compile or execute Kotlin.
- Android/iOS/web bundle exports passed. The existing browser regression check passed again for channel scrolling, player visibility, Guide search and video-only fullscreen entry/exit. The minimize control is Android-only, so a browser screenshot is not evidence of native PiP. Native generation evidence is in `artifacts/pip-native-config-check.json`.
- Native APK compilation is now complete in the signed release above. Required device checks remain: Home/app switching from inline and landscape fullscreen; Minimize and Back; paused/failed stream; denied PiP permission; expand without reopening the stream; dismiss without background audio; screen lock; repeated transitions; Android 8â€“11 manual entry and Android 12+ automatic entry.

## Android UI update

- Replaced the app-layout fullscreen toggle with `VideoView.enterFullscreen()`, configured for landscape video, native fullscreen dismissal/Back, and hidden controls until tapped. Android's native fullscreen Activity handles immersive system bars and background pausing. No additional native dependencies were added.
- Avoided pausing the stream during Android's fullscreen Activity handoff. The playback watchdog skips the native fullscreen interval and resets its timing afterward, rather than reporting suspended JavaScript as a stall. Native pause state is reconciled only for a ready stream.
- Removed the header's AD FREE badge.
- Moved the Watch/Guide heading, search, favorites filter and categories into `FlatList.ListHeaderComponent`; they scroll away with the channels. The list remains virtualized and the player stays outside it.
- `pnpm check`: TypeScript passed; all **30 tests passed**.
- Android, iOS and web exports passed. These are JavaScript/Hermes bundles, not rebuilt APKs.
- Rendered browser check at **390 Ã— 844** with 80 fixture channels: badge absent; heading/search/categories scroll away; player remains visible; Guide search works. Screenshots: `artifacts/watch-player-before-scroll.png`, `artifacts/watch-player-after-scroll.png`, `artifacts/watch-channels.png`, `artifacts/guide-search.png`. Measurements: `artifacts/layout-check.json`.
- Browser fullscreen check targets the video element alone and exits successfully. Android landscape rotation, hardware Back, uninterrupted playback across entry/exit, native pause/resume, and background/foreground still require an installed device check.
- **Initial APK rebuild blocker resolved:** this checkout originally lacked its build tools and signing files. The toolchain has been recreated and the original signing identity restored; the signed 0.1.1 APK is now available above.

## Original implementation validation

The first implementation is complete as source code and exported JavaScript/Hermes bundles. An installable APK/IPA and native-device reliability validation remain outstanding.

## Completed

- TypeScript strict type check: passed.
- Unit tests: **30 passed**, zero failures. Covers M3U parsing and stable identities, XMLTV parsing/matching/time zones, compressed input bounds, bounded retry policy, evidence-based diagnoses, credential redaction, and serialized storage without rewriting unchanged guides.
- `node scripts/export-check.mjs`: passed for **Android, iOS, and web**. Android and iOS produced Hermes bytecode. These are bundle exports, not native application binaries.
- Browser UI checked at **390 Ã— 844** using the real React Native Web application and a local fixture server. Fixtures contain no real television streams or private credentials.
- Playlist URL import loaded two fixture channels and discovered the embedded XMLTV URL.
- Guide import showed current/next programs and initially matched one channel by ID.
- Manual mapping loaded the unmatched channel's programs from the cached guide and raised matching coverage to two channels.
- Favorites filtering and channel search returned the expected channel.
- Reopening the preview retained favorites, programs, and the manual guide mapping.
- An intentionally unavailable stream stopped after the configured five retries. The diagnostic UI labeled the opaque playback failure as uncertain. Its separate header check observed HTTP 503 and described the server response in plain language.
- Removed the temporary fixture library through the application and verified empty source fields and no saved channels afterward.

## Remaining before a reliable release

- Build, sign and install on Android and iPhone.
- Test the user's actual playlist/guide, provider headers and codecs. No private source was provided during implementation.
- Measure startup, buffering, recovery, memory and battery during sustained native playback and network transitions.
- Validate native fullscreen/orientation, captions/audio selection, file picking, HTTP compatibility, app backgrounding and native decoder failure recovery.
- Investigate frame freezes that still advance an audio/playback clock; the JavaScript watchdog cannot reliably identify these.
- Exercise large imports on real phones. The implementation yields during XML parsing and separates guide persistence from favorites, but this does not establish a device performance baseline.

## Development environment note

The initial combined-platform export failed when the Windows Hermes compiler could not write its temporary output. The repeatable export script places temporary files inside the workspace and exports each platform separately. That sequence completed successfully.
