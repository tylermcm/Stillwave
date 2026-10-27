# US guide coverage audit

Audited 2026-10-27T22:37:55.309Z. Counts include separate stream entries.

Direct fallback feeds: **743/1485** with current/future listings.
Combined guide including collected supplements: **762/1485**; **723** unmatched.

| Source | With listings | Added coverage |
| --- | ---: | ---: |
| [Pluto US program guide](https://i.mjh.nz/PlutoTV/us.xml.gz) | 278 | 278 |
| [US national and local schedules](https://iptv-epg.org/files/epg-us.xml.gz) | 341 | 300 |
| [Samsung TV Plus US schedules](https://i.mjh.nz/SamsungTVPlus/us.xml.gz) | 183 | 49 |
| [Plex US schedules](https://i.mjh.nz/Plex/us.xml.gz) | 189 | 43 |
| [Roku US schedules](https://i.mjh.nz/Roku/all.xml.gz) | 195 | 16 |
| [PBS local station schedules](https://i.mjh.nz/PBS/all.xml.gz) | 5 | 5 |
| [TVS exact stream schedules](https://www.watchyour.tv/guide.json) | 31 | 31 |
| [US backup schedules](https://epg.pw/xmltv/epg_US.xml.gz) | 204 | 21 |
| [Verified TV Passport station schedules](https://www.tvpassport.com/) | 19 | 19 |

Station identities preserve region, language, subchannel and stream identity. Provider ID aliases come from the iptv-org station catalogs. WatchYour schedules require an exact stream host/path match and consistent published UTC timestamps. TV Passport supplements use exact catalog IDs and the page’s declared time zone; ambiguous DST wall times are skipped.

No program placeholders are generated. An unmatched channel has no verified listing in this run; this does not establish that no schedule exists elsewhere. Full channel assignments, missing list and horizons are in guide-coverage.json. Collector failures are in guide-supplement-audit.json when building supplements.

Run `pnpm guide:build` to fetch current feeds, collect missing TV Passport stations and generate verified XML/XML.gz under artifacts/epg. `--reuse-downloads` is a development option using prior downloads, not a live freshness audit.

Hosted guide is live at https://tylermcm.github.io/Stillwave/stillwave-us.xml.gz and refreshes every six hours through GitHub Actions. Status: https://tylermcm.github.io/Stillwave/status.json. The app now prefers this URL; the direct-source coverage above describes its fallback feeds.

[Collector catalogs](https://github.com/iptv-org/epg) · [IPTV-EPG](https://iptv-epg.org/guides) · [EPG.PW](https://epg.pw/xmltv.html?lang=en)
