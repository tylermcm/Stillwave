# StillWave logo and splash concept 1

Status: corrected version 2 approved by the user and packaged in signed APK 0.4.3. Version 1 is retained as the original concept.

Asset: `stillwave-mark-v1.png` (transparent PNG). Created with the built-in imagegen tool; original output retained in the Codex generated-images directory. The exact wordmark `StillWave` is composed in code for sharp typography, with pale text for `Still` and seafoam for `Wave`.

Palette: background `#0b0f10`, seafoam `#8fd6c0`, pale text `#e1e8e8`, muted text `#7f8f90`.

Android launcher integration (0.4.4): the approved version 2 mark is also used for adaptive, round and legacy launcher icons on the dark background. `withLauncherIcon.cjs` insets the adaptive foreground drawable 12% to preserve the S under launcher masks without modifying the image. The signed APK contains the generated icon; phone testing is pending.

## Generation prompt

Use case: logo-brand. Create a single original standalone app logo mark for StillWave, a calm live television and DVR player. A simple memorable abstract letter S formed from two smooth horizontal wave ribbons, suggesting a gently moving ocean signal. Flat, vector-like precise rounded geometry, balanced negative space, recognizable at tiny Android app icon size. Solid muted seafoam mint #8fd6c0, with at most a second slightly lighter mint plane. No ocean illustration, no television outline, no play triangle, no gradients, no glow, no shadows, no 3D, no extra symbols. Center one compact mark occupying about 65 percent of a square canvas. Transparent background with real alpha. No words, no letters outside the abstract S symbol, no captions, no mockup objects. This is the logo mark asset; wordmark typography will be composed separately in code.

## Integration

- `expo-splash-screen` 58.0.11 matches the installed Expo SDK's bundled-native-modules version. Plugin config uses the mark on the dark background at image width 168.
- The native launch screen uses the centered mark. The React loading screen adds the wordmark and an indeterminate loading indicator. There is no fixed-duration delay or fake progress percentage.
- The native screen is released when the branded loading image is ready, or when library loading finishes. Library load errors still finish loading and allow the app's error message to appear.
- Review URL: `http://127.0.0.1:8082/?splash=1`. The web-only preview keeps this screen visible and does not run library initialization.
- The next approved APK build must regenerate the native project to include the new dependency/plugin. Do not reuse the existing native project without regenerating it first.
- Native OS launch timing and appearance still need physical-device testing after approval and compilation.

## Orientation correction (version 2)

User approved the direction but said the S looked upside down. The built-in imagegen edit tool produced `stillwave-mark-v2.png` from version 1; both original assets are retained. App splash references now use version 2. No APK compiled.

Edit prompt: Edit this existing StillWave logo asset. The user likes this exact logo but says the S looks upside down. Rotate the existing mark exactly 180 degrees about the canvas center, so its larger, fuller wave becomes the bottom of the S and the smaller wave becomes the top. Preserve the exact ribbon design, proportions, seafoam mint colors, placement, transparent alpha background and square canvas. This is a precise rotation correction, not a redesign. Do not add lettering, icons, shadows, framing or any background. Output only the corrected standalone transparent mark.
