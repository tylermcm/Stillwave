# StillWave hub design study

Status: design review, 2026-10-28. The user explicitly requested design before implementation. Do not begin hub, multiview or casting implementation or publish a new build until the design direction has been reviewed and the user asks to proceed. The earlier completed personalization/DVR source work is unaffected.

## Product structure

Use four main destinations: **Home**, **Live TV**, **My DVR**, **Discover**. Settings remains secondary. Guide and DVR keep their existing jobs and controls. Multiview is a viewing mode reached from Sports or the player; casting is a shared player action, not another top-level destination.

Mobile retains landscape browsing and the inset left navigation handle. Tap/swipe to reveal the logo and navigation; choosing a destination dismisses the drawer. Do not introduce permanent top navigation on the phone. Fire TV uses visible remote navigation, clear focus, directional movement, Select and Back.

Two home directions are proposed, not selected:

- **Watch first:** a compact featured viewing opportunity, direct access to each Discover module and a path back to the Guide. TV uses a left navigation rail.
- **Daily first:** weather and a short briefing lead, followed by the Discover modules. TV uses a compact top navigation bar. Mobile still uses the concealed side drawer.

Both use StillWave's wave mark, restrained mint accents, dark surfaces, readable labels and a persistent audio mini-player when listening. Mockups follow host appearance in light mode as well. The design study includes optional corner/spacing controls for review.

## Platform modules

| Module | Mobile | Fire TV |
| --- | --- | --- |
| Sports Center | Yes | Yes |
| Radio & Podcasts | Yes | Yes |
| Daily Dashboard | Yes | Yes |
| Local Media | Yes | No |
| Live World | No | Yes |
| Ambient Mode | No | Yes |

Trivia and games remain excluded. Existing Guide/DVR features are retained on both. Multiview and casting remain shared expansions, with actual capabilities to be confirmed on the target devices.

## Interaction designs

- **Sports:** scores and upcoming events with clear live/scheduled status. Watch is offered only when a channel can be matched to the user's guide. Unmatched events show an honest empty watch state. Game details can lead to the channel or Multiview; no team-following/watchlist feature is added.
- **Multiview:** start with two pictures. Selecting a pane changes the audio source; show both a visual selection and an Audio on/Muted label. Expand selected returns to one picture. Device/provider capacity is an implementation constraint, not a promise of four streams.
- **Casting:** show nearby screens in a device chooser, make the selected destination visible in player chrome, and provide disconnect. Keep the receiver choice available from the phone and player. Mock receiver selection does not establish a real connection.
- **Radio & Podcasts:** one destination with Radio/Podcasts tabs, station/episode rows, podcast resume progress and a shared mini-player. Playback state and the content identity determine Play/Pause/Resume labels.
- **Daily Dashboard:** manually chosen city, weather, a short news briefing, today's sports and astronomy. News/astronomy open a readable detail view with eventual source/date attribution. All scores, dates, headlines and weather in the study are sample content, not live data.
- **Mobile Local Media:** start empty, explain that only chosen files appear, open a native file picker, then show recently opened videos/audio. Video opens the player and returns to Local Media; audio uses the common audio controls. This does not imply whole-device scanning or uploading.
- **TV Live World:** a browsable set of camera feeds; opening a feed leads to the player and Back returns to its collection.
- **TV Ambient Mode:** scene selection with optional audio and a clock. The study uses static schematic scenery, not actual camera/video content.
- **Settings:** section visibility belongs in secondary settings alongside the existing preferences. The study shows section choices; final configuration behavior remains part of later implementation.

## Review and acceptance

The editable reference source is checked into [mockups/hub-design-study.html](../mockups/hub-design-study.html). It is an HTML fragment whose icons and variant carousel use the visualization runtime; it is reference material, not app production code or an approved design. The user subsequently requested a Claude design prompt, so do not treat these proposals as the selected direction.

The original interactive response content is at:

`C:/Users/Checkout/.codex/visualizations/2026/10/28/01a18381-dbd2-7203-ba0c-531f23c7925b/stillwave-hub-design.html`

Choose the Home direction, review phone versus TV navigation, and review the content density before implementation. Any future changes should retain the agreed platform split. A portrait mobile browsing change would be a separate design decision; it is not introduced here.

The current startup preferences (Guide, Favorites, last channel) remain the baseline. Whether Home becomes an additional startup option should be settled in design review; the study does not silently replace the installed app's startup behavior.

Prototype checks cover both device feature sets, sports-to-player navigation, casting receiver selection, keyboard movement between multiview panes, audio selection, podcast play/pause, mobile sample-file selection, city selection and a Live World scene. The preview also reflows at 736, 390 and 320 pixels without horizontal overflow. Evidence: artifacts/hub-design-verification.json and design-*.png captures. These are interaction/layout checks of sample content, not native-device tests.

Sources/API access, real media playback, filesystem permissions, provider channel matching, receiver support, hardware capacity, error/loading/offline states and native accessibility behavior still require implementation design and verification. The current prototype is local interaction design only and does not prove those integrations.
