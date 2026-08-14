# Nodecal agent instructions

Follow the engineering and project rules in `CLAUDE.md`.

## Completion

- Run the relevant quality checks before finishing.
- Use Conventional Commits and commit and push completed work unless the user says not to.
- Never claim a deployment or release succeeded without verifying the running result.

## Android releases

- Native Android changes include anything under `android/`, native plugins, permissions, launcher icons, or Capacitor configuration. When those changes are meant to ship, increment both `versionCode` and `versionName` in `android/app/build.gradle`.
- Run `npm run android:release`. This is the required release path: it makes a clean signed release build, publishes it to the live app directory, checks the live version API, downloads the served APK, and verifies its checksum.
- A Gradle version bump, Git push, successful debug build, or Docker deployment alone does not release an APK. Do not say the Android release is finished until the end-to-end command reports the expected live version.
- Never publish `app-debug.apk`. If signing credentials, the live app directory, or the verification endpoint are unavailable, report the release as blocked rather than silently leaving the previous APK live.
