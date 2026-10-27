# Stillwave TV handoff â€” October 27, 2026

The current signed package is **0.4.3 / versionCode 10** (35.2 MiB). Android devices share the landscape TV Guide/My DVR, with larger navigation controls and mobile momentum scrolling. Phones/tablets use mobile live/recording controls; TV hardware retains the remote player. The approved StillWave splash and v2 logo are packaged. Original signer retained; all 82 tests and package/source verification passed. See `CURRENT_WORK.md`, `VALIDATION.md` and `artifacts/INSTALL.md`. Older measurements below are historical; physical 0.4.3 acceptance remains pending.

## Review build

`artifacts/Stillwave-0.4.0.apk`, versionCode 7, 53,141,662 bytes. SHA-256: `4bea636720bd78dd54d30fb58fb521172310b44607ef46404a7b972d56d43e2a`. Original signing certificate retained. ARM32, ARM64 and x86_64; app minimum Android 7, native DVR minimum Android 8. Install as an update; never uninstall the user's app to update it.

The user's Fire Stick still runs working 0.2.0. **0.4.0 has not been installed on it.** The new layout needs physical Fire TV acceptance. All changes, including the supplied mockups and earlier work, remain uncommitted; no push occurred. Signing material remains ignored in `private/android-signing/`.

The final reconnect to the previously authorized `192.168.1.242:5555` timed out; ADB listed no device. No installation or UI input was sent to the Fire Stick. Turn it back on/connect it to the same network and verify its current IP before device acceptance.

## Visual source and overlays

Use unchanged `mockups/tv-dvr.html` and `mockups/TV_DESIGN_SPEC.md`. `#dvr` opens My DVR. The earlier three-column TV draft has been replaced by `src/components/tv/TvDashboard.tsx`; `TvDvrShell.tsx` supplies real guide and DVR state. The 1920Ã—1080 stage scales to the viewport. Browser comparisons use Segoe UI; Android uses Roboto as specified. The player overlay was not redesigned for these two reference screens.

`artifacts/tv-parity-review.html` provides a blend slider, candidate/reference views and amplified differences. Run `node scripts/serve-mockups.mjs` and open `http://127.0.0.1:8098/review`. The original HTML remains available at `/tv-dvr.html` and `/tv-dvr.html#dvr`.

Same-data browser render results:

| Screen/reference | Exactly identical pixels | Within 16/255 per color channel |
|---|---:|---:|
| Guide / settled HTML | 99.999614% | 99.999807% |
| My DVR / supplied PNG | 97.843171% | 99.988281% |

The Guide header, details and footer are exactly identical to the settled HTML capture. My DVR's remaining differences are small anti-aliasing/subpixel edges. The supplied Guide PNG captured its initial horizontal CSS transition halfway through: cells are shifted while the NOW line is already at its destination. The supplied-PNG comparison is retained separately and can be selected in the review page. It is not silently substituted for the settled source of truth.

Evidence: `tv-guide-stable-final-*`, `tv-guide-supplied-final-*`, `tv-dvr-final-*`, `claude-guide-current.png`, and both candidate PNGs in `artifacts/`. Overlays are actual rendered app components with the mockup's fixture data supplied by an isolated harness. Sample shows, fake storage and mock recording states are not bundled into the app. `scripts/compare-tv-layout.py` regenerates blends, differences and honest pixel metrics.

## Real behavior

