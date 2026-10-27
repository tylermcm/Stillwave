# Stillwave current work — October 27, 2026

Current review build: **0.4.0 / versionCode 7**. Full handoff, current APK hash, visual-source references, overlay results, native integration evidence and remaining acceptance work are in **TV_IMPLEMENTATION.md**. The TV browsing draft was replaced by Claude's Guide/My DVR layout; its data/actions use the real guide, capture engine and new persistent recording planner. The player overlay is outside this visual handoff. Typecheck, 68 TS tests, native JVM tests, native scheduled-capture integration and production bundle/signature checks passed. No commit/push. No 0.4.0 installation on the user's Fire Stick; it remains on working 0.2.0.

Original HTML/PNGs/spec remain unchanged. Review server: `node scripts/serve-mockups.mjs`, `http://127.0.0.1:8098/review`. It serves overlay images, not a fake DVR backend. See the handoff's exact distinction between browser layout validation, unminified native integration testing and pending physical Fire TV acceptance.

## Historical 0.2.0 delivery

The first Android DVR milestone is complete in **0.2.0**, versionCode **4**.

- APK: artifacts/Stillwave-0.2.0.apk; 53,014,686 bytes / 50.6 MiB.
- SHA-256: f2fe7ba4d0b6063ece4814ce157cdbfdd08a7b974d1d1a0a7cc704e8b6cd91d7.
- Original certificate: 0ba646c4573a26633392f443c9891b371891fb655a863fedfcdefb59fe732060.
- Install over the existing app. Do not uninstall the user's phone installation.
- ARM32, ARM64, x86_64. App minimum Android 7; local DVR needs Android 8+.

Implemented: rolling HLS buffer (30 minutes / 512 MiB), pause/resume behind live, backward/forward and timeline dragging, explicit Go live, record now/30 minutes/current program end, ongoing/saved recordings playback, resume positions, deletion and partial-recording recovery. One upstream capture is shared by viewing and recording. Recording continues with the live player closed or the screen locked. Stop recording before tuning another channel.

## Verification

Typecheck, 46 TypeScript tests, four native JVM tests, Android/iOS/web exports and browser regression passed. Native tests cover shared capture, eviction with saved-file retention, ranges, persistence, failed initial writes and timed stops during a frozen source.

The final signed APK passed Android 15/API 35 emulator checks: pause/resume behind live, rewind/forward, Go live, dragging, landscape fullscreen, PiP, notification permission/record now, ongoing playback, screen-off capture, recorded fullscreen playback, resume/restart persistence, deletion and interrupted-recording recovery. Zero AndroidRuntime/ReactNativeJS errors. Final pause held at 40 seconds and resumed at 41 seconds, 21 seconds behind live. Screen-off capture grew from 16 to 28 seconds. Recorded fullscreen playback advanced from 11 to 14 seconds.

Evidence: artifacts/v020-native-e2e.json (includes final APK hash), artifacts/release-v020-check.json, artifacts/v020-bundle-source-check.json, artifacts/v020-ui-check.json and native screenshots. A separate capture observed 101 upstream segments with zero duplicates: artifacts/v020-native-upstream-stats.json. Details: VALIDATION.md, README.md, artifacts/INSTALL.md.

Fixed a real device-test bug: expo-video caches duration until track/state changes. A growing DVR playlist can outgrow that cached duration; resume was clamped backward. DVR seeks now use captured timestamps instead. The final signed APK passed the regression.

## Remaining scope

ROADMAP.md contains the accepted backlog. Next DVR work is guide-scheduled start times, padding, recurring/series jobs and connection conflict handling; later a PC/NAS companion. Other accepted player/guide/library/casting/TV/multiview features are follow-on work.

Current limits: unencrypted HLS with multiplexed audio and complete segments only; unsupported formats use ordinary playback. No export or iOS/web DVR. Android data-sync time limits can interrupt capture. Actual providers, physical ARM devices, older Android versions, multi-hour capture and device storage-pressure behavior still need testing. Buffer/deadline native tests use shortened fixture limits.

## Checkout/runtime

All changes remain uncommitted, including pre-existing 0.1.2 edits. No push was performed. Preserve edits and user-created artifacts/.image_triage_ai/; do not reset/stash. Signing files remain ignored in private/android-signing/; never print or commit them. Keep both backed up privately.

Graphify was refreshed. Test feed and isolated emulator are being stopped at completion; no automation exists. Isolated AVD: .android-build/avd/StillwaveDvr.avd, port 5580; only generated test content was used.

Native test task: :stillwave-dvr:testDebugUnitTest (no testReleaseUnitTest). Standard signed build: scripts/build-android-apk.ps1; use -Architectures 'armeabi-v7a,arm64-v8a,x86_64' for emulator ABI. Verify with scripts/verify-android-release.ps1 and node scripts/verify-dvr-bundle.mjs.

The final corrected APK reused the already-generated native project via ignored .build-tmp/rebuild-dvr.ps1. The earlier .build-tmp/apk-build-v020-final.log hash is stale; final hash is above and in release-v020-check.json.

The Codex sandbox launcher currently fails before PowerShell because SYSTEMROOT is missing. Escalated execution worked; no approval-review rejection occurred. Restore SystemRoot/WINDIR/ComSpec/USERPROFILE/LOCALAPPDATA/APPDATA for Node/batch/Python/ADB. Working local environment: .build-tmp/dvr-env.ps1. Gradle/ADB require localhost access.

Temporary native test driver/runners are ignored under .build-tmp/. They bypass live-video UiAutomator idle timeouts. Harness fixes waited for fullscreen controls and used Android's uppercase DELETE confirmation. Final passed evidence includes every completed stage. Fixture server: tests/dvr-fixture-server.mjs on localhost:8096 with generated .build-tmp/dvr-segment-*.ts; final segments are exactly two seconds.
