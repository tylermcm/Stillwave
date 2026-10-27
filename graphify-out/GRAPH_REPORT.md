# Graph Report - Stillwave  (2026-10-27)

## Corpus Check
- 97 files · ~216,023 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 468 nodes · 922 edges · 32 communities (25 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `283ae632`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- expo
- scripts
- App.tsx
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
- xmltv.ts
- library.web.ts
- PlannerModule
- Stillwave TV — set-top DVR design spec
- serve-mockups.mjs
- RemindersModule
- compare-tv-layout.py

## God Nodes (most connected - your core abstractions)
1. `Shell()` - 34 edges
2. `Channel` - 17 edges
3. `TvShell()` - 16 edges
4. `react` - 16 edges
5. `installTvDefaults()` - 12 edges
6. `Driver` - 12 edges
7. `parseM3u()` - 11 edges
8. `parseXmltv()` - 11 edges
9. `DvrModule` - 11 edges
10. `Library` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Shell()` --indirect_call--> `downloadFeed()`  [INFERRED]
  App.tsx → src/data/feeds.ts
- `TvShell()` --indirect_call--> `source()`  [INFERRED]
  src/components/tv/TvDvrShell.tsx → tests/guides.test.ts
- `Shell()` --calls--> `normalizeFeedUrl()`  [EXTRACTED]
  App.tsx → src/core/m3u.ts
- `Shell()` --calls--> `parseM3u()`  [EXTRACTED]
  App.tsx → src/core/m3u.ts
- `Shell()` --calls--> `parseXmltv()`  [EXTRACTED]
  App.tsx → src/core/xmltv.ts

## Import Cycles
- None detected.

## Communities (32 total, 7 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.06
Nodes (33): expo, expo-document-picker, expo-file-system, expo-navigation-bar, expo-network, expo-screen-orientation, expo-status-bar, @expo/vector-icons (+25 more)

### Community 1 - "expo"
Cohesion: 0.06
Nodes (31): allowBackup, blockedPermissions, package, versionCode, expo, android, ios, name (+23 more)

### Community 2 - "scripts"
Cohesion: 0.08
Nodes (24): devDependencies, tsx, @types/node, @types/react, typescript, main, name, packageManager (+16 more)

### Community 3 - "App.tsx"
Cohesion: 0.08
Nodes (61): date(), s, Shell(), Tab, time(), GuideSources(), Props, s (+53 more)

### Community 4 - "core.test.ts"
Cohesion: 0.17
Nodes (16): decodeFeed(), attributes(), httpUrl(), inferKind(), normalizeFeedUrl(), parseM3u(), stableId(), titleSeparator() (+8 more)

### Community 5 - "LivePlayer.tsx"
Cohesion: 0.07
Nodes (34): react, buffers, LivePlayer(), PlayerSession(), Props, s, Recordings(), s (+26 more)

### Community 6 - "react"
Cohesion: 0.18
Nodes (10): expo/tsconfig.base, node, **/*.ts, **/*.tsx, compilerOptions, noUncheckedIndexedAccess, strict, types (+2 more)

### Community 7 - "Stillwave"
Cohesion: 0.06
Nodes (28): Compatibility and privacy, Development preview and iPhone, EPG from iptv-org, Explaining playback failures honestly, Install the standalone Android app, Pause, rewind and record, Rebuild the APK on this Windows computer, Source references (+20 more)

### Community 8 - "library.web.ts"
Cohesion: 0.33
Nodes (5): Checkout/runtime, Historical 0.2.0 delivery, Remaining scope, Stillwave current work — October 27, 2026, Verification

### Community 9 - "metro.config.js"
Cohesion: 0.40
Nodes (4): config, escapedRoot, { getDefaultConfig }, localBuildFiles

### Community 10 - "Validation — October 25, 2026"
Cohesion: 0.31
Nodes (5): Bundle, Context, Instrumentation, JSONObject, Driver

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

### Community 24 - "TvDvrShell.tsx"
Cohesion: 0.11
Nodes (34): DVR_COLORS, Props, s, TvDashboard(), Props, s, TvShell(), day() (+26 more)

### Community 25 - "xmltv.ts"
Cohesion: 0.12
Nodes (13): PipHandoff, moveTvFocus(), TvFocus, TvNavigation, TvZone, createGuideMatcher(), guideIds(), normalizeName() (+5 more)

### Community 26 - "library.web.ts"
Cohesion: 0.29
Nodes (8): createLibraryWriter(), SnapshotName, cacheGuideSource(), cacheKey(), loadGuideSource(), loadLibrary(), removeGuideCache(), saveLibrary

### Community 28 - "Stillwave TV — set-top DVR design spec"
Cohesion: 0.33
Nodes (5): Guide screen, My DVR screen, Out of scope for the mockup, Stillwave TV — set-top DVR design spec, Tokens

### Community 29 - "serve-mockups.mjs"
Cohesion: 0.50
Nodes (3): artifacts, mockups, server

## Knowledge Gaps
- **158 isolated node(s):** `Tab`, `s`, `name`, `slug`, `version` (+153 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-screen-orientation` connect `expo` to `LivePlayer.tsx`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `Shell()` (e.g. with `.snapshot()` and `downloadFeed()`) actually correct?**
  _`Shell()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Tab`, `s`, `name` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `expo` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07825507825507826 - nodes in this community are weakly interconnected._