package io.gjessing.nodecal;

import android.util.Log;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * One reminder from GET /api/reminders/upcoming.
 *
 * `key` is unique per fire instant — it is what an alarm is armed and cancelled
 * under. `tag` is stable across re-fires, so a replacement notification lands on
 * top of the previous one instead of stacking beside it.
 */
final class Reminder {
    static final String KIND_TASK = "task";

    private static final String TAG = "NodecalReminder";

    final String key;
    final String tag;
    final String title;
    final String body;
    final long at;
    final String kind;
    final String targetId;

    Reminder(String key, String tag, String title, String body, long at, String kind, String targetId) {
        this.key = key;
        this.tag = tag;
        this.title = title;
        this.body = body;
        this.at = at;
        this.kind = kind;
        this.targetId = targetId;
    }

    /** A copy of this reminder that fires later, under its own alarm identity. */
    Reminder rescheduledTo(long newAt, String keySuffix) {
        return new Reminder(key + keySuffix, tag, title, body, newAt, kind, targetId);
    }

    boolean isTask() {
        return KIND_TASK.equals(kind);
    }

    /** Distinct per reminder, so two armed alarms can never share a PendingIntent. */
    int requestCode() {
        return key.hashCode();
    }

    // ── JSON ────────────────────────────────────────────────────────────────

    /** The server emits Date#toISOString(), which always has this exact shape. */
    private static SimpleDateFormat instantFormat() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format;
    }

    static Reminder fromJson(JSONObject json) {
        String key = json.optString("key", null);
        String at = json.optString("at", null);
        if (key == null || at == null) return null;
        try {
            Date instant = instantFormat().parse(at);
            if (instant == null) return null;
            return new Reminder(
                key,
                json.optString("tag", key),
                json.optString("title", "Nodecal"),
                json.optString("body", ""),
                instant.getTime(),
                json.optString("kind", ""),
                json.optString("targetId", "")
            );
        } catch (ParseException error) {
            Log.w(TAG, "Ignoring reminder with unreadable time: " + at);
            return null;
        }
    }

    JSONObject toJson() throws JSONException {
        JSONObject json = new JSONObject();
        json.put("key", key);
        json.put("tag", tag);
        json.put("title", title);
        json.put("body", body);
        json.put("at", instantFormat().format(new Date(at)));
        json.put("kind", kind);
        json.put("targetId", targetId);
        return json;
    }

    /** Malformed entries are dropped rather than failing the whole schedule. */
    static List<Reminder> listFromJson(JSONArray array) {
        List<Reminder> reminders = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json == null) continue;
            Reminder reminder = fromJson(json);
            if (reminder != null) reminders.add(reminder);
        }
        return reminders;
    }

    static String listToJson(List<Reminder> reminders) {
        JSONArray array = new JSONArray();
        for (Reminder reminder : reminders) {
            try {
                array.put(reminder.toJson());
            } catch (JSONException error) {
                Log.w(TAG, "Could not store reminder " + reminder.key, error);
            }
        }
        return array.toString();
    }
}
