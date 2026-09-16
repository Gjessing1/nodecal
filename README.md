# Nodecal

Nodecal is a self-hosted, mobile-first CalDAV calendar and task client. It runs in a browser as a PWA and is also available as a private Android app that connects to your Nodecal server.

## Download the Android app

Open this address on the Android device, replacing the example host with your Nodecal host:

```text
https://calendar.example.com/api/app/download
```

Android may ask you to allow your browser to install apps from this source. After installation, open Nodecal and enter the root HTTPS URL of the server, such as `https://calendar.example.com`. The choice is stored on the device and can later be changed under **Settings → Android app**.

### Pocket ID and Bitwarden passkeys

Passkey requests run in WebView's WebAuthn browser mode (APK 0.1.10 and later): the WebView builds the request for the Pocket ID page it is showing, so the passkey is asserted for the Pocket ID site's own HTTPS origin exactly as it would be in a browser. Bitwarden passkeys require Android 14 or later; in Bitwarden, open **Settings → Autofill → Passkey management** and select Bitwarden as the preferred passkey provider. Also keep Android System WebView current.

The first passkey login from the app stops with Bitwarden reporting that the browser (Nodecal) is not recognized. Tap **Trust**, then choose the passkey: Bitwarden adds the package and its signing certificate to its locally trusted privileged apps, and later logins go straight through. Trust belongs to the signing certificate, so an APK signed with a different key (a debug build, say) has to be trusted separately.

No `/.well-known/assetlinks.json` is involved. WebAuthn's app mode, which Digital Asset Links would authorise, asserts the passkey for the app's `android:apk-key-hash:` origin instead of the website's, and Pocket ID only accepts its own HTTPS origin — Bitwarden refuses app mode with "Passkeys not supported for this app" when the asset links are missing, and Pocket ID rejects the login when they are present.

The download answers with `404 Not Found` until the server administrator publishes the first APK. You can always use the web app instead: visit the Nodecal URL in Chrome and choose **Add to Home screen**.

## Android updates

The Android container loads Nodecal from the selected server, so calendar UI and server changes arrive with normal server deployments. A new APK is only needed when the native Android container, permissions, icons, or native plugins change.

When a newer APK is published, the app shows a **Download** notice and also lists it under **Settings → Android app**. The download opens in the system browser so Android can verify and install it. Keep the signing keystore safe: every update must use the same key.

## Publish an Android release

Requirements are Node.js 22.12+, a JDK, and an Android SDK. On this host the SDK environment is loaded automatically from `/home/gjessing/android-sdk/env.sh`; elsewhere, export `ANDROID_HOME` and `JAVA_HOME`.

Create `~/.config/nodecal/keystore.env` with the release-signing values (do not commit this file):

```bash
export NODECAL_KEYSTORE_FILE=/absolute/path/to/nodecal-release.jks
export NODECAL_KEYSTORE_PASSWORD='...'
export NODECAL_KEY_ALIAS='nodecal'
export NODECAL_KEY_PASSWORD='...'
```

For every native release, increment `versionCode` and update `versionName` in `android/app/build.gradle`, then run the end-to-end release command:

```bash
npm ci
npm run android:release
```

This command reads the version from Gradle, makes a clean release-signed build, publishes it, confirms the live `/api/app/version` response, downloads the served APK, and verifies its checksum. It defaults to this host's live Compose config directory when present, or `/mnt/data/nodecal/config/app` when that path is backed by the expected `tank/data/nodecal` dataset. Set `NODECAL_ANDROID_APP_DIR` and `NODECAL_ANDROID_VERIFY_URL` for another deployment. A native release is not complete until this command succeeds; committing or building a debug APK does not publish an update.

The server exposes public metadata at `/api/app/version` and the current APK at `/api/app/download`.

For local development, build the debug APK with:

```bash
npm run android:build:debug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Do not publish debug-signed builds; Android cannot install them over a release-signed app.

## Run the server

Copy the required values into `.env` (`CALDAV_BASEURL`, `CALDAV_USERNAME`, and `CALDAV_PASSWORD`), then use:

```bash
npm install
npm run build
npm start
```

For local web development, `npm run dev` starts the watched API server on port 3000 and Vite on port 5173.

Docker users can use the included `docker-compose.yml`; it exposes Nodecal on host port `3042` and persists configuration under `/mnt/data/nodecal/config`. Create both `/mnt/data/nodecal/config` and `/mnt/data/nodecal/cache` first; Compose deliberately refuses to create missing bind-mount directories on the root filesystem.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
