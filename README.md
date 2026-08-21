# Nodecal

Nodecal is a self-hosted, mobile-first CalDAV calendar and task client. It runs in a browser as a PWA and is also available as a private Android app that connects to your Nodecal server.

## Download the Android app

Open this address on the Android device, replacing the example host with your Nodecal host:

```text
https://calendar.example.com/api/app/download
```

Android may ask you to allow your browser to install apps from this source. After installation, open Nodecal and enter the root HTTPS URL of the server, such as `https://calendar.example.com`. The choice is stored on the device and can later be changed under **Settings → Android app**.

### Pocket ID and Bitwarden passkeys

APK version 0.1.2 and later enables Android Credential Manager inside the hosted WebView so TinyAuth can complete a Pocket ID passkey login. Bitwarden passkeys require Android 14 or later. In Bitwarden, open **Settings → Autofill → Passkey management** and select Bitwarden as the preferred passkey provider. Also keep Android System WebView current.

Android requires the Pocket ID relying-party domain to associate the website with the installed Nodecal app. Serve `/.well-known/assetlinks.json` from the Pocket ID domain with the package name and SHA-256 fingerprint of the release signing certificate:

```json
[
  {
    "relation": [
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds"
    ],
    "target": {
      "namespace": "android_app",
      "package_name": "io.gjessing.nodecal",
      "sha256_cert_fingerprints": ["RELEASE_CERTIFICATE_SHA256"]
    }
  }
]
```

The URL must return `200 OK` directly (no redirect) with `Content-Type: application/json`. A debug APK has a different certificate fingerprint; add a separate entry while testing it. Nodecal uses WebAuthn's app mode because browser mode is reserved for browser packages explicitly trusted by each credential provider, and an ordinary private APK cannot safely claim arbitrary website origins.

You can obtain the certificate fingerprint with `keytool -list -v -keystore /path/to/nodecal-release.jks -alias nodecal`; use the value labeled `SHA256`.

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

This command reads the version from Gradle, makes a clean release-signed build, publishes it, confirms the live `/api/app/version` response, downloads the served APK, and verifies its checksum. It defaults to this host's live Compose config directory when present, with `/mnt/data/nodecal/config/app` as the generic fallback. Set `NODECAL_ANDROID_APP_DIR` and `NODECAL_ANDROID_VERIFY_URL` for another deployment. A native release is not complete until this command succeeds; committing or building a debug APK does not publish an update.

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

Docker users can use the included `docker-compose.yml`; it exposes Nodecal on host port `3042` and persists configuration under `/mnt/data/nodecal/config`.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
