# Validation — October 25, 2026

The first implementation is complete as source code and exported JavaScript/Hermes bundles. An installable APK/IPA and native-device reliability validation remain outstanding.

## Completed

- TypeScript strict type check: passed.
- Unit tests: **30 passed**, zero failures. Covers M3U parsing and stable identities, XMLTV parsing/matching/time zones, compressed input bounds, bounded retry policy, evidence-based diagnoses, credential redaction, and serialized storage without rewriting unchanged guides.
- `node scripts/export-check.mjs`: passed for **Android, iOS, and web**. Android and iOS produced Hermes bytecode. These are bundle exports, not native application binaries.
- Browser UI checked at **390 × 844** using the real React Native Web application and a local fixture server. Fixtures contain no real television streams or private credentials.
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
