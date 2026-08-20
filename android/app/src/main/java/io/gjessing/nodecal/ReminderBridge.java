package io.gjessing.nodecal;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import java.util.Iterator;
import org.json.JSONException;
import org.json.JSONObject;

/** What the web UI needs to know about reminders, and what it may change. */
final class ReminderBridge {
    private ReminderBridge() {}

    /**
     * Everything the Notifications section renders from: whether reminders are
     * on, what Android is allowing, and the current delivery preferences.
     */
    static JSObject status(Context context) throws JSONException {
        JSObject result = new JSObject();
        result.put("enabled", ReminderStore.isEnabled(context));
        result.put("permissionGranted", NotificationManagerCompat.from(context).areNotificationsEnabled());
        result.put("scheduled", ReminderStore.getScheduled(context).size());
        result.put("fullScreenAllowed", fullScreenAllowed(context));
        result.put("exactAlarmsAllowed", exactAlarmsAllowed(context));

        JSONObject settings = ReminderSettings.toJson(context);
        for (Iterator<String> keys = settings.keys(); keys.hasNext(); ) {
            String key = keys.next();
            result.put(key, settings.get(key));
        }
        return result;
    }

    /**
     * Apply a settings patch and make it take effect at once: the channel matrix
     * follows the styles and the badge, and switching alarm mode has to re-arm,
     * because the alarm type is fixed when an alarm is set, not when it fires.
     */
    static JSObject apply(Context context, JSONObject patch) throws JSONException {
        boolean alarmModeBefore = ReminderSettings.alarmMode(context);
        ReminderSettings.applyJson(context, patch);
        ReminderChannels.ensure(context);
        if (ReminderSettings.alarmMode(context) != alarmModeBefore) {
            ReminderScheduler.rearmFromStore(context);
        }
        return status(context);
    }

    /**
     * From Android 14 a full-screen intent needs the user's say-so unless the
     * app is a clock or a dialler; below that the manifest declaration is enough.
     */
    static boolean fullScreenAllowed(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return manager == null || manager.canUseFullScreenIntent();
    }

    private static boolean exactAlarmsAllowed(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        return manager == null || manager.canScheduleExactAlarms();
    }
}
