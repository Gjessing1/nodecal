package io.gjessing.nodecal;

import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Keeps the dated launcher icon on today's date.
 *
 * The icon is one of 32 launcher activity-aliases. Disabling an alias finishes the
 * task it launched, so switching aliases while the app is starting or on screen
 * closes the app under the user. Every switch is therefore deferred until the app
 * is off screen — which is also the only time the launcher icon can be seen.
 */
final class LauncherIconManager {
    static final String ACTION_REFRESH = "io.gjessing.nodecal.action.REFRESH_LAUNCHER_ICON";

    private static final String TAG = "NodecalIcon";
    private static final String DEFAULT_ALIAS = ".LauncherDefault";
    private static final int FIRST_DAY = 1;
    private static final int LAST_DAY = 31;
    private static final int NO_DAY = 0;
    private static final int ALARM_REQUEST_CODE = 1408;

    private static int appliedDay = NO_DAY;

    private LauncherIconManager() {}

    /** The app came to the foreground: only keep the daily alarm alive. */
    static void onAppVisible(Context context) {
        scheduleNextUpdate(context.getApplicationContext());
    }

    /** The app left the screen: switching aliases can no longer disturb anyone. */
    static void onAppHidden(Context context) {
        Context appContext = context.getApplicationContext();
        applyToday(appContext);
        scheduleNextUpdate(appContext);
    }

    /** The daily alarm or a system date change fired. */
    static void refresh(Context context) {
        Context appContext = context.getApplicationContext();
        if (!hasActivityOnScreen()) applyToday(appContext);
        scheduleNextUpdate(appContext);
    }

    /**
     * An overdue alarm is delivered to the process the launcher just started, before
     * the activity reaches onCreate, so a lifecycle flag misses that window. Process
     * importance does not: a process hosting a starting or resumed activity reports
     * IMPORTANCE_FOREGROUND, while one woken only to run this receiver reports
     * IMPORTANCE_SERVICE.
     */
    private static boolean hasActivityOnScreen() {
        ActivityManager.RunningAppProcessInfo state = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(state);
        return state.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }

    private static String aliasForDay(int dayOfMonth) {
        return String.format(Locale.ROOT, ".LauncherDay%02d", dayOfMonth);
    }

    private static void applyToday(Context context) {
        int today = Calendar.getInstance().get(Calendar.DAY_OF_MONTH);
        if (today == appliedDay) return;
        if (today < FIRST_DAY || today > LAST_DAY) {
            Log.w(TAG, "Ignoring invalid day of month: " + today);
            return;
        }

        PackageManager packageManager = context.getPackageManager();
        List<AliasState> changes = new ArrayList<>();
        collectChange(packageManager, component(context, DEFAULT_ALIAS), false, true, changes);
        for (int day = FIRST_DAY; day <= LAST_DAY; day++) {
            collectChange(packageManager, component(context, aliasForDay(day)), day == today, false, changes);
        }

        try {
            applyChanges(packageManager, changes);
            appliedDay = today;
        } catch (RuntimeException error) {
            // The normal application icon remains available if a launcher rejects alias changes.
            Log.w(TAG, "Could not update the dated launcher icon", error);
        }
    }

    private static void applyChanges(PackageManager packageManager, List<AliasState> changes) {
        if (changes.isEmpty()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            List<PackageManager.ComponentEnabledSetting> settings = new ArrayList<>();
            for (AliasState change : changes) {
                settings.add(new PackageManager.ComponentEnabledSetting(
                    change.component,
                    enabledState(change),
                    PackageManager.DONT_KILL_APP
                ));
            }
            packageManager.setComponentEnabledSettings(settings);
            return;
        }

        // Enable today's alias first so older launchers never see a moment with no icon.
        for (AliasState change : changes) {
            if (change.enabled) setEnabled(packageManager, change);
        }
        for (AliasState change : changes) {
            if (!change.enabled) setEnabled(packageManager, change);
        }
    }

    private static void collectChange(
        PackageManager packageManager,
        ComponentName component,
        boolean shouldBeEnabled,
        boolean enabledByDefault,
        List<AliasState> changes
    ) {
        int state = packageManager.getComponentEnabledSetting(component);
        boolean isEnabled = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && enabledByDefault);
        if (isEnabled != shouldBeEnabled) changes.add(new AliasState(component, shouldBeEnabled));
    }

    private static void setEnabled(PackageManager packageManager, AliasState change) {
        packageManager.setComponentEnabledSetting(
            change.component,
            enabledState(change),
            PackageManager.DONT_KILL_APP
        );
    }

    private static int enabledState(AliasState change) {
        if (change.enabled) return PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
        return PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
    }

    private static ComponentName component(Context context, String relativeClassName) {
        return new ComponentName(context.getPackageName(), context.getPackageName() + relativeClassName);
    }

    private static void scheduleNextUpdate(Context context) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager == null) return;

        Calendar nextDay = Calendar.getInstance();
        nextDay.add(Calendar.DAY_OF_YEAR, 1);
        nextDay.set(Calendar.HOUR_OF_DAY, 0);
        nextDay.set(Calendar.MINUTE, 1);
        nextDay.set(Calendar.SECOND, 0);
        nextDay.set(Calendar.MILLISECOND, 0);

        Intent intent = new Intent(context, LauncherIconUpdateReceiver.class).setAction(ACTION_REFRESH);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            ALARM_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC, nextDay.getTimeInMillis(), pendingIntent);
    }

    private static final class AliasState {
        final ComponentName component;
        final boolean enabled;

        AliasState(ComponentName component, boolean enabled) {
            this.component = component;
            this.enabled = enabled;
        }
    }
}
