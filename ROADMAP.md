# Next steps for Stillwave

The current product direction is recorded below. Historical backlog notes are retained for context and do not override the user's newer choices. Local DVR shipped in 0.2.0; Guide/My DVR and persistent scheduled recording/series rules followed in 0.4.0. See TV_IMPLEMENTATION.md and CURRENT_WORK.md for implementation and validation status.

## Current direction: mobile and Fire TV media hubs (2026-10-28)

Current stage: **design review before implementation**, as requested by the user. See [hub design study](docs/HUB_DESIGN.md) for the Watch first/Daily first proposals and interaction decisions. Do not start building the new hub or playback expansions until the user reviews the direction and asks to proceed.

Build mobile and Fire TV together as first-class versions of StillWave, sharing content/data/playback modules while using touch and remote navigation suited to each screen. The TV version will most likely be sideloaded on the user's Fire TV Stick; exact model/OS is not yet confirmed. Design TV for the D-pad remote, readable layouts, bounded memory/cache use and limited hardware decoding. Keep the current app/OS approach: rooting, replacing the launcher or developing a complete OS is not requested and is not a dependency for this scope.

Accepted playback expansions: **multiview** and **casting**. Start multiview with a measured two-stream implementation; evaluate additional views against real hardware decoder/memory capacity and provider connection limits. Casting must account for Fire TV receivers and Amazon's services, rather than assuming Google Cast availability. Validate discovery, playback handoff and remote/phone control on the actual targets.

Accepted Discover scope by platform, inspired by CobraTV's broader hub:

| Feature | Mobile | Fire TV |
| --- | --- | --- |
| Sports Center | Yes | Yes |
| Radio & Podcasts | Yes | Yes |
| Daily Dashboard | Yes | Yes |
| Local Media | Yes, on-device files | No |
| Live World | No | Yes |
| Ambient Mode | No | Yes |
| Trivia & Games | No | No |

Multiview and casting remain accepted playback expansions across the mobile/TV experience. The mobile platform exclusions above apply to Discover modules, not existing Guide/DVR/player features.

Module descriptions:

- **Sports Center:** scores, schedules, standings and a Watch action when an event can be matched to available guide programming.
- **Radio & Podcasts:** station browsing by genre/location, podcast search and episode resume.
- **Live World:** public city, beach, wildlife, mountain and space feeds.
- **Daily Dashboard:** weather, headlines, today's games and astronomy imagery with explanatory text.
- **Ambient Mode:** scenic/fireplace/rain/ocean visuals, optional audio and a clock.
- **Local Media (mobile only):** open and play videos/audio stored on the device, using a native file picker and user-granted access. This is not a server/NAS media library or a whole-device background scan.

Sections should be individually hideable. Sources, API availability/terms, caching and playback/device support still need implementation research. These additions are approved product direction, not shipped or implemented features.

Excluded: **local media/file playback on TV**, **Live World and Ambient Mode on mobile**, and **trivia and games on both**. The latest mobile-specific request supersedes the earlier blanket exclusion of local media. The user also declined the previously suggested home DVR companion, provider catch-up expansion, smart stream failover, smarter series recording, show/team follows and encrypted backup/restore. Setup/diagnostics/maintenance tools suggested afterward were not selected as the intended expansion. Do not reintroduce these as active work without a new user request. Existing DVR and source features remain.

Platform references checked 2026-10-28: [Fire OS app sideloading](https://www.developer.amazon.com/docs/fire-tv/installing-and-running-your-app.html), [Fire OS overview and service differences](https://developer.amazon.com/docs/fire-tv/fire-os-overview.html), [Fire OS APK versus Vega VPKG targeting](https://developer.amazon.com/docs/app-submission/target-app.html). Compatible Fire OS hardware can use the Android APK; Vega OS requires its own app package/port. [Vega developer sideloading](https://developer.amazon.com/docs/vega/0.24/run-apps) is a development route for Vega apps, not direct installation of our APK. Device-specific OS replacement feasibility has not been researched or requested.

## DVR milestones

- **Next update, implemented in source after 0.4.11:** device guide-size presets, custom channel ordering, startup destination, sleep timer, guide day selection, per-new-job/series recording padding, running capture extension, protected recordings and optional watched-recording cleanup. See README for behavior and device-validation limits. No APK release yet.

- **0.2.0: local HLS DVR.** Keep a rolling buffer (30 minutes or 512 MiB), resume from the paused position, seek backward/forward, explicitly go live, record now, stop after 30 minutes or the current guide program, and browse/play/delete local recordings with saved playback positions. One capture at a time, shared by viewing and recording. Preserve partial recordings after interruptions. Support Android first; explicitly explain unsupported HLS variants and other stream formats.
- **0.4.0 review: scheduled DVR and series.** Real guide-created alarm jobs, program deadlines, persisted title/channel series rules, one-recording conflicts and visible failures. Start/end padding is implemented for the next update. Remaining: channel/time recurrence, richer episode/season matching, unattended guide fetching and physical device/reboot validation.
- **Historical idea, declined 2026-10-28: home DVR companion.** Not part of the current scope.
- **Broader format support.** Separate HLS audio renditions, byte-range streams, progressive transport streams and provider catch-up need dedicated capture/playback work. Protected streams may not permit recording.

## Historical feature backlog (current choices above take precedence)

- Mini guide over fullscreen video, previous-channel switching and recents.
- A timeline guide with day selection, jump-to-now, show/team follows and reminders.
- Custom collections across playlists, local household profiles and startup preferences.
- Remembered audio/subtitles/aspect ratio per channel, brightness/volume gestures and touch lock.
- Sleep timer, playlist refresh previews and stream quality details.
- Multiview with provider connection-limit handling, casting and a remote-friendly Android TV edition.

## Historical foundation and library ideas (not current commitments)

1. **Give every playlist its own guide.** Multiple XMLTV sources, provider-scoped channel IDs, explicit matching priority, source freshness, and refresh history. Keep a working cached guide when a refresh fails. This is the best next foundation: channel playlists now coexist, but guide import still uses one shared guide source.
2. **Search for something to watch, not just a channel.** Search program titles, teams and topics across the guide; filter to on now, starting soon, favorites or a specific playlist. Add local program reminders and a watchlist. Show when guide coverage is missing rather than implying no program exists.
3. **Build a channel workbench.** Rename, reorder and hide channels; pin categories; merge equivalent stations across playlists while retaining the original source entries. Store edits separately so provider refreshes cannot undo the user's organization.
4. **Add smart stream failover.** Let the user assign backup sources for a station and switch after a diagnosed failure. Preserve a provider's concurrent-stream limit and avoid probing every alternate stream at once. Show which source is active and why it changed.
5. **Make channel surfing feel instant.** Recently watched channels, previous-channel toggle, a small favorites dock, and consistent keyboard/remote navigation. Keep one active player and avoid silently opening parallel provider streams.
6. **Create encrypted portable backups.** Back up playlists, favorites, channel edits, guide mappings and preferences in one password-protected file. Preview what will be restored and merge without overwriting the existing library. Provider credentials currently live in unencrypted app-private storage; this would also be the right time to add secure credential storage.
7. **Add playback tools that earn their space.** Sleep timer, Wi-Fi-only mode, a mobile-data warning, audio/subtitle preferences per channel, aspect-ratio options, and an optional control lock. Keep them behind the options menu.
8. **Build a useful health dashboard.** Source availability, guide coverage, last successful refresh, startup times and stall/recovery history measured on the device. Offer a redacted diagnostics export for troubleshooting. Keep histories bounded and local.

Casting, multiview, catch-up playback and a full Android TV interface each need a separate implementation and device validation.
