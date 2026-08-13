# Android App Plan

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
                    +-- Native FCM notifications
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

Keep Web Push unchanged for browsers and PWAs. For Android, register an FCM token and add an FCM delivery adapter beside the existing VAPID delivery code. Capacitor's Android push plugin uses Firebase Cloud Messaging and requires `google-services.json`. See [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications).

Native notifications can later gain **Snooze** and **Complete task** actions.

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

Do not schedule every reminder using Android exact alarms initially. The Nodecal server already knows the authoritative calendar state and runs continuously, so FCM should be the primary native reminder transport.

Exact local notifications have additional Android permission and lifecycle rules, particularly from Android 12 onward. See [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications).

A reasonable fallback is to schedule only the next few upcoming reminders locally whenever the app refreshes, while deduplicating them against server pushes.

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

### Phase 1: Foundation (approximately 1-2 days)

- Add Capacitor 8 and the Android project.
- Configure the fixed Nodecal HTTPS URL.
- Add adaptive icons and a splash screen.
- Handle the Android back button and system bars.
- Build and sign a sideloadable release APK.
- Confirm login, updates, offline shell, geolocation, and all views.

### Phase 2: Native notifications (approximately 1-3 days)

- Create/configure the Firebase project and Android registration.
- Add the native notification platform adapter.
- Add server-side FCM subscription storage and delivery.
- Handle notification clicks and deep links.
- Preserve Web Push for the PWA.

### Phase 3: Native value (approximately 2-5 days)

- Add a Today/agenda widget.
- Add launcher shortcuts.
- Add Share to Nodecal.
- Optionally add device-calendar export.

## Development Environment

The development machine already has Node 22, which Capacitor 8 requires. Java, Android Studio/SDK, and `adb` were not installed when this review was performed.

Capacitor currently requires Node 22 and a recent Android Studio. See [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).

Release APKs must be signed. The signing keystore should be backed up securely and kept outside the repository, because Android requires the same signing identity for future in-place updates. See [Android app signing](https://developer.android.com/studio/publish/app-signing).
