# StillWave web app

The web build matches the Android release: touch Guide and My DVR, the default US lineup and the hosted combined guide, loaded on first run. Use it in landscape. Add `?tv=0` to the address for the older Sources screen.

Published at `https://<owner>.github.io/<repo>/` by GitHub Pages. Save it to an iPhone/iPad home screen with Share → Add to Home Screen.

## Limits of a browser
- Local DVR, the recording planner, reminders, Picture-in-Picture and in-app updates are Android-only. Their screens appear but report that recording is unavailable.
- Streams must be `https://` and allow cross-origin playback (CORS). Channels whose servers do not will not play in a browser; they still play in the Android app.
- Data (favorites, hidden channels, preferences, guides) is stored in the browser on that device only.

## Hosting
One Pages site holds the app and the guide files. `refresh-epg.yml` (every six hours) and `deploy-web.yml` (on pushes to `main`) both publish the whole site: the first builds the app alongside the fresh guide, the second carries the live guide files over. Set Settings → Pages → Source to GitHub Actions. The guide status page is at `/guide.html`.

To self-host instead: `pnpm web:build` then `pnpm web:serve` (serves `dist/web`, port 8080).
