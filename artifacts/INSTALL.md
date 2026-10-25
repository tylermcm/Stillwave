# Install Stillwave on Android

1. Copy `Stillwave-0.1.0.apk` to your phone using USB, a file-transfer app, or your preferred private storage.
2. Open the APK in your phone's Files/Downloads app. If Android asks, allow that file manager to install this app.
3. Open **Stillwave**, choose **Add your playlist**, and import your M3U URL or file.
4. In **Sources**, add an XMLTV `.xml` / `.xml.gz` guide URL or file.

The APK runs on ARM Android phones with Android 7.0 or newer. It includes the app, assets and native video engine. You do not need a web server, Expo Go, an Expo account, or a running computer. Channels and URL-based guides still need an internet connection to their providers.

This is the first personal build. Verify your channels on the phone; long playback sessions, device codecs and network recovery have not yet been tested on physical hardware. Use **Diagnose** in the player when a channel will not open.

Future updates must use the same signing key. The key and its credentials are kept locally in `private/android-signing/`, outside Git and outside the APK.