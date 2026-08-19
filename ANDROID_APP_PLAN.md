# Android App Plan

## Implementation Status

Phase 1 is now implemented as a Capacitor 8 Android project under `android/`:

- [x] Native first-run server setup with a device-persisted HTTPS origin.
- [x] Runtime server switching under **Settings → Android app** without rebuilding the APK.
- [x] Same-origin hosted Nodecal UI, cookie authentication, service worker, and external-link isolation.
- [x] Connection-error recovery with retry or server reconfiguration.
- [x] Release-signing build script and self-hosted APK publication script.
- [x] Atlas-style version endpoint, startup update notice, and stable direct-download URL.
- [x] Adaptive icon and splash artwork derived from the existing Nodecal calendar icon.
- [x] Native notification delivery with Snooze and Complete actions (Phase 2).
- [ ] Widget, shortcuts, and calendar integration (Phase 3).

Unlike Atlas, Nodecal does not need a separate JavaScript OTA bundle: the Android WebView loads the hosted Nodecal client, so normal server deployment is already its lightweight update channel. The part reused from Atlas is the native update path—monotonic Android `versionCode`, server-published release metadata, and a browser-assisted APK install.

The best fit is a Capacitor Android app that loads the existing hosted Nodecal instance.

Because the APK is private, the server is owned and controlled by the same person, and Nodecal already has strong PWA/offline infrastructure, the recommended first version is the simpler remote-hosted model. This preserves the current same-origin API calls, cookie authentication, service worker, and instant web deployments while providing a real Android container with access to Kotlin and native plugins.

## Why Capacitor

| Approach                     | APK | Native capabilities | Nodecal fit                                          |
| ---------------------------- | --- | ------------------- | ---------------------------------------------------- |
| Trusted Web Activity         | Yes | Limited             | Easy, but essentially the existing PWA               |
| Capacitor, remote-hosted     | Yes | Full                | Best personal/private option                         |
| Capacitor, bundled frontend  | Yes | Full                | Best public/productized option, but more refactoring |
| Flutter/React Native rewrite | Yes | Full                | Unnecessary duplication                              |

A Trusted Web Activity renders through the user's browser, and its host app cannot directly access web state such as cookies or `localStorage`. That makes meaningful web/native integration awkward. See [Google's TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity).

Capacitor provides an Android runtime with a JavaScript-to-Kotlin bridge and supports custom native code. See the [Capacitor Android documentation](https://capacitorjs.com/docs/android).

One caveat: Capacitor documents remote `server.url` as intended for live reload, not production. For a public store app, the frontend should therefore be bundled. For a private APK using a controlled server, the tradeoff is reasonable if it is locked down carefully. See [Capacitor configuration](https://capacitorjs.com/docs/config).

## Why It Matches Nodecal

Nodecal currently assumes everything is same-origin:

- The client has about 40 direct `fetch('/api/...')` calls, for example in `client/app/main.js`.
- Authentication uses a strict same-origin cookie in `server/middleware/auth.js`.
- Express separately serves `public`, `client`, and `rrule` assets in `server/app.js`.
- The service worker caches the shell and API snapshots and handles Web Push in `public/service-worker.js`.
- The server already performs background CalDAV synchronization and reminder scheduling in `server/app.js`.

Loading the hosted HTTPS origin inside Capacitor means all of that can continue working without introducing CORS, a second API authentication system, or rewriting every fetch call.

It also means normal UI changes remain web deployments. The APK only needs to be rebuilt and reinstalled when Android-native code, permissions, icons, or plugins change.

## Recommended Architecture

```text
Shared Nodecal web application
            |
            +-- Browser -- PWA manifest + service worker + Web Push
            |
            +-- Capacitor Android container
                    +-- Native reminders (AlarmManager, no cloud)
                    +-- Android widget
                    +-- Calendar integration
                    +-- Shortcuts and share targets
                    +-- Kotlin plugins when needed
```

Add a narrow platform layer such as `client/app/platform.js`. The rest of the application should not need to know whether it is running in Chrome, as a PWA, or in Capacitor.

That layer would handle:

- `isNativeAndroid()`
- Notification registration
- Android back button
- Status and navigation bars
- Haptics
- Deep links
- Sharing
- Device calendar calls
- Widget snapshot updates

Web implementations should remain no-ops or use the existing browser APIs.

## Capabilities Worth Adding

### 1. Native notifications

Web Push is unchanged for browsers and PWAs. It cannot serve the Android app at all: WebView implements neither the Notifications API nor the Push API, so `PushManager` and `window.Notification` are simply absent there.

Android reminders are therefore delivered natively. The server publishes the window ahead at `GET /api/reminders/upcoming`, and the app arms one exact `AlarmManager` alarm per reminder, re-arming on resume, on each fire, on boot, on a timezone change, and on a twice-daily backstop. Notifications carry **Snooze** and, for tasks, **Complete**.

No Firebase, no `google-services.json`, no Play Services: a push service would put every event title through a third party and contradict Nodecal's "no external cloud dependencies" premise, and it would deliver nothing offline. Local alarms fire with no network at all.

### 2. Today/agenda home-screen widget

This is probably the most noticeable real-app improvement for a calendar. The web app can write a compact event/task snapshot through a custom plugin, and an Android widget can read it. Tapping an item should deep-link into Nodecal.

Android supports both glance-style information widgets and interactive collection widgets. See [Android widget guidance](https://developer.android.com/develop/ui/views/appwidgets/overview).

### 3. Device calendar integration

Capacitor 8 has an official calendar plugin that can create, find, modify, and remove Android calendar events. See [Capacitor Calendar](https://capacitorjs.com/docs/apis/calendar).

Initially, provide explicit actions such as **Add to device calendar** or **Open in system calendar**. Full automatic mirroring could create duplicates if DAVx5 or another CalDAV sync client is already in use.

### 4. App shortcuts and share target

Useful long-press launcher shortcuts would include:

- New event
- New task
- Today
- Agenda

An Android share target could turn selected text into Nodecal's existing NLP event/task parser.

### 5. Privacy and polish

Add screenshot/recent-app protection, proper system-bar colors, adaptive icons, a splash screen, haptics, and Android back-navigation handling.

### 6. True offline writes

The current service worker deliberately provides read-only cached data. Offline creation and editing would require an operation queue, conflict handling, and replay. That would be valuable, but it is a separate data-consistency project rather than a basic APK feature.

## Notification Strategy

The server owns _what_ to remind about — it already holds the synced calendar and computes the same alarms for Web Push — and the device owns _when_. That split keeps one reminder definition (`server/push/reminders.js`) feeding both transports, and it is what lets a reminder fire with no connectivity: once an alarm is armed, nothing needs to reach the server for it to go off.

Exact alarms carry permission rules from Android 12 onward. Nodecal declares `USE_EXACT_ALARM`, the install-time grant intended for calendar and alarm apps, so reminders never wait on a settings round trip; `SCHEDULE_EXACT_ALARM` covers API 31–32, and below 31 no permission is needed. `POST_NOTIFICATIONS` is requested at runtime from the Settings toggle rather than on first launch.

The armed schedule is persisted, so a reboot re-arms from the last known list before the network is consulted — a phone that restarts offline still gets the morning's reminders.

## Security for the Remote-Hosted Model

Because remote JavaScript can invoke enabled native plugins, the Android origin is more privileged than an ordinary website. The implementation should therefore:

- Require HTTPS with a valid certificate.
- Pin navigation to the one Nodecal host.
- Disable cleartext and mixed content.
- Include only the native plugins actually used.
- Add a restrictive Content Security Policy.
- Open unrelated external links in the system browser.
- Keep Android permissions minimal.
- Avoid embedding passwords, bearer tokens, or server secrets in the APK.

The current same-origin cookie login can remain. If Nodecal sits behind external SSO, its login/navigation flow needs testing inside Android WebView; troublesome identity-provider pages can be handed to a browser/custom tab.

## Suggested Delivery Phases

### Phase 1: Foundation (implemented)

- Add Capacitor 8 and the Android project. ✓
- Configure a runtime-selectable Nodecal HTTPS URL. ✓
- Add adaptive icons and a splash screen. ✓
- Handle the Android back button and system bars. ✓ (Capacitor/browser history baseline)
- Add repeatable release-signing and publishing tooling. ✓
- Sign and publish the first release APK. (Requires the operator's permanent keystore.)
- Complete credentialed smoke testing of every view and offline behavior.

### Phase 2: Native notifications (implemented)

- Publish the upcoming-reminder window from the server. ✓
- Arm and reconcile exact alarms natively. ✓
- Post notifications with Snooze and Complete actions. ✓
- Handle notification taps as deep links into the event or task. ✓
- Preserve Web Push for the PWA. ✓

### Phase 3: Native value (approximately 2-5 days)

- Add a Today/agenda widget.
- Add launcher shortcuts.
- Add Share to Nodecal.
- Optionally add device-calendar export.

## Development Environment

The development machine has Node 22, a JDK, and an Android SDK. Source `/home/gjessing/android-sdk/env.sh` before using SDK commands directly; the provided build script does this automatically when that file exists.

Capacitor currently requires Node 22 and a recent Android Studio. See [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

Release APKs must be signed. The signing keystore should be backed up securely and kept outside the repository, because Android requires the same signing identity for future in-place updates. See [Android app signing](https://developer.android.com/studio/publish/app-signing).
