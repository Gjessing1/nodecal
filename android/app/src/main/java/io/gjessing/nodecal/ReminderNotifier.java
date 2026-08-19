package io.gjessing.nodecal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Builds and posts the reminder notification, including its action buttons. */
final class ReminderNotifier {
    static final String CHANNEL_ID = "reminders";
    static final String EXTRA_KIND = "nodecal_kind";
    static final String EXTRA_TARGET_ID = "nodecal_target";

    // One id for every reminder: the string tag is what separates them, so a
    // re-fire of the same event replaces its notification instead of stacking.
    private static final int NOTIFICATION_ID = 1;

    private ReminderNotifier() {}

    static void show(Context context, Reminder reminder) {
        createChannel(context);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(reminder.title)
            .setContentText(reminder.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setWhen(reminder.at)
            .setShowWhen(true)
            .setContentIntent(openIntent(context, reminder))
            .addAction(0, context.getString(R.string.reminder_snooze), actionIntent(context, reminder, ReminderReceiver.ACTION_SNOOZE));

        if (reminder.isTask()) {
            builder.addAction(
                0,
                context.getString(R.string.reminder_complete),
                actionIntent(context, reminder, ReminderReceiver.ACTION_COMPLETE)
            );
        }

        // Posting without POST_NOTIFICATIONS is a silent no-op rather than a
        // crash, which is the behaviour we want if the user revoked it later.
        NotificationManagerCompat.from(context).notify(reminder.tag, NOTIFICATION_ID, builder.build());
    }

    /** Replace a posted notification's text without disturbing its actions. */
    static void showFailure(Context context, Reminder reminder, String message) {
        createChannel(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(reminder.title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
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

    private static PendingIntent actionIntent(Context context, Reminder reminder, String action) {
        Intent intent = ReminderReceiver.intentFor(context, reminder, action);
        return PendingIntent.getBroadcast(
            context,
            (action + reminder.key).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.reminder_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.reminder_channel_description));
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
