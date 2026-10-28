# StillWave

A personal Android and iPhone IPTV player built around live television. This is a first working implementation, not a claim of production playback reliability. No ads, analytics SDKs, account server, or bundled channel subscriptions.

## Install the standalone Android app

The Android release is **0.4.8 / version code 15**, available from [GitHub Releases](https://github.com/tylermcm/Stillwave/releases). Install `Stillwave-0.4.8.apk` on phones or `Stillwave-FireTV-0.4.8.apk` on Android-based Fire TV devices. Both are the same signed universal APK and use the original signing key: install over the existing app without uninstalling. **All Android devices use landscape Guide and My DVR views.** On phones and tablets, the layout fills the available safe area with a modest size increase; tap the small top handle or swipe down on it to open navigation and reveal the StillWave logo. Swipe up on the open menu, tap outside, or choose a destination to dismiss it. Touch controls replace remote shortcut instructions. TV layout and remote controls are unchanged. Phones and tablets use the mobile video player. The Fire TV Stick 4K Select runs Vega OS and cannot install this APK. Physical-device acceptance is pending.

Phones and TVs include **Menu → Search and filter channels**, persistent channel hiding/restoration and automatic GitHub release checks. Menu → Check for app updates offers an in-app APK download and opens the OS installer for confirmation. The first update may require allowing installations from StillWave in device settings. Once this version is installed, future stable releases with signed APK assets can be updated without manually transferring the file. See [update and channel-management instructions](docs/APP_UPDATES.md).

The APK contains its JavaScript, assets and native playback engine. **No web server, Expo Go, developer computer or app account is required to run it.** Your phone connects directly to the playlist, guide and channel providers. A guide can also be imported as a local XMLTV file, so hosting your own guide server is optional.

Fresh Android installs load the public US playlist and the combined hosted guide, with direct-source fallbacks. **Menu** opens filters, channel-number lookup and feed refresh. Existing playlists, favorites and guide mappings are preserved. Channels with current/upcoming listings appear first. Swipe to browse and tap the focused channel to watch, or use a remote. This APK includes 32-bit ARM and ARM64 on Android 7.0 or newer; local DVR requires Android 8.0 or newer. iOS retains the separate Sources and mobile browsing layout. Native playback still needs testing with your providers and hardware.

## Pause, rewind and record

Android TV/Fire OS uses the Guide and My DVR layout from the supplied HTML mockup, with D-pad highlighting, automatic fullscreen, default US playlist/combined guide setup, and real scheduled recording/series actions. Phones and tablets share the TV browsing screens and retain touch-focused player controls. See [TV_IMPLEMENTATION.md](TV_IMPLEMENTATION.md) for the overlay results, remote controls, native validation and limits.

Supported HLS channels automatically build a local rolling buffer, up to **30 minutes or 512 MiB**, whichever comes first. Pause keeps capturing the broadcast. Resume continues at the paused position; the player shows how far behind live you are. The remote TV player uses 30-second backward/forward buttons; the mobile player uses 10-second skips and explicit **Go live**. If footage expires, the app warns and resumes at the oldest available footage rather than jumping to live.

Tap the record button on the video to **record now**, then tap again to stop and save. Player options also offer a 30-minute recording or a stop at the current guide program's end when guide data is available. Recordings save the incoming broadcast, even if playback is behind live. They continue when you close the player or lock the screen. Open **Recordings** to watch, resume, stop, or delete them; you can watch an ongoing recording from its beginning.

Viewing and recording share one upstream capture. This release captures **one channel at a time**: stop a running recording before opening a different channel. Recordings remain after the rolling buffer clears. Failed or interrupted jobs retain captured footage and show their status. Capture reserves 256 MiB of free device space; recordings themselves use additional storage. Android may stop background data transfers after its time budget, and force-stopping the app, powering off, or losing the source can interrupt capture. Saved footage is kept.

Local DVR supports unencrypted HLS with complete video segments and multiplexed audio. Encrypted streams, separate audio playlists, byte-range HLS, DASH and progressive transport streams use ordinary playback without local DVR. Unsupported channels explain the limitation in player options. Web/iOS do not record yet. Recordings stay in app-private storage; export, configurable padding, time-based recurrence and a PC/NAS companion remain later milestones. TV series rules expand from downloaded guide data; new guide fetching runs while the app is open.

## Rebuild the APK on this Windows computer

The portable JDK, SDK, NDK, CMake and Gradle caches live in `.android-build/`. With those installed, run:

```powershell
pnpm android:apk
```

The build script embeds the app bundle, creates a personal signing key on first use, signs the APK, checks its signature/alignment and verifies that the app bundle is included. Keep **both files** in `private/android-signing/` backed up securely: the keystore and `credentials.json`. Reuse them for future updates to the installed app. They are ignored by Git and are not included in the APK.

To prepare a fresh Windows toolchain:

```powershell
pnpm install
pwsh -File scripts/setup-android-tools.ps1 -Component Jdk
pwsh -File scripts/setup-android-tools.ps1 -Component Sdk
```

Use the downloaded SDK Manager with that JDK to install `platforms;android-37.0`, `build-tools;37.0.0`, `platform-tools`, `ndk;27.1.12297006` and `cmake;3.31.6`, then run `pnpm android:apk`. SDK package installation requires Google's standard package licenses. The setup scripts use the vendors' official downloads and verify archive SHA-256 checksums.

## Development preview and iPhone

For development only, `pnpm start` launches Expo/Metro and `pnpm web` launches the browser preview. These servers are not part of the standalone Android app. Private provider URLs belong in the app, not in this repository.

iOS device builds require Apple signing and either macOS/Xcode or a cloud build service. An iPhone installation has not been produced. The optional `eas.json` profiles support cloud builds if needed later; the Android APK build here is local.

## What is implemented

- Native playback through `expo-video`: Android Media3/ExoPlayer and iOS AVPlayer.
- Multiple channel playlists coexist. Add by URL/file, optionally name a source, refresh/replace/remove it independently, and filter browsing to one source or all playlists. Existing single-playlist libraries migrate with favorites and guide matches intact. Import completes only after the new library has saved.
- Watch opens to a searchable category grid with All channels and Favorites. Channel browsing stays virtualized and has an instant floating scroll-to-top button.
- Guide shows each channel's current program with progress, the next program and later shows, plus access to its full schedule and guide mapping. It uses the imported XMLTV feed; it cannot invent programs absent from that feed.
- The Android APK uses the same TV Guide/My DVR and player layout on all devices, in landscape. The player shows a channel/program header and a bottom action row for playback, DVR and returning to channels. Controls auto-hide and can be revealed by touch or remote; Options opens additional actions. iOS retains the separate reference-style touch player.
- The Android APK stays in landscape with the TV interface and fullscreen player. Back returns from playback to the guide. iOS/web continue to use their platform fullscreen presentation. DVR resume preserves the paused position, including after returning to the app; Go live explicitly rejoins the current broadcast. Ordinary non-DVR streams resume within whatever window the provider still exposes.
- Android HLS DVR buffers recent footage, supports pause/rewind/forward seeking, records now or until a chosen stop, and provides a recordings library with ongoing playback, resume positions and partial-recording recovery. See the DVR section above for supported formats and device limits.
- Android picture-in-picture remains supported by the native engine on compatible phones. On Android 12+, Home/app switching can enter it while playback is active. The shared TV player does not expose the earlier phone-only PiP shortcut, and Back returns to the guide. Physical-device PiP behavior still needs acceptance.
- Search, categories, favorites, one active stream, virtualized channel lists, captions when supplied, and switching among available audio tracks.
- Fast/balanced/stable buffer targets of 8/20/40 seconds. These are buffer preferences, not guarantees of live delay or startup speed. Adaptive quality selection remains with the native engine.
- An active playback watchdog, five bounded retries with backoff, an offline state, and reconnection on network return. Background playback is limited to a visible Android floating player; application retries/watchdog checks resume in the foreground. Retry allowance resets only after 30 seconds of advancing playback or an explicit user/network restart.
- XMLTV `.xml`/`.xml.gz` imports from a direct URL or file; M3U `x-tvg-url` / `url-tvg` discovery; GitHub `blob` file-link conversion; now/next and upcoming schedules in the phone's local time zone.
- Exact `tvg-id` matching, unique display-name fallback, and manual guide matching. Raw guide data is cached locally so matching a previously unmatched channel can load its programs without another download.
- A **Diagnose** panel with evidence, observed/possible/uncertain labels, and an optional seven-second HTTP header check. Details below.

## EPG from iptv-org

The [iptv-org/iptv project](https://github.com/iptv-org/iptv) contains playlists. Its [iptv-org/epg project](https://github.com/iptv-org/epg) contains guide-generation tools. A repository URL or a `*.channels.xml` configuration file is **not** an XMLTV program guide. The app does not assume a permanent public guide server exists.

To generate your own guide on a computer, follow the EPG project's current setup instructions. Its documented workflow is:

```powershell
git clone --depth 1 -b master https://github.com/iptv-org/epg.git
cd epg
npm install
npm run grab --- --sites=CHOOSE_A_SITE_FROM_SITES.md
```

Replace the placeholder with an actual supported site. This creates `guide.xml`. Transfer that file to your phone and select **Sources â†’ Program guide â†’ Choose file**. Alternatively, serve the generated file from a server your phone can reach and enter its direct URL. `localhost` on the phone refers to the phone, not your computer.

Generated guides need periodic regeneration. This app currently supports **manual refresh**; it does not run a guide scraper or scheduled background refresh on the phone. Multiple channel playlists are supported, with one shared guide source. Adding a playlist reparses the cached guide for its channels when one is available. If a channel has no upcoming programs, check the guide dates, source coverage and ID mapping. Programs without a valid `start` and `stop` are skipped rather than having their durations invented. Proposed follow-on features are in `ROADMAP.md`.

## Explaining playback failures honestly

The app can observe some failures directly:

| Evidence | Plain-language result |
| --- | --- |
| Phone reports no connection | Your phone is offline |
| Native player reports HTTP 401 / 403 | The channel server refused access |
| HTTP 404 / 410 | The channel address is missing |
| HTTP 429 | The server asked us to slow down |
| HTTP 5xx | The server or delivery service reported an error |
| Unsupported codec/format | This phone cannot play this stream format |
| Decoder/renderer failure | The playback engine may have a problem |
| Clock stops with at least five seconds buffered | The player may be stuck |
| Foreground JS timer is delayed at least 1.5 seconds | The app's controls were slow; app/phone load is involved |
| Timeout or missing video with no distinguishing evidence | Cause uncertain: server, network or player |

Native engines do not expose every underlying HTTP response. A HEAD check is optional and downloads no video; its result is shown separately because some servers handle HEAD differently from playback GET requests. HTTP 200 proves that one address answered, not that its media segments, authentication, codec or sustained throughput are good.

The app does **not** claim that a responsive JavaScript timer proves the whole app is healthy. Native decoding, GPU problems, low memory and video freezing while an audio clock advances need device-level instrumentation and testing. The React error boundary identifies a captured UI crash as an app failure. It cannot catch every native crash or report a completely hung process while it remains hung. Diagnostics stay in memory, and displayed details redact source URLs and common credential fields.

## Compatibility and privacy

- HLS (`.m3u8`) is the most practical common format for both platforms. MPEG-TS/other progressive formats and device codecs vary. DASH is Android-only through this native playback API. This version has no alternate VLC/mpv engine or stream transcoder, DRM provisioning, recording, catch-up or casting. The floating player is currently enabled for Android.
- Some extensionless streams need a playlist manifest hint. The importer reads the common Kodi `manifest_type=hls` hint and VLC user-agent/referrer headers. Custom request-header behavior still needs testing against real providers on both platforms.
- Source failures and broadcaster-inserted commercials cannot be removed by an ad-free player.
- Playlist URLs, stream URLs, provider headers, settings and guide data are saved in the app's private local files. **The cache is not encrypted**, so credentials embedded in URLs/headers are not a credential vault. Android app backup is disabled; iOS system backups follow device policy. This version should receive secure-cache work before broader distribution with paid provider credentials.
- HTTP sources are allowed in standalone builds for compatibility. HTTP traffic is unencrypted; HTTPS is preferable when available.
- Browser mode is a development preview. Its library is stored in browser local storage, requests follow CORS, and codec/HLS support depends on the browser. Use the native app to assess IPTV playback.
- XMLTV is bounded to a 64 MiB downloaded/expanded feed, retains relevant programs from the previous day through the next seven days, and yields during parsing. M3U imports are limited to 12 MiB. External DTDs are never fetched and internal entity declarations are rejected.

## Validation and next device checks

```powershell
pnpm typecheck
pnpm test
pnpm export:check
```

Core tests cover playlist metadata, header scoping, stream identity, XMLTV time zones and boundaries, guide matching, malformed input, compressed-size limits, retry budgets, diagnostic evidence and secret redaction. Exporting JavaScript bundles does not compile an APK/IPA or prove native behavior.

Before calling playback stable, exercise an installed release build on Android and iPhone with your actual playlist: repeated channel changes, 30â€“60 minute playback sessions, weaker Wi-Fi, Wi-Fi/mobile transitions, offline/online recovery, provider errors, background/foreground, orientation/fullscreen, codec failures, and a large guide import while watching. Measure first advancing playback, stall time, recovery time, memory and battery. None of those device tests are implied by the unit-test results.

## Source references

- [Expo Video API](https://docs.expo.dev/versions/latest/sdk/video/)
- [Media3 live-stream behavior](https://developer.android.com/media/media3/exoplayer/live-streaming)
- [Apple AVPlayer buffering](https://developer.apple.com/documentation/avfoundation/avplayer/automaticallywaitstominimizestalling)
- [iptv-org EPG setup](https://github.com/iptv-org/epg)
#   S t i l l w a v e 
 
 
