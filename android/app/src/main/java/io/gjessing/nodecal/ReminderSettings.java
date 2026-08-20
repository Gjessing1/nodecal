package io.gjessing.nodecal;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * How this device delivers a reminder, as opposed to which reminders there are.
 *
 * These live on the device rather than in settings.json for two reasons: a
 * reminder fires from a BroadcastReceiver with no network and no WebView, so
 * anything it needs has to be readable off local disk; and a lock screen, a
 * launcher badge and a full-screen alert are properties of *this* phone, not of
 * the calendar. They apply the moment they change and ignore Save/Cancel, the
 * same way the reminders toggle beside them already does.
 */
final class ReminderSettings {
    /** Takes over the screen, like an alarm clock. */
    static final String STYLE_FULLSCREEN = "fullscreen";
    /** Heads-up banner — Android's default for a high-importance channel. */
    static final String STYLE_BANNER = "banner";
    /** Lands in the shade with no sound and no banner. */
    static final String STYLE_SILENT = "silent";

    private static final String PREFS = "nodecal_reminder_settings";
    private static final String EVENT_STYLE = "event_style";
    private static final String TASK_STYLE = "task_style";
    private static final String SNOOZE_MINUTES = "snooze_minutes";
    private static final String SHOW_BADGE = "show_badge";
    private static final String CLEAR_ON_OPEN = "clear_on_open";
    private static final String KEEP_UNTIL_DISMISSED = "keep_until_dismissed";
    private static final String ALARM_MODE = "alarm_mode";

    private static final int DEFAULT_SNOOZE_MINUTES = 10;
    private static final int MIN_SNOOZE_MINUTES = 1;
    private static final int MAX_SNOOZE_MINUTES = 720;

    private ReminderSettings() {}

    static String eventStyle(Context context) {
        return normalizeStyle(prefs(context).getString(EVENT_STYLE, STYLE_BANNER));
    }

    static String taskStyle(Context context) {
        return normalizeStyle(prefs(context).getString(TASK_STYLE, STYLE_BANNER));
    }

    /** The style that applies to one reminder. Anything that is not a task — a
     *  test notification included — follows the event style. */
    static String styleFor(Context context, Reminder reminder) {
        return reminder.isTask() ? taskStyle(context) : eventStyle(context);
    }

    /** True when either kind is set to take over the screen. */
    static boolean usesFullScreen(Context context) {
        return STYLE_FULLSCREEN.equals(eventStyle(context)) || STYLE_FULLSCREEN.equals(taskStyle(context));
    }

    static int snoozeMinutes(Context context) {
        return clampSnooze(prefs(context).getInt(SNOOZE_MINUTES, DEFAULT_SNOOZE_MINUTES));
    }

    static long snoozeMillis(Context context) {
        return snoozeMinutes(context) * 60L * 1000L;
    }

    static boolean showBadge(Context context) {
        return prefs(context).getBoolean(SHOW_BADGE, true);
    }

    static boolean clearOnOpen(Context context) {
        return prefs(context).getBoolean(CLEAR_ON_OPEN, true);
    }

    static boolean keepUntilDismissed(Context context) {
        return prefs(context).getBoolean(KEEP_UNTIL_DISMISSED, false);
    }

    static boolean alarmMode(Context context) {
        return prefs(context).getBoolean(ALARM_MODE, false);
    }

    // ── Bridge ──────────────────────────────────────────────────────────────

    static JSONObject toJson(Context context) throws JSONException {
        JSONObject json = new JSONObject();
        json.put("eventStyle", eventStyle(context));
        json.put("taskStyle", taskStyle(context));
        json.put("snoozeMinutes", snoozeMinutes(context));
        json.put("showBadge", showBadge(context));
        json.put("clearOnOpen", clearOnOpen(context));
        json.put("keepUntilDismissed", keepUntilDismissed(context));
        json.put("alarmMode", alarmMode(context));
        return json;
    }

    /**
     * Apply the keys present in `patch` and leave the rest alone, so the web UI
     * can send one changed control rather than the whole set.
     */
    static void applyJson(Context context, JSONObject patch) {
        SharedPreferences.Editor editor = prefs(context).edit();
        if (patch.has("eventStyle")) {
            editor.putString(EVENT_STYLE, normalizeStyle(patch.optString("eventStyle")));
        }
        if (patch.has("taskStyle")) {
            editor.putString(TASK_STYLE, normalizeStyle(patch.optString("taskStyle")));
        }
        if (patch.has("snoozeMinutes")) {
            editor.putInt(SNOOZE_MINUTES, clampSnooze(patch.optInt("snoozeMinutes", DEFAULT_SNOOZE_MINUTES)));
        }
        if (patch.has("showBadge")) editor.putBoolean(SHOW_BADGE, patch.optBoolean("showBadge", true));
        if (patch.has("clearOnOpen")) editor.putBoolean(CLEAR_ON_OPEN, patch.optBoolean("clearOnOpen", true));
        if (patch.has("keepUntilDismissed")) {
            editor.putBoolean(KEEP_UNTIL_DISMISSED, patch.optBoolean("keepUntilDismissed", false));
        }
        if (patch.has("alarmMode")) editor.putBoolean(ALARM_MODE, patch.optBoolean("alarmMode", false));
        // commit, not apply: the caller re-posts notifications and re-arms alarms
        // straight after, and both read these values back immediately.
        editor.commit();
    }

    /** An unknown value from an older or newer client must not silence reminders. */
    private static String normalizeStyle(String value) {
        if (STYLE_FULLSCREEN.equals(value) || STYLE_SILENT.equals(value)) return value;
        return STYLE_BANNER;
    }

    private static int clampSnooze(int minutes) {
        if (minutes < MIN_SNOOZE_MINUTES) return DEFAULT_SNOOZE_MINUTES;
        if (minutes > MAX_SNOOZE_MINUTES) return MAX_SNOOZE_MINUTES;
        return minutes;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
