# Stillwave TV — set-top DVR design spec

Source of truth: `tv-dvr.html` (open in a browser; `#dvr` opens My DVR). Reference images: `tv-guide.png`, `tv-my-dvr.png` (1920×1080). Build for parity with these; the HTML's CSS holds exact values.

Stage is a fixed 1920×1080 canvas scaled to fit. Target: Android TV, D-pad/remote only (arrows, OK, Back, plus color/number keys mapped to R/S/X/D/G).

## Tokens
| name | value |
|---|---|
| bg | #0b0f10 |
| panel | #11171a |
| cell | #151d20 |
| cell-now | #1a2528 |
| line | #1f2b2e |
| text | #e1e8e8 |
| muted | #7f8f90 |
| dim | #55646a |
| accent | #8fd6c0 (ink on accent #08201a) |
| rec | #e5484d (recording dot and NOW line only) |

Rules: one accent color; red is only for recording; no gradients, shadows, glows, chips or colored channel logos. Font: system sans (Segoe UI in mock; use Roboto on Android). Sizes: 20 hints, 22–24 body/cells, 26–28 nav/list, 48–52 titles.

## Guide screen
- Top bar 80px: wordmark (muted, 26) · nav "Guide" / "My DVR" (28, active = text color + 3px accent underline) · clock right.
- Details block 300px: preview 448×252 (panel, 1px line border) at left; right column = time line (24 muted), title (52/600), 2-line description (24), buttons (Watch primary if live, Record), hint "S Record series".
- Grid: 56px ruler, rows 84px, channel column 324px wide (64px left pad, number 40px wide dim, name 24). Time scale 276px per 30 min. Cells inset 5px top/bottom, 2px sides, 4px radius, 24px text, 18px h-padding.
- Focused cell: accent fill, ink text. Live cells use cell-now. Aired cells dim text. Red 2px NOW line.
- Markers inside cell before title: 12px red dot = recording; 12px 2px-ring in accent = scheduled/series.
- Footer 56px, single line of muted key hints.
- Behavior: ▲▼ change channel (lands on the program under the focused time), ◀▶ step programs, grid scrolls horizontally in 30-min steps to keep focus visible and vertically to keep the row visible. R toggles record (live → record now, future → schedule); S toggles series rule. Starting a second live recording is refused with a toast (one provider stream).

## My DVR screen
- Two columns: list (flex) + 560px side panel (1px left border).
- Header: "My DVR" 48/600 + text tabs Recordings / Scheduled / Series (◀▶ switches). One summary line: "15.4 of 64 GB used · 1 of 1 streams in use".
- List rows 88px: 28px mark column (red dot = recording, ring = unwatched/scheduled), title 28 + muted channel/episode, optional 120×4 progress bar for partly watched, right-aligned time/length. Focus = panel fill + 1px accent outline. Watched titles dim.
- Conflict: a single line with a 3px accent left rule, only when a scheduled show starts before the active recording ends.
- Side panel: preview, title 36, meta line, description, actions at bottom (Play/Resume/Delete; Watch from start/Stop for the live recording; Cancel/Show in guide for scheduled).

## Out of scope for the mockup
Player overlay, empty states for the guide, settings, provider conflict resolution flow.
