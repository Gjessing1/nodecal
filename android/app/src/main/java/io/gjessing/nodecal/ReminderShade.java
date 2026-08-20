package io.gjessing.nodecal;

import android.app.NotificationManager;
import android.content.Context;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;

/** What reminders are on screen right now, and clearing them. */
final class ReminderShade {
    private static final String TAG = "NodecalReminder";

    private ReminderShade() {}

    /**
     * Clear every reminder this app has posted, leaving armed alarms — snoozes
     * included — untouched. Opening the app is the user seeing their calendar,
     * so a launcher badge still counting this morning's reminders is just stale.
     */
    static void cancelAll(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        for (StatusBarNotification posted : ours(manager)) {
            manager.cancel(posted.getTag(), posted.getId());
        }
    }

    static void cancelAllIfEnabled(Context context) {
        if (ReminderSettings.clearOnOpen(context)) cancelAll(context);
    }

    /** How many reminders are posted right now, ignoring `exceptTag`. */
    static int postedCount(Context context, String exceptTag) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return 0;
        int count = 0;
        for (StatusBarNotification posted : ours(manager)) {
            if (!exceptTag.equals(posted.getTag())) count++;
        }
        return count;
    }

    /** getActiveNotifications is already scoped to this app; filter to reminders. */
    private static List<StatusBarNotification> ours(NotificationManager manager) {
        List<StatusBarNotification> mine = new ArrayList<>();
        try {
            for (StatusBarNotification posted : manager.getActiveNotifications()) {
                if (ReminderChannels.isOurs(posted.getNotification().getChannelId())) mine.add(posted);
            }
        } catch (Exception error) {
            // Reported to throw on some OEM builds rather than return an empty list.
            Log.w(TAG, "Could not read posted notifications", error);
        }
        return mine;
    }
}
