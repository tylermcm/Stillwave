# Graph Report - Stillwave  (2026-10-28)

## Corpus Check
- 173 files · ~454,267 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 857 nodes · 1819 edges · 57 communities (49 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a2c93b4d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- expo
- scripts
- tvDvr.ts
- core.test.ts
- LivePlayer.tsx
- react
- Stillwave
- library.web.ts
- metro.config.js
- Validation — October 25, 2026
- fixture-server.mjs
- INSTALL.md
- export-check.mjs
- blockedPermissions
- ROADMAP.md
- package.json
- verify-dvr-bundle.mjs
- AppErrorBoundary.tsx
- TvDvrShell.tsx
- guides.test.ts
- library.web.ts
- PlannerModule
- Stillwave TV — set-top DVR design spec
- serve-mockups.mjs
- RemindersModule
- compare-tv-layout.py
- guides.ts
- Context
- xmltv.ts
- library.ts
- .parse
- reminders.ts
- DvrEngine.kt
- package.json
- DvrService
- TvRemote
- GuideSources.tsx
- .engine
- compilerOptions
- DvrServer
- stage.mjs
- StillWave logo and splash concept 1
- StillWave program guides
- prepare-public.mjs
- serve-guide.mjs
- refresh-us-channel-metadata.mjs
- guide-coverage.md
- guide-gap-audit.md
- types.ts

## God Nodes (most connected - your core abstractions)
1. `Shell()` - 40 edges
2. `Channel` - 36 edges
3. `TvShell()` - 27 edges
4. `react` - 21 edges
5. `RecordingPlanner` - 18 edges
6. `createGuideMatcher()` - 18 edges
7. `parseM3u()` - 17 edges
8. `installTvDefaults()` - 16 edges
9. `createGuideView()` - 15 edges
10. `canonicalGuideId()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Shell()` --indirect_call--> `playlist()`  [INFERRED]
  App.tsx → tests/channelNumbers.test.ts
- `scheduleWallTime()` --indirect_call--> `time()`  [INFERRED]
  src/core/tvPassportGuide.ts → App.tsx
- `Shell()` --indirect_call--> `downloadGuide()`  [INFERRED]
  App.tsx → src/data/guideFeeds.ts
- `Shell()` --indirect_call--> `cacheGuideSource()`  [INFERRED]
  App.tsx → src/data/library.ts
- `Shell()` --indirect_call--> `removeGuideCache()`  [INFERRED]
  App.tsx → src/data/library.ts

## Import Cycles
- None detected.

## Communities (57 total, 8 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.06
Nodes (35): expo, expo-document-picker, expo-file-system, expo-navigation-bar, expo-network, expo-screen-orientation, expo-splash-screen, expo-status-bar (+27 more)

### Community 1 - "expo"
Cohesion: 0.06
Nodes (35): backgroundColor, foregroundImage, adaptiveIcon, allowBackup, blockedPermissions, package, versionCode, expo (+27 more)

### Community 2 - "scripts"
Cohesion: 0.06
Nodes (35): devDependencies, tsx, @types/node, @types/react, typescript, tsx, main, name (+27 more)

### Community 3 - "tvDvr.ts"
Cohesion: 0.22
Nodes (7): File, FileProvider, Context, Module, String, StillwaveUpdatesModule, UpdateFileProvider

### Community 4 - "core.test.ts"
Cohesion: 0.20
Nodes (3): PipHandoff, { addPipStopHandler, addMediaDependency }, require

### Community 5 - "LivePlayer.tsx"
Cohesion: 0.06
Nodes (35): react, AppErrorBoundary, s, buffers, LivePlayer(), PlayerSession(), Props, s (+27 more)

### Community 6 - "react"
Cohesion: 0.18
Nodes (10): expo/tsconfig.base, node, **/*.ts, **/*.tsx, compilerOptions, noUncheckedIndexedAccess, strict, types (+2 more)

### Community 7 - "Stillwave"
Cohesion: 0.05
Nodes (34): Android app updates and channel management, Phone and TV channel menu, Publishing the next update, Compatibility and privacy, Development preview and iPhone, EPG from iptv-org, Explaining playback failures honestly, Install the standalone Android app (+26 more)

### Community 8 - "library.web.ts"
Cohesion: 0.07
Nodes (26): Branding orientation correction, Build authorized: 0.4.3 / versionCode 10 (in progress), Channel-by-channel audit and combined guide (2026-10-27, latest), Checkout/runtime, Current mobile player: supplied screenshot layout, Current signed APK: 0.4.2 / versionCode 9 â€” shared TV interface, Current signed APK: 0.4.3 / versionCode 10, Current source update: channel browsing preferences (+18 more)

### Community 9 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, escapedRoot, { getDefaultConfig }, localBuildFiles

### Community 10 - "Validation — October 25, 2026"
Cohesion: 0.30
Nodes (6): Bundle, Exception, Instrumentation, Driver, Context, JSONObject

### Community 18 - "blockedPermissions"
Cohesion: 0.33
Nodes (5): directory, files, requests, server, started

### Community 19 - "ROADMAP.md"
Cohesion: 0.40
Nodes (4): Accepted feature backlog, DVR milestones, Foundation and library improvements, Next steps for Stillwave

### Community 20 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 21 - "verify-dvr-bundle.mjs"
Cohesion: 0.22
Nodes (7): files, map, maps, matched, native, nativeFiles, tvFiles

### Community 22 - "AppErrorBoundary.tsx"
Cohesion: 0.22
Nodes (14): enterChannelDigit(), findNumberedChannel(), validNumber(), withChannelNumbers(), addPlaylist(), removePlaylist(), restoreLibrary(), retainReferences() (+6 more)

### Community 24 - "TvDvrShell.tsx"
Cohesion: 0.05
Nodes (69): ChannelNumberPad(), keys, s, TouchTvList(), s, TvChannelSearch(), AnimatedPressable, DVR_COLORS (+61 more)

### Community 25 - "guides.test.ts"
Cohesion: 0.17
Nodes (12): ProgramBrowser(), Props, s, programIndex(), searchPrograms(), adjacentChannel(), previousChannel(), rememberChannel() (+4 more)

### Community 26 - "library.web.ts"
Cohesion: 0.27
Nodes (9): createLibraryWriter(), SnapshotName, cacheGuideSource(), cacheKey(), loadGuideSource(), loadLibrary(), removeGuideCache(), saveLibrary (+1 more)

### Community 28 - "Stillwave TV — set-top DVR design spec"
Cohesion: 0.33
Nodes (5): Guide screen, My DVR screen, Out of scope for the mockup, Stillwave TV — set-top DVR design spec, Tokens

### Community 29 - "serve-mockups.mjs"
Cohesion: 0.50
Nodes (3): artifacts, mockups, server

### Community 30 - "RemindersModule"
Cohesion: 0.14
Nodes (15): Boolean, BroadcastReceiver, Context, Intent, JSONObject, List, Module, PendingIntent (+7 more)

### Community 32 - "guides.ts"
Cohesion: 0.14
Nodes (27): date(), hideNativeSplash(), s, Shell(), Tab, time(), LaunchSplash(), s (+19 more)

### Community 33 - "Context"
Cohesion: 0.20
Nodes (12): BroadcastReceiver, Context, Intent, JSONObject, List, Module, PendingIntent, String (+4 more)

### Community 34 - "xmltv.ts"
Cohesion: 0.06
Nodes (70): main(), main(), collectCablecastGuide(), collectGuideSupplements(), collectProviderGuides(), CatalogStation, parseStationCatalog(), downloadGuideFile() (+62 more)

### Community 35 - "library.ts"
Cohesion: 0.39
Nodes (7): cacheFile(), cacheGuideSource(), libraryFile(), loadGuideSource(), loadLibrary(), removeGuideCache(), saveLibrary

### Community 36 - ".parse"
Cohesion: 0.22
Nodes (10): Long, DvrSegment, Hls, HlsPlaylist, HlsSegment, Boolean, List, Map (+2 more)

### Community 37 - "reminders.ts"
Cohesion: 0.33
Nodes (3): RemindersModule, requestReminderNotifications(), syncReminders()

### Community 38 - "DvrEngine.kt"
Cohesion: 0.30
Nodes (14): Any, HttpURLConnection, hasActiveCapture(), Boolean, Map, String, open(), prepareRecording() (+6 more)

### Community 39 - "package.json"
Cohesion: 0.13
Nodes (14): dependencies, fflate, saxes, tsx, engines, node, fflate, saxes (+6 more)

### Community 40 - "DvrService"
Cohesion: 0.19
Nodes (7): IBinder, Int, DvrService, Intent, Notification, PowerManager, Service

### Community 41 - "TvRemote"
Cohesion: 0.20
Nodes (7): KeyEvent, Boolean, Module, String, StillwaveTvModule, TvRemote, Unit

### Community 42 - "GuideSources.tsx"
Cohesion: 0.33
Nodes (4): GuideSources(), Props, s, SavedPlaylist

### Community 43 - ".engine"
Cohesion: 0.31
Nodes (5): DvrEngine, DvrRuntime, Context, Module, StillwaveDvrModule

### Community 44 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, esModuleInterop, module, moduleResolution, resolveJsonModule, strict, target

### Community 46 - "DvrServer"
Cohesion: 0.29
Nodes (3): DvrServer, String, Socket

### Community 47 - "stage.mjs"
Cohesion: 0.33
Nodes (4): copied, output, root, service

### Community 48 - "StillWave logo and splash concept 1"
Cohesion: 0.40
Nodes (4): Generation prompt, Integration, Orientation correction (version 2), StillWave logo and splash concept 1

### Community 49 - "StillWave program guides"
Cohesion: 0.40
Nodes (4): Complete gap audit, Hosting and refreshes, Matching and collection, StillWave program guides

### Community 50 - "prepare-public.mjs"
Cohesion: 0.40
Nodes (4): directory, manifest, publicStatus, xml

### Community 51 - "serve-guide.mjs"
Cohesion: 0.50
Nodes (3): files, port, server

### Community 57 - "types.ts"
Cohesion: 0.31
Nodes (8): moveTvFocus(), TvDigit, TvFocus, TvNavigation, TvZone, usesRemotePlayer(), usesTvLayout(), nav

## Knowledge Gaps
- **243 isolated node(s):** `Tab`, `s`, `name`, `slug`, `version` (+238 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `scripts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `expo-screen-orientation` connect `expo` to `guides.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `Shell()` (e.g. with `.snapshot()` and `downloadFeed()`) actually correct?**
  _`Shell()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Tab`, `s`, `name` to the rest of the system?**
  _244 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `expo` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.059379217273954114 - nodes in this community are weakly interconnected._