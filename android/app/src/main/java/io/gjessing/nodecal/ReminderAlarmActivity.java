package io.gjessing.nodecal;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import java.util.Date;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The full-screen alert, for reminders whose style asks to take over the screen.
 *
 * It is launched by the notification's full-screen intent, not directly: Android
 * decides between this and a heads-up banner based on whether the screen is
 * already in use, which is the behaviour an alarm clock has and a banner alone
 * cannot imitate. Every button here delegates to {@link ReminderReceiver}, so
 * snoozing from the lock screen and snoozing from the shade are the same code.
 *
 * Back deliberately just closes it: the notification stays posted, so an
 * accidental press cannot lose the reminder.
 */
public class ReminderAlarmActivity extends AppCompatActivity {
    private static final String TAG = "NodecalReminder";
    private static final String EXTRA_REMINDER = "nodecal_alarm_reminder";

    private Reminder reminder;

    static Intent intentFor(Context context, Reminder reminder) {
        Intent intent = new Intent(context, ReminderAlarmActivity.class)
            // A unique data URI keeps two alarms' PendingIntents distinct.
            .setData(Uri.parse("nodecal://alarm/" + Uri.encode(reminder.key)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            intent.putExtra(EXTRA_REMINDER, reminder.toJson().toString());
        } catch (JSONException error) {
            Log.w(TAG, "Could not attach reminder " + reminder.key, error);
        }
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_reminder_alarm);
        findViewById(R.id.alarm_snooze).setOnClickListener(view -> act(ReminderReceiver.ACTION_SNOOZE));
        findViewById(R.id.alarm_dismiss).setOnClickListener(view -> act(ReminderReceiver.ACTION_DISMISS));
        findViewById(R.id.alarm_open).setOnClickListener(view -> open());
        bind(getIntent());
    }

    /** singleInstance: a second reminder firing replaces the one on screen. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bind(intent);
    }

    private void bind(Intent intent) {
        reminder = reminderFrom(intent);
        if (reminder == null) {
            finish();
            return;
        }
        text(R.id.alarm_time, DateFormat.getTimeFormat(this).format(new Date(reminder.at)));
        text(R.id.alarm_title, reminder.title);
        text(R.id.alarm_body, reminder.body);
        findViewById(R.id.alarm_body).setVisibility(reminder.body.isEmpty() ? View.GONE : View.VISIBLE);
        ((TextView) findViewById(R.id.alarm_snooze))
            .setText(getString(R.string.reminder_snooze, ReminderSettings.snoozeMinutes(this)));
    }

    private void act(String action) {
        if (reminder != null) sendBroadcast(ReminderReceiver.intentFor(this, reminder, action));
        finish();
    }

    private void open() {
        if (reminder != null) {
            startActivity(
                new Intent(this, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .setData(Uri.parse("nodecal://open/" + reminder.key))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra(ReminderNotifier.EXTRA_KIND, reminder.kind)
                    .putExtra(ReminderNotifier.EXTRA_TARGET_ID, reminder.targetId)
            );
            sendBroadcast(ReminderReceiver.intentFor(this, reminder, ReminderReceiver.ACTION_DISMISS));
        }
        finish();
    }

    /**
     * Wake the screen and draw over the keyguard. The setters exist from API 27;
     * below that the equivalent window flags are the only way, and they are
     * deprecated rather than removed above it.
     */
    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguard = getSystemService(KeyguardManager.class);
            if (keyguard != null) keyguard.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }

    private void text(int id, String value) {
        ((TextView) findViewById(id)).setText(value);
    }

    private Reminder reminderFrom(Intent intent) {
        String raw = intent == null ? null : intent.getStringExtra(EXTRA_REMINDER);
        if (raw == null) return null;
        try {
            return Reminder.fromJson(new JSONObject(raw));
        } catch (JSONException error) {
            Log.w(TAG, "Unreadable alarm payload", error);
            return null;
        }
    }
}
