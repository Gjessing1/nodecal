package io.gjessing.nodecal;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
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
        JSObject result = new JSObject();
        result.put("enabled", ReminderStore.isEnabled(getContext()));
        result.put("permissionGranted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        result.put("scheduled", ReminderStore.getScheduled(getContext()).size());
        call.resolve(result);
    }

    @PluginMethod
    public void setRemindersEnabled(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("enabled", false))) {
            ReminderScheduler.disable(getContext());
            ReminderStore.setEnabled(getContext(), false);
            call.resolve(status(false));
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
        ReminderScheduler.refreshAsync(getContext());
        call.resolve(status(true));
    }

    private JSObject status(boolean enabled) {
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("permissionGranted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        return result;
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
