package io.gjessing.nodecal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * The notification channels reminders are posted to.
 *
 * A channel's importance and badge are user-owned the instant it is created:
 * the app may never change them again, and deleting a channel then recreating
 * it under the same id restores the user's old values rather than the new ones.
 * So the configuration is encoded in the *id* — flipping the badge off posts to
 * a different channel instead of editing the current one.
 *
 * Only the ids actually in use exist at any moment; the rest are deleted, so
 * Android's app-notification screen lists what the user has chosen and nothing
 * else. Sound and vibration are deliberately left to that screen: it is the one
 * place Android lets the user's choice survive an app update.
 */
final class ReminderChannels {
    /** Banner and full-screen styles: IMPORTANCE_HIGH, so it can pop over. */
    private static final String ALERT_BADGE = "rem.v2.alert.badge";
    private static final String ALERT_QUIET_BADGE = "rem.v2.alert.nobadge";
    /** Silent style: IMPORTANCE_LOW, so it lands in the shade only. */
    private static final String QUIET_BADGE = "rem.v2.quiet.badge";
    private static final String QUIET_NOBADGE = "rem.v2.quiet.nobadge";

    /** 0.1.7's single channel, replaced by the matrix above. */
    private static final String LEGACY = "reminders";

    private static final List<String> ALL = Arrays.asList(
        ALERT_BADGE,
        ALERT_QUIET_BADGE,
        QUIET_BADGE,
        QUIET_NOBADGE,
        LEGACY
    );

    private ReminderChannels() {}

    /** The channel a reminder of this style belongs on. */
    static String idFor(Context context, String style) {
        boolean quiet = ReminderSettings.STYLE_SILENT.equals(style);
        boolean badge = ReminderSettings.showBadge(context);
        if (quiet) return badge ? QUIET_BADGE : QUIET_NOBADGE;
        return badge ? ALERT_BADGE : ALERT_QUIET_BADGE;
    }

    static boolean isOurs(String channelId) {
        return ALL.contains(channelId);
    }

    /**
     * Create the channels the current settings need and delete the rest.
     *
     * Called before every post, not just when settings change: a notification
     * sent to a channel that does not exist is dropped without a word.
     */
    static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        List<String> wanted = new ArrayList<>();
        wanted.add(idFor(context, ReminderSettings.eventStyle(context)));
        String taskId = idFor(context, ReminderSettings.taskStyle(context));
        if (!wanted.contains(taskId)) wanted.add(taskId);

        // Create before deleting, so nothing is posted into the gap.
        for (String id : wanted) create(context, manager, id);
        for (String id : ALL) {
            if (!wanted.contains(id) && manager.getNotificationChannel(id) != null) {
                manager.deleteNotificationChannel(id);
            }
        }
    }

    /** Android's own notification settings for the channel events use. */
    static Intent systemSettingsIntent(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, idFor(context, ReminderSettings.eventStyle(context)))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        }
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(Uri.fromParts("package", context.getPackageName(), null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    private static void create(Context context, NotificationManager manager, String id) {
        if (manager.getNotificationChannel(id) != null) return;
        boolean quiet = QUIET_BADGE.equals(id) || QUIET_NOBADGE.equals(id);
        boolean badge = QUIET_BADGE.equals(id) || ALERT_BADGE.equals(id);

        NotificationChannel channel = new NotificationChannel(
            id,
            context.getString(quiet ? R.string.reminder_channel_quiet_name : R.string.reminder_channel_name),
            quiet ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.reminder_channel_description));
        channel.setShowBadge(badge);
        channel.enableVibration(!quiet);
        manager.createNotificationChannel(channel);
    }
}