- Android TV/Fire OS selects the TV shell automatically. Arrows follow channel/program time order and scroll to keep focus visible. OK starts real fullscreen playback. Back returns to the same guide cursor.
- Record now and future program recording use persistent native alarm jobs and the same HLS engine as the live player. A foreground service starts capture and the program deadline stops it. One recording is active at a time; competing jobs show a real conflict/failure rather than a success toast.
- My DVR reads real recordings, captured duration, resume positions, status and filesystem capacity. Saved video can play/resume/delete; ongoing capture can play from the start or stop/save. Deleting requires a second confirmation press.
- Series rules match title and channel, queue episodes in the downloaded guide and add newly discovered episodes after guide refresh. Cancelled episodes remain cancelled rather than being immediately re-created by reconciliation. Limits: 200 queued jobs, 100 rules, individual programs under 24 hours. Schedule/rule data are app-private and unencrypted, like the existing provider library.
- Menu focuses show actions; a second Menu opens source/favorites options. In My DVR, Menu focuses side-panel actions. Thus the basic Fire remote reaches actions without a keyboard. R/1/red records, S/2/green toggles series, X/3/yellow deletes/stops/cancels, D/4/blue opens My DVR, and G/5/Guide returns to the guide. My DVR Left/Right switches tabs.
- TV first-run setup loads `https://iptv-org.github.io/iptv/countries/us.m3u` and `https://i.mjh.nz/PlutoTV/us.xml.gz`. An existing US-playlist installation without a guide also receives the guide. Exact provider IDs are extracted from known Pluto stream links. The guide covers matching Pluto stations, not the whole US playlist; schedules are never invented. Setup preserves other playlists and favorites/recents changed while downloading. Sources can be refreshed from Menu without typing.
- Existing phone categories, sources and mobile playback layout remain separate. Earlier in-progress featuresâ€”multiple provider-scoped guides, guide search/reminders, recents and previous-channel supportâ€”are retained.

## Validation

- Typecheck and 68 TypeScript tests passed. This includes guide/episode matching, navigation/time windows, genuine recording markers, series deduplication/cancellation, actual conflict deadlines, resume data, library migration and concurrent first-run preference preservation.
- Native JVM DVR tests passed, including shared capture, preparing a recording without stealing the visible player, refusing a second recording, metadata retention, buffer eviction and deadline behavior.
- An isolated Android 15/API 35 instrumentation run used an **unminified x86_64 test APK from the same native source**. An alarm started real HLS capture with the app in the background, duplicate jobs were deduplicated, a second stream was refused, cancellation persisted, the deadline finalized video, resume/episode metadata persisted, and series rules added/removed correctly. Final run: **16 seconds, 3,637,236 bytes**. Evidence with source hashes: `artifacts/v040-native-planner-check.json`. Reproducible driver: `tests/android-planner/`; runner: `scripts/test-recording-planner.ps1` (isolated emulators only). Start the local generated HLS fixture separately with `node tests/dvr-fixture-server.mjs`.
- The real TV controller passed browser checks at 960Ã—540 for scaling, D-pad order, automatic fullscreen, restored cursor on Back, honest web DVR unavailability, DVR tabs, remote-reachable series actions, and the retained phone view. See `artifacts/tv-controller-check.json`.
- Production APK signature, original certificate, alignment, manifest, embedded bundle, ABIs and absence of signing files passed verification. Current TV/DVR JavaScript exactly matches the bundle's source map; native source fingerprints predate the packaged APK. See `artifacts/release-v040-check.json` and `artifacts/v040-bundle-source-check.json`.
- Final Android/iOS/web exports passed. The optimized production APK was installed and launched in the isolated API 35 emulator with no reported AndroidRuntime/ReactNativeJS errors. See `artifacts/v040-release-startup-check.json`. That emulator and the local HLS/parity test servers were stopped; only the mockup/overlay review server remains available.

## Limits and next acceptance

Physical 0.4.0 Fire TV screenshots and remote acceptance are still pending; browser parity is not a claim of identical Android font rasterization. The default guide is partial. DVR supports unencrypted HLS with complete multiplexed segments; other formats use normal playback. No recording export, configurable padding, time-based recurrence or PC/NAS service yet.

Series expand only from downloaded guides; new guide fetching runs while the app is open. Known alarm jobs persist and are restored on boot/update/time changes, but reboot restoration was not included in the bounded instrumentation run. Android 12+ exact-alarm/background rules can delay or refuse work; this is reported. Fire OS 7 does not require the newer exact-alarm grant. Power loss, force-stop, source failures and Android transfer budgets can interrupt capture; completed fragments are retained.

The sandbox launcher still lacks SYSTEMROOT. The session's ignored `.build-tmp/dvr-env.ps1` restores its environment; host-shell execution has worked. Build normally with `scripts/build-android-apk.ps1`; `-ReuseNativeProject` is only for unchanged native configuration, followed by both verification scripts. Do not use the old `.build-tmp/rebuild-dvr.ps1`: it targets 0.2.0.
