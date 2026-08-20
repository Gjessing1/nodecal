package io.gjessing.nodecal;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "NodecalNative",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = NodecalNativePlugin.NOTIFICATIONS)
    }
)
public class NodecalNativePlugin extends Plugin {
    static final String NOTIFICATIONS = "notifications";

    private NodecalNavigation navigation;

    @Override
    public void load() {
        String serverUrl = NodecalPreferences.getServerUrl(getContext());
        if (serverUrl != null) navigation = new NodecalNavigation(serverUrl);
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        return navigation != null && navigation.shouldAllow(url) ? false : null;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("serverUrl", NodecalPreferences.getServerUrl(getContext()));
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            result.put("versionCode", PackageInfoCompat.getLongVersionCode(info));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not read app information", error);
        }
    }

    @PluginMethod
    public void configureServer(PluginCall call) {
        String normalized = NodecalPreferences.normalizeServerUrl(call.getString("serverUrl"));
        if (normalized == null) {
            call.reject("Enter a root HTTPS URL, for example https://calendar.example.com");
            return;
        }
        NodecalPreferences.setServerUrl(getContext(), normalized);
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().recreate());
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String raw = call.getString("url");
        Uri uri = raw == null ? null : Uri.parse(raw);
        if (uri == null || (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme()))) {
            call.reject("Only HTTP(S) links can be opened");
            return;
        }
        try {
            getContext().startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception error) {
            call.reject("No app can open this link", error);
        }
    }

    // ── Reminders ───────────────────────────────────────────────────────────
    //
    // Android WebView implements neither the Notification nor the Push API, so
    // the web app cannot deliver a reminder itself the way the PWA does. It
    // hands the decision here instead, and native alarms do the rest.

    @PluginMethod
    public void getReminderStatus(PluginCall call) {
        try {
            call.resolve(ReminderBridge.status(getContext()));
        } catch (Exception error) {
            call.reject("Could not read reminder settings", error);
        }
    }

    /** A partial patch: the web UI sends the one control the user just changed. */
    @PluginMethod
    public void setReminderSettings(PluginCall call) {
        try {
            call.resolve(ReminderBridge.apply(getContext(), call.getData()));
        } catch (Exception error) {
            call.reject("Could not save reminder settings", error);
        }
    }

    /** Sound and vibration stay Android's to own, so hand the user its screen. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        open(call, ReminderChannels.systemSettingsIntent(getContext()));
    }

    @PluginMethod
    public void requestFullScreenPermission(PluginCall call) {
        if (ReminderBridge.fullScreenAllowed(getContext())) {
            call.resolve();
            return;
        }
        open(
            call,
            new Intent(
                Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                Uri.fromParts("package", getContext().getPackageName(), null)
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        );
    }

    private void open(PluginCall call, Intent intent) {
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Android could not open that settings screen", error);
        }
    }

    @PluginMethod
    public void setRemindersEnabled(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("enabled", false))) {
            ReminderScheduler.disable(getContext());
            ReminderStore.setEnabled(getContext(), false);
            ReminderShade.cancelAll(getContext());
            resolveWithStatus(call);
            return;
        }
        if (needsNotificationPermission()) {
            requestPermissionForAlias(NOTIFICATIONS, call, "notificationPermissionResult");
            return;
        }
        enableReminders(call);
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (needsNotificationPermission()) {
            call.reject(getContext().getString(R.string.notification_permission_denied));
            return;
        }
        enableReminders(call);
    }

    /** Post a reminder-shaped notification now, to prove the channel works. */
    @PluginMethod
    public void testReminderNotification(PluginCall call) {
        if (needsNotificationPermission()) {
            requestPermissionForAlias(NOTIFICATIONS, call, "testPermissionResult");
            return;
        }
        showTestNotification(call);
    }

    @PermissionCallback
    private void testPermissionResult(PluginCall call) {
        if (needsNotificationPermission()) {
            call.reject(getContext().getString(R.string.notification_permission_denied));
            return;
        }
        showTestNotification(call);
    }

    private void showTestNotification(PluginCall call) {
        ReminderNotifier.show(
            getContext(),
            new Reminder(
                "test-" + System.currentTimeMillis(),
                "nodecal-test",
                "Nodecal test",
                "Reminders are working on this device.",
                System.currentTimeMillis(),
                "test",
                ""
            )
        );
        call.resolve();
    }

    private void enableReminders(PluginCall call) {
        ReminderStore.setEnabled(getContext(), true);
        ReminderChannels.ensure(getContext());
        ReminderScheduler.refreshAsync(getContext());
        resolveWithStatus(call);
    }

    private void resolveWithStatus(PluginCall call) {
        try {
            call.resolve(ReminderBridge.status(getContext()));
        } catch (Exception error) {
            call.reject("Could not read reminder settings", error);
        }
    }

    /**
     * POST_NOTIFICATIONS is only a runtime permission from Android 13; before
     * that the manifest declaration is the whole story.
     */
    private boolean needsNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false;
        return !NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }
}
