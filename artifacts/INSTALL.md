# Install Stillwave on Android

1. Copy `Stillwave-0.4.0.apk` to your phone using USB, a file-transfer app, or your preferred private storage.
2. Open the APK in your phone's Files/Downloads app. If Android asks, allow that file manager to install this app.
3. If Stillwave is already installed, choose **Update**; do not uninstall it first. This APK uses the original signing key and version code 7. Your existing playlist, favorites and guide mappings are preserved.
4. For a first installation, open **Stillwave**, choose **Add your playlist**, and import your M3U URL or file.
5. In **Sources**, add an XMLTV `.xml` / `.xml.gz` guide URL or file if needed.

The universal APK includes ARM32, ARM64 and x86_64 for Android 7.0 or newer. Local DVR needs Android 8.0 or newer. It includes the app, assets and native video engine. You do not need a web server, Expo Go, an Expo account, or a running computer. Channels and URL-based guides still need an internet connection to their providers.

Supported HLS channels now build a rewind buffer (up to 30 minutes or 512 MiB). Pause keeps capturing; resume stays behind live. Use the timeline or 30-second buttons to seek. The center refresh button explicitly returns to live.

Tap the record button to start/stop a recording, or use player options for 30 minutes/current program end. **Recordings** contains saved and ongoing recordings, with playback and resume positions. Recording continues after closing the player or locking the screen. Stop it before switching to another channel; this release captures one channel at a time. Allow recording notifications to see capture status outside the app.

DVR currently supports unencrypted HLS with multiplexed audio and complete segments. Other formats still play normally and explain DVR unavailability in player options. The TV Guide now creates real scheduled recordings and series rules; export and a home DVR server remain future milestones. The device must remain on and connected; Android background limits, force-stop and source failures can interrupt recording. Saved footage is retained, with partial recordings marked.

For Fire TV, use ADB Debugging and install with `adb -s <fire-tv-ip>:5555 install -r artifacts/Stillwave-0.4.0.apk`. The same APK detects television mode. Fresh TV installs automatically load the public US playlist and partial Pluto US guide. Menu/D-pad reaches actions without typing. The user's working 0.2.0 Fire Stick installation has not yet been replaced. See `TV_IMPLEMENTATION.md` for review and validation details.

This update supports multiple playlists with independent refresh/removal and source filtering. Watch starts with categories, Guide shows channel schedules, and the channel list has an instant floating scroll-to-top button.

Playback controls are on the video. After roughly two seconds of healthy playback, the lower status panel collapses and controls fade. Tap the picture to reveal them: PiP top left, refresh center, pause bottom center, fullscreen bottom right; the options menu contains captions, audio and diagnostics. Errors and buffering keep status visible.

Android fullscreen keeps the same custom controls in landscape. Back first leaves fullscreen. Use the overlapping windows icon or Android Back from the inline player to minimize a playing channel on supported devices. Android 12+ also minimizes on Home/app switching. Expand the floating window to return; close it to pause playback.

The release build, signing, alignment and packaged manifest were checked. The signed APK passed generated-stream DVR, landscape fullscreen, PiP, screen-off recording, recorded playback, deletion and restart-recovery checks on an Android 15 emulator. Verify your provider and phone: physical-device codecs, older Android versions and sustained multi-hour capture have not yet been tested. Use **Diagnose** in the player when a channel will not open.

Future updates must use the same signing key. The key and its credentials are kept locally in `private/android-signing/`, outside Git and outside the APK.
