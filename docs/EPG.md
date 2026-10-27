# StillWave program guides

`pnpm guide:build` downloads the US lineup and all configured guides, collects missing stations with exact TV Passport catalog IDs, and builds:

- `artifacts/epg/stillwave-us.xml.gz` — compact combined guide
- `artifacts/epg/stillwave-us.xml` — uncompressed guide
- `artifacts/epg/manifest.json` — generation time and per-stream source provenance
- `artifacts/guide-coverage.json` / `.md` — coverage, missing channels and schedule horizons
- `artifacts/guide-supplement-audit.json` — collector attempts and failures

The generated XML is parsed again before replacing the last successful output. Failed default sources stop publication of a replacement bundle. Individual supplement failures are recorded; successful stations are retained. The script does not publish files or create a scheduled task.

## Matching and collection

The app first loads `https://tylermcm.github.io/Stillwave/stillwave-us.xml.gz`, refreshing every six hours. Useful cached hosted listings survive an outage. If no usable hosted guide is available, it installs the independent Pluto, IPTV-EPG US, Samsung TV Plus US, Plex US, Roku US, PBS, WatchYour/TVS and EPG.PW feeds. Unpinned old default caches stop automatic large downloads after a successful hosted upgrade; manually mapped sources keep their refresh settings. Large XML is streamed with input/expanded limits; only relevant programs are cached.

`pnpm guide:catalog` refreshes exact station aliases from the iptv-org catalogs. Aliases ignore picture-quality suffixes but preserve region, language and subchannels. Plex station IDs survive guide-container changes. Plus-channel names remain distinct from their ordinary channels. PBS bare-callsign matches require a primary PBS stream hostname; DT2/DT4 are excluded.

TV Passport collection runs on the build machine, only for currently missing stations. It uses the page's declared IANA time zone and published durations. Nonexistent/repeated DST wall times are rejected rather than guessed. Three daily pages are collected per selected station, sequentially with a request delay. Captchas, HTTP failures and layout changes are recorded as failures.

WatchYour matches the playlist stream hostname/path against the provider's exact playout URL, excluding expiring query tokens. Published UTC timestamps must agree with the provider's date/time fields; exact stop seconds take precedence over rounded durations. Some TVS listings have raw asset names rather than polished titles; those names come from the source.

The bundle uses stable per-stream IDs derived from the M3U parser. This separates alternate streams with the same TVG ID and survives the app's playlist ID namespace. Use the updated app source for this identity support. Existing signed APKs do not include it.

## Complete gap audit

The catalog audit reads channel configuration files as data. It does not execute downloaded collector code. Obtain the public catalog checkout if absent:

```powershell
git clone --depth 1 https://github.com/iptv-org/epg.git .build-tmp/epg-collectors
pnpm guide:audit
```

`artifacts/guide-gap-audit.json` and `.md` list every channel, verified coverage, exact collector candidates, name-only candidates and official broadcaster websites. A candidate is not counted as coverage until real, correctly timed listings are retrieved. A missing catalog entry does not prove the broadcaster publishes no schedule. Closed/replaced metadata is retained for review and never automatically removes a stream.

`--reuse-downloads` is for development using earlier downloads. It is not a current-feed freshness check. Ordinary builds always download current sources.

## Hosting and refreshes

For local inspection, run `pnpm guide:serve`. It serves only the generated XML, compressed XML and manifest on `127.0.0.1:8790`. `pnpm guide:serve --lan` exposes those three files to the local network. It does not change firewall settings. The PC must remain on for a local-network URL to work.

The `Refresh hosted EPG` GitHub Actions workflow builds at 00:23, 06:23, 12:23 and 18:23 UTC and publishes only verified output through GitHub Pages. It can also be dispatched manually. A failed build does not replace the last public guide. Public status is at `https://tylermcm.github.io/Stillwave/status.json`. Scheduled runs can be delayed by GitHub; the status timestamp shows the actual generation time.

`services/epg/stage.mjs` stages only the collector's source dependency graph with a small independent npm lockfile; the hosted job does not install the mobile/Expo toolchain. Actions run Node 24 with pinned action revisions. Publication rejects invalid/old timestamps, mismatched station counts and unexpectedly low coverage. This hosting does not rebuild or replace the signed APK.

Station data sources: [iptv-org catalogs](https://github.com/iptv-org/epg), [i.mjh.nz](https://github.com/matthuisman/i.mjh.nz), [IPTV-EPG](https://iptv-epg.org/guides), [EPG.PW](https://epg.pw/xmltv.html?lang=en), [WatchYour.TV](https://www.watchyour.tv/guide.json), [TV Passport](https://www.tvpassport.com/).
