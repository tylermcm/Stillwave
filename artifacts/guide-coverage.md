# US guide coverage audit

Audited 2026-10-28T01:39:59.098Z. Counts include separate stream entries.

Direct fallback feeds: **749/1496** with current/future listings.
Combined guide including collected supplements: **827/1496**; **669** unmatched.

| Source | With listings | Added coverage |
| --- | ---: | ---: |
| [Pluto US program guide](https://i.mjh.nz/PlutoTV/us.xml.gz) | 278 | 278 |
| [US national and local schedules](https://iptv-epg.org/files/epg-us.xml.gz) | 345 | 304 |
| [Samsung TV Plus US schedules](https://i.mjh.nz/SamsungTVPlus/us.xml.gz) | 184 | 50 |
| [Plex US schedules](https://i.mjh.nz/Plex/us.xml.gz) | 190 | 44 |
| [Roku US schedules](https://i.mjh.nz/Roku/all.xml.gz) | 195 | 16 |
| [PBS local station schedules](https://i.mjh.nz/PBS/all.xml.gz) | 5 | 5 |
| [TVS exact stream schedules](https://www.watchyour.tv/guide.json) | 31 | 31 |
| [US backup schedules](https://epg.pw/xmltv/epg_US.xml.gz) | 209 | 21 |
| [Verified TV Passport station schedules](https://www.tvpassport.com/) | 36 | 36 |
| [Pluto exact global stream schedules](https://i.mjh.nz/PlutoTV/all.xml.gz) | 15 | 15 |
| [Plex exact global stream schedules](https://i.mjh.nz/Plex/all.xml.gz) | 1 | 1 |
| [Official Cablecast community station schedules](https://www.cablecast.tv/) | 26 | 26 |

Station identities preserve region, language, subchannel and stream identity. Provider ID aliases come from the iptv-org station catalogs and reviewed station overrides. Global Pluto/Plex supplements require exact provider identities; foreign display names cannot create matches. WatchYour and Cablecast require an exact published stream host/path. Cablecast keeps explicit UTC offsets and published end times. TV Passport verifies the station heading and uses its declared IANA zone and duration; ambiguous DST wall times are skipped.

No program placeholders are generated. An unmatched channel has no verified listing in this run; this does not establish that no schedule exists elsewhere. Full channel assignments, missing list and horizons are in guide-coverage.json. Collector results and failures are in guide-supplement-audit.json, guide-provider-audit.json and guide-cablecast-audit.json.

Run `pnpm guide:build` to fetch current feeds, collect missing TV Passport, global provider and Cablecast schedules, and generate verified XML/XML.gz under artifacts/epg. `--reuse-downloads` is a development option using prior downloads, not a live freshness audit.

The Refresh hosted EPG GitHub Actions workflow publishes verified output to https://tylermcm.github.io/Stillwave/stillwave-us.xml.gz every six hours. Check status.json at that host for the actual public generation time. Local builds do not publish automatically.

[Collector catalogs](https://github.com/iptv-org/epg) · [IPTV-EPG](https://iptv-epg.org/guides) · [EPG.PW](https://epg.pw/xmltv.html?lang=en)
