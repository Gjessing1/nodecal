package io.gjessing.nodecal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Every reason a reminder needs attention arrives here: its alarm firing, one of
 * its action buttons, or an event that invalidates the whole armed schedule
 * (reboot, reinstall, a timezone change that moves every task reminder).
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "io.gjessing.nodecal.action.REMINDER_FIRE";
    static final String ACTION_SNOOZE = "io.gjessing.nodecal.action.REMINDER_SNOOZE";
    static final String ACTION_DISMISS = "io.gjessing.nodecal.action.REMINDER_DISMISS";
    static final String ACTION_COMPLETE = "io.gjessing.nodecal.action.REMINDER_COMPLETE";
    static final String ACTION_REFRESH = "io.gjessing.nodecal.action.REMINDER_REFRESH";

    private static final String TAG = "NodecalReminder";
    private static final String EXTRA_REMINDER = "nodecal_reminder";

    /** The intent an alarm or action button carries, with the reminder inside it. */
    static Intent intentFor(Context context, Reminder reminder, String action) {
        // A unique data URI keeps two reminders' PendingIntents distinct even if
        // their request codes ever collided — extras alone do not distinguish them.
        Intent intent = new Intent(context, ReminderReceiver.class)
            .setAction(action)
            .setData(Uri.parse("nodecal://reminder/" + Uri.encode(reminder.key)));
        try {
            intent.putExtra(EXTRA_REMINDER, reminder.toJson().toString());
        } catch (JSONException error) {
            Log.w(TAG, "Could not attach reminder " + reminder.key, error);
        }
        return intent;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;

        Context appContext = context.getApplicationContext();
        Reminder reminder = reminderFrom(intent);

        switch (action) {
            case ACTION_FIRE:
                if (reminder == null) return;
                ReminderNotifier.show(appContext, reminder);
                ReminderScheduler.forgetSnoozed(appContext, reminder);
                inBackground(() -> ReminderScheduler.refresh(appContext));
                return;

            case ACTION_SNOOZE:
                if (reminder == null) return;
                ReminderNotifier.cancel(appContext, reminder.tag);
                ReminderScheduler.forgetSnoozed(appContext, reminder);
                ReminderScheduler.snooze(appContext, reminder);
                return;

            // Also the notification's delete intent, so swiping it away and
            // pressing Dismiss clean up identically.
            case ACTION_DISMISS:
                if (reminder == null) return;
                ReminderNotifier.cancel(appContext, reminder.tag);
                ReminderScheduler.forgetSnoozed(appContext, reminder);
                return;

            case ACTION_COMPLETE:
                if (reminder == null || !reminder.isTask()) return;
                completeTask(appContext, reminder);
                return;

            case ACTION_REFRESH:
                inBackground(() -> ReminderScheduler.refresh(appContext));
                return;

            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
            case Intent.ACTION_TIMEZONE_CHANGED:
                // Restore what was armed before asking the server, so a phone that
                // reboots without a connection still keeps today's reminders.
                ReminderScheduler.rearmFromStore(appContext);
                inBackground(() -> ReminderScheduler.refresh(appContext));
                return;

            default:
                Log.w(TAG, "Ignoring unexpected action " + action);
        }
    }

    /**
     * Completing from the notification is the one action that needs the server.
     * A failure leaves the notification in place saying so — silently dismissing
     * it would tell the user the task is done when it is not.
     */
    private void completeTask(Context appContext, Reminder reminder) {
        inBackground(() -> {
            try {
                NodecalHttp.post(appContext, "/api/tasks/" + Uri.encode(reminder.targetId) + "/complete");
                ReminderNotifier.cancel(appContext, reminder.tag);
                ReminderScheduler.forgetSnoozed(appContext, reminder);
                ReminderScheduler.refresh(appContext);
            } catch (Exception error) {
                Log.w(TAG, "Could not complete task " + reminder.targetId, error);
                ReminderNotifier.showFailure(
                    appContext,
                    reminder,
                    appContext.getString(R.string.reminder_complete_failed)
                );
            }
        });
    }

    private static Reminder reminderFrom(Intent intent) {
        String raw = intent.getStringExtra(EXTRA_REMINDER);
        if (raw == null) {
            Log.w(TAG, "Reminder intent carried no payload");
            return null;
        }
        try {
            return Reminder.fromJson(new JSONObject(raw));
        } catch (JSONException error) {
            Log.w(TAG, "Unreadable reminder payload", error);
            return null;
        }
    }

    /** Keep the process alive past onReceive for the network call inside. */
    private void inBackground(Runnable work) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                work.run();
            } finally {
                result.finish();
            }
        }).start();
    }
}
