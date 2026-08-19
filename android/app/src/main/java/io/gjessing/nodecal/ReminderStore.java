package io.gjessing.nodecal;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * What the device has armed, so it survives a reboot.
 *
 * Alarms do not survive a restart, and the server may be unreachable at boot —
 * a phone that reboots on a plane still owes the user this morning's reminders.
 * Keeping the last schedule on disk means BOOT_COMPLETED can re-arm from it
 * immediately and treat the refresh that follows as an update, not a dependency.
 *
 * Snoozed reminders live in their own list on purpose: reconciling against the
 * server cancels anything the server no longer lists, and a snoozed reminder is
 * by definition in the past and will never appear there again.
 */
final class ReminderStore {
    private static final String TAG = "NodecalReminder";
    private static final String PREFS = "nodecal_reminders";
    private static final String ENABLED = "enabled";
    private static final String SCHEDULED = "scheduled";
    private static final String SNOOZED = "snoozed";

    private ReminderStore() {}

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(ENABLED, enabled).apply();
    }

    static List<Reminder> getScheduled(Context context) {
        return read(context, SCHEDULED);
    }

    static void setScheduled(Context context, List<Reminder> reminders) {
        write(context, SCHEDULED, reminders);
    }

    static List<Reminder> getSnoozed(Context context) {
        return read(context, SNOOZED);
    }

    static void addSnoozed(Context context, Reminder reminder) {
        List<Reminder> snoozed = getSnoozed(context);
        snoozed.add(reminder);
        write(context, SNOOZED, snoozed);
    }

    static void removeSnoozed(Context context, String key) {
        List<Reminder> remaining = new ArrayList<>();
        for (Reminder reminder : getSnoozed(context)) {
            if (!reminder.key.equals(key)) remaining.add(reminder);
        }
        write(context, SNOOZED, remaining);
    }

    /** Everything armed right now — the server schedule plus anything snoozed. */
    static List<Reminder> getAllArmed(Context context) {
        List<Reminder> all = new ArrayList<>(getScheduled(context));
        all.addAll(getSnoozed(context));
        return all;
    }

    static void clear(Context context) {
        prefs(context).edit().remove(SCHEDULED).remove(SNOOZED).apply();
    }

    private static List<Reminder> read(Context context, String name) {
        String raw = prefs(context).getString(name, null);
        if (raw == null) return new ArrayList<>();
        try {
            return Reminder.listFromJson(new JSONArray(raw));
        } catch (JSONException error) {
            Log.w(TAG, "Discarding unreadable " + name + " list", error);
            return new ArrayList<>();
        }
    }

    private static void write(Context context, String name, List<Reminder> reminders) {
        prefs(context).edit().putString(name, Reminder.listToJson(reminders)).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
