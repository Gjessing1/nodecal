package io.gjessing.nodecal;

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

final class LauncherIconManager {
    static final String ACTION_REFRESH = "io.gjessing.nodecal.action.REFRESH_LAUNCHER_ICON";

    private static final String TAG = "NodecalIcon";
    private static final String DEFAULT_ALIAS = ".LauncherDefault";
    private static final int FIRST_DAY = 1;
    private static final int LAST_DAY = 31;
    private static final int ALARM_REQUEST_CODE = 1408;

    private LauncherIconManager() {}

    static void updateAndSchedule(Context context) {
        Context appContext = context.getApplicationContext();
        update(appContext, Calendar.getInstance().get(Calendar.DAY_OF_MONTH));
        scheduleNextUpdate(appContext);
    }

    static void update(Context context, int dayOfMonth) {
        if (dayOfMonth < FIRST_DAY || dayOfMonth > LAST_DAY) {
            Log.w(TAG, "Ignoring invalid day of month: " + dayOfMonth);
            return;
        }

        PackageManager packageManager = context.getPackageManager();
        List<AliasState> changes = new ArrayList<>();
        collectChange(packageManager, component(context, DEFAULT_ALIAS), false, true, changes);
        for (int day = FIRST_DAY; day <= LAST_DAY; day++) {
            collectChange(
                packageManager,
                component(context, aliasForDay(day)),
                day == dayOfMonth,
                false,
                changes
            );
        }
        if (changes.isEmpty()) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                List<PackageManager.ComponentEnabledSetting> settings = new ArrayList<>();
                for (AliasState change : changes) {
                    settings.add(new PackageManager.ComponentEnabledSetting(
                        change.component,
                        change.enabled
                            ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                        PackageManager.DONT_KILL_APP
                    ));
                }
                packageManager.setComponentEnabledSettings(settings);
            } else {
                // Enable today's alias first so older launchers never see a moment with no icon.
                for (AliasState change : changes) {
                    if (change.enabled) setEnabled(packageManager, change);
                }
                for (AliasState change : changes) {
                    if (!change.enabled) setEnabled(packageManager, change);
                }
            }
        } catch (RuntimeException error) {
            // The normal application icon remains available if a launcher rejects alias changes.
            Log.w(TAG, "Could not update the dated launcher icon", error);
        }
    }

    static String aliasForDay(int dayOfMonth) {
        return String.format(Locale.ROOT, ".LauncherDay%02d", dayOfMonth);
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
            change.enabled
                ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP
        );
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
