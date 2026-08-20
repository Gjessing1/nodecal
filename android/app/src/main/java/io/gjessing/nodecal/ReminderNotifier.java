package io.gjessing.nodecal;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Builds and posts the reminder notification, including its action buttons. */
final class ReminderNotifier {
    static final String EXTRA_KIND = "nodecal_kind";
    static final String EXTRA_TARGET_ID = "nodecal_target";

    // One id for every reminder: the string tag is what separates them, so a
    // re-fire of the same event replaces its notification instead of stacking.
    private static final int NOTIFICATION_ID = 1;

    // Grouping without a summary of our own: from API 24 the system builds the
    // summary itself, and ours would have to pick one channel while the two
    // reminder kinds can sit on different ones.
    private static final String GROUP_KEY = "io.gjessing.nodecal.reminders";

    private ReminderNotifier() {}

    static void show(Context context, Reminder reminder) {
        ReminderChannels.ensure(context);
        String style = ReminderSettings.styleFor(context, reminder);
        boolean fullScreen = ReminderSettings.STYLE_FULLSCREEN.equals(style);
        boolean silent = ReminderSettings.STYLE_SILENT.equals(style);
        boolean keep = ReminderSettings.keepUntilDismissed(context);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            ReminderChannels.idFor(context, style)
        )
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(reminder.title)
            .setContentText(reminder.body)
            .setPriority(silent ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH)
            .setCategory(fullScreen ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_REMINDER)
            .setGroup(GROUP_KEY)
            .setAutoCancel(!keep)
            .setOngoing(keep)
            .setWhen(reminder.at)
            .setShowWhen(true)
            .setNumber(ReminderShade.postedCount(context, reminder.tag) + 1)
            .setContentIntent(openIntent(context, reminder))
            .setDeleteIntent(actionIntent(context, reminder, ReminderReceiver.ACTION_DISMISS))
            .addAction(
                0,
                context.getString(R.string.reminder_snooze, ReminderSettings.snoozeMinutes(context)),
                actionIntent(context, reminder, ReminderReceiver.ACTION_SNOOZE)
            )
            .addAction(
                0,
                context.getString(R.string.reminder_dismiss),
                actionIntent(context, reminder, ReminderReceiver.ACTION_DISMISS)
            );

        if (reminder.isTask()) {
            builder.addAction(
                0,
                context.getString(R.string.reminder_complete),
                actionIntent(context, reminder, ReminderReceiver.ACTION_COMPLETE)
            );
        }

        // The notification is built in full either way: Android only shows the
        // full-screen activity when the screen is idle or locked, and falls back
        // to this heads-up banner whenever the phone is already in use.
        if (fullScreen) builder.setFullScreenIntent(alarmIntent(context, reminder), true);

        // Posting without POST_NOTIFICATIONS is a silent no-op rather than a
        // crash, which is the behaviour we want if the user revoked it later.
        NotificationManagerCompat.from(context).notify(reminder.tag, NOTIFICATION_ID, builder.build());
    }

    /** Replace a posted notification's text without disturbing its actions. */
    static void showFailure(Context context, Reminder reminder, String message) {
        ReminderChannels.ensure(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            ReminderChannels.idFor(context, ReminderSettings.styleFor(context, reminder))
        )
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(reminder.title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setGroup(GROUP_KEY)
            .setAutoCancel(true)
            .setContentIntent(openIntent(context, reminder));
        NotificationManagerCompat.from(context).notify(reminder.tag, NOTIFICATION_ID, builder.build());
    }

    static void cancel(Context context, String tag) {
        NotificationManagerCompat.from(context).cancel(tag, NOTIFICATION_ID);
    }

    /** Tapping the body opens the app on the event or task that fired. */
    private static PendingIntent openIntent(Context context, Reminder reminder) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("nodecal://open/" + reminder.key))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_KIND, reminder.kind)
            .putExtra(EXTRA_TARGET_ID, reminder.targetId);
        return PendingIntent.getActivity(
            context,
            reminder.requestCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** The full-screen alarm screen, shown over the lock screen. */
    private static PendingIntent alarmIntent(Context context, Reminder reminder) {
        return PendingIntent.getActivity(
            context,
            ("alarm" + reminder.key).hashCode(),
            ReminderAlarmActivity.intentFor(context, reminder),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static PendingIntent actionIntent(Context context, Reminder reminder, String action) {
        Intent intent = ReminderReceiver.intentFor(context, reminder, action);
        return PendingIntent.getBroadcast(
            context,
            (action + reminder.key).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
