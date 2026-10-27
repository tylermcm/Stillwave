# Next steps for Stillwave

The expanded feature set below was accepted as the direction for Stillwave. Local DVR shipped in 0.2.0. The 0.4.0 review build adds Claude's TV Guide/My DVR layout, persistent scheduled jobs and title/channel series rules; physical TV acceptance is pending. See TV_IMPLEMENTATION.md for the current implementation boundary. The older backlog descriptions below retain the intended direction.

## DVR milestones

- **0.2.0: local HLS DVR.** Keep a rolling buffer (30 minutes or 512 MiB), resume from the paused position, seek backward/forward, explicitly go live, record now, stop after 30 minutes or the current guide program, and browse/play/delete local recordings with saved playback positions. One capture at a time, shared by viewing and recording. Preserve partial recordings after interruptions. Support Android first; explicitly explain unsupported HLS variants and other stream formats.
- **0.4.0 review: scheduled DVR and series.** Real guide-created alarm jobs, program deadlines, persisted title/channel series rules, one-recording conflicts and visible failures. Remaining: configurable start/end padding, channel/time recurrence, richer episode/season matching, unattended guide fetching and physical device/reboot validation.
- **Later: home DVR companion.** An optional always-on PC/NAS captures scheduled recordings even when the phone is off and serves the recording library to Stillwave.
- **Broader format support.** Separate HLS audio renditions, byte-range streams, progressive transport streams and provider catch-up need dedicated capture/playback work. Protected streams may not permit recording.

## Accepted feature backlog

- Mini guide over fullscreen video, previous-channel switching and recents.
- A timeline guide with day selection, jump-to-now, show/team follows and reminders.
- Custom collections across playlists, local household profiles and startup preferences.
- Remembered audio/subtitles/aspect ratio per channel, brightness/volume gestures and touch lock.
- Sleep timer, playlist refresh previews and stream quality details.
- Multiview with provider connection-limit handling, casting and a remote-friendly Android TV edition.

## Foundation and library improvements

1. **Give every playlist its own guide.** Multiple XMLTV sources, provider-scoped channel IDs, explicit matching priority, source freshness, and refresh history. Keep a working cached guide when a refresh fails. This is the best next foundation: channel playlists now coexist, but guide import still uses one shared guide source.
2. **Search for something to watch, not just a channel.** Search program titles, teams and topics across the guide; filter to on now, starting soon, favorites or a specific playlist. Add local program reminders and a watchlist. Show when guide coverage is missing rather than implying no program exists.
3. **Build a channel workbench.** Rename, reorder and hide channels; pin categories; merge equivalent stations across playlists while retaining the original source entries. Store edits separately so provider refreshes cannot undo the user's organization.
4. **Add smart stream failover.** Let the user assign backup sources for a station and switch after a diagnosed failure. Preserve a provider's concurrent-stream limit and avoid probing every alternate stream at once. Show which source is active and why it changed.
5. **Make channel surfing feel instant.** Recently watched channels, previous-channel toggle, a small favorites dock, and consistent keyboard/remote navigation. Keep one active player and avoid silently opening parallel provider streams.
6. **Create encrypted portable backups.** Back up playlists, favorites, channel edits, guide mappings and preferences in one password-protected file. Preview what will be restored and merge without overwriting the existing library. Provider credentials currently live in unencrypted app-private storage; this would also be the right time to add secure credential storage.
7. **Add playback tools that earn their space.** Sleep timer, Wi-Fi-only mode, a mobile-data warning, audio/subtitle preferences per channel, aspect-ratio options, and an optional control lock. Keep them behind the options menu.
8. **Build a useful health dashboard.** Source availability, guide coverage, last successful refresh, startup times and stall/recovery history measured on the device. Offer a redacted diagnostics export for troubleshooting. Keep histories bounded and local.

Casting, multiview, catch-up playback and a full Android TV interface each need a separate implementation and device validation.
