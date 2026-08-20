package io.gjessing.nodecal;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import java.util.List;
import org.json.JSONObject;

/**
 * Arms one exact alarm per upcoming reminder.
 *
 * The server owns *what* to remind about — it already holds the synced calendar
 * and computes alarms for Web Push — so the device only asks for the window
 * ahead and owns *when*. That split is what lets a reminder fire with no network:
 * once an alarm is armed, nothing needs to reach the server for it to go off.
 */
final class ReminderScheduler {
    private static final String TAG = "NodecalReminder";
    private static final int WINDOW_HOURS = 48;
    // Comfortably inside the window above, so a phone that is never opened still
    // re-arms long before the armed alarms run out.
    private static final long BACKSTOP_MS = 12 * 60 * 60 * 1000;
    private static final int BACKSTOP_REQUEST_CODE = 1409;
    private static final String SNOOZE_SUFFIX = "#snooze";
    private static final int ALARM_SHOW_REQUEST_CODE = 1410;

    private ReminderScheduler() {}

    /** {@link #refresh} off the caller's thread — it makes a network request. */
    static void refreshAsync(Context context) {
        Context appContext = context.getApplicationContext();
        if (!ReminderStore.isEnabled(appContext)) return;
        new Thread(() -> refresh(appContext)).start();
    }

    /**
     * Fetch the window ahead and reconcile the armed alarms against it.
     *
     * Synchronized because two refreshes genuinely race: an alarm firing starts
     * one while the user opening the app starts another, and interleaving their
     * read-reconcile-write of the stored schedule could cancel an alarm the
     * other had just armed.
     */
    static synchronized void refresh(Context context) {
        Context appContext = context.getApplicationContext();
        if (!ReminderStore.isEnabled(appContext)) return;

        List<Reminder> fresh;
        try {
            String body = NodecalHttp.get(appContext, "/api/reminders/upcoming?hours=" + WINDOW_HOURS);
            fresh = Reminder.listFromJson(new JSONObject(body).getJSONArray("reminders"));
        } catch (Exception error) {
            // Offline, or the session lapsed. The alarms already armed stay armed —
            // dropping them here would turn a network blip into a missed reminder.
            Log.w(TAG, "Could not refresh reminders: " + error.getMessage());
            scheduleBackstop(appContext);
            return;
        }

        for (Reminder previous : ReminderStore.getScheduled(appContext)) {
            if (!containsKey(fresh, previous.key)) cancel(appContext, previous);
        }
        long now = System.currentTimeMillis();
        for (Reminder reminder : fresh) {
            if (reminder.at > now) arm(appContext, reminder);
        }
        ReminderStore.setScheduled(appContext, fresh);
        scheduleBackstop(appContext);
        Log.i(TAG, "Armed " + fresh.size() + " reminder(s)");
    }

    /**
     * Re-arm from the stored schedule without touching the network. A reboot
     * clears every alarm, and the server is often unreachable in the seconds
     * after one, so the last known schedule is restored first and refreshed after.
     */
    static void rearmFromStore(Context context) {
        Context appContext = context.getApplicationContext();
        if (!ReminderStore.isEnabled(appContext)) return;
        long now = System.currentTimeMillis();
        for (Reminder reminder : ReminderStore.getAllArmed(appContext)) {
            if (reminder.at > now) arm(appContext, reminder);
        }
        scheduleBackstop(appContext);
    }

    /** Re-arm the same reminder a few minutes out, with no server round trip. */
    static void snooze(Context context, Reminder reminder) {
        Context appContext = context.getApplicationContext();
        long firesAt = System.currentTimeMillis() + ReminderSettings.snoozeMillis(appContext);
        Reminder snoozed = reminder.rescheduledTo(firesAt, SNOOZE_SUFFIX + firesAt);
        ReminderStore.addSnoozed(appContext, snoozed);
        arm(appContext, snoozed);
    }

    static void forgetSnoozed(Context context, Reminder reminder) {
        if (reminder.key.contains(SNOOZE_SUFFIX)) {
            ReminderStore.removeSnoozed(context.getApplicationContext(), reminder.key);
        }
    }

    /** Cancel everything and forget the schedule. */
    static void disable(Context context) {
        Context appContext = context.getApplicationContext();
        for (Reminder reminder : ReminderStore.getAllArmed(appContext)) cancel(appContext, reminder);
        cancelBackstop(appContext);
        ReminderStore.clear(appContext);
    }

    // ── Alarms ──────────────────────────────────────────────────────────────

    private static void arm(Context context, Reminder reminder) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager == null) return;
        PendingIntent pending = firePendingIntent(context, reminder, PendingIntent.FLAG_UPDATE_CURRENT);
        if (!canScheduleExact(alarmManager)) {
            // USE_EXACT_ALARM should make this unreachable; a late reminder still
            // beats none if a future Android revokes it.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.at, pending);
        } else if (ReminderSettings.alarmMode(context)) {
            // The one alarm type Doze never defers or rate-limits. Everything
            // else, setExactAndAllowWhileIdle included, is capped at roughly one
            // per nine minutes, so two reminders close together means the second
            // arrives late. The price is the system next-alarm indicator, which
            // this takes over from the user's clock app — hence opt-in.
            alarmManager.setAlarmClock(new AlarmManager.AlarmClockInfo(reminder.at, showIntent(context)), pending);
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.at, pending);
        }
    }

    /** Where the system's next-alarm indicator sends the user when tapped. */
    private static PendingIntent showIntent(Context context) {
        return PendingIntent.getActivity(
            context,
            ALARM_SHOW_REQUEST_CODE,
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void cancel(Context context, Reminder reminder) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        PendingIntent pending = firePendingIntent(context, reminder, PendingIntent.FLAG_NO_CREATE);
        if (pending == null) return;
        if (alarmManager != null) alarmManager.cancel(pending);
        pending.cancel();
    }

    private static PendingIntent firePendingIntent(Context context, Reminder reminder, int flags) {
        return PendingIntent.getBroadcast(
            context,
            reminder.requestCode(),
            ReminderReceiver.intentFor(context, reminder, ReminderReceiver.ACTION_FIRE),
            flags | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static boolean canScheduleExact(AlarmManager alarmManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return alarmManager.canScheduleExactAlarms();
    }

    private static void scheduleBackstop(Context context) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager == null) return;
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + BACKSTOP_MS,
            backstopIntent(context, PendingIntent.FLAG_UPDATE_CURRENT)
        );
    }

    private static void cancelBackstop(Context context) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        PendingIntent pending = backstopIntent(context, PendingIntent.FLAG_NO_CREATE);
        if (pending == null) return;
        if (alarmManager != null) alarmManager.cancel(pending);
        pending.cancel();
    }

    private static PendingIntent backstopIntent(Context context, int flags) {
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(ReminderReceiver.ACTION_REFRESH);
        return PendingIntent.getBroadcast(
            context,
            BACKSTOP_REQUEST_CODE,
            intent,
            flags | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static boolean containsKey(List<Reminder> reminders, String key) {
        for (Reminder reminder : reminders) {
            if (reminder.key.equals(key)) return true;
        }
        return false;
    }
}
