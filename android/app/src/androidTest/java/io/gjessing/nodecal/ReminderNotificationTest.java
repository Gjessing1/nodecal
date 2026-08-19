package io.gjessing.nodecal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The reminder path on a real device, which is the only place it can be checked:
 * the receiver is not exported, so nothing outside the app's own UID can drive
 * it, and org.json plus NotificationManager are both stubs off-device.
 */
@RunWith(AndroidJUnit4.class)
public class ReminderNotificationTest {
    private Context context;
    private NotificationManager manager;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        manager = context.getSystemService(NotificationManager.class);
        grantNotificationPermission();
        clearAll();
    }

    @After
    public void tearDown() {
        clearAll();
    }

    /**
     * Each test run reinstalls the APK, which revokes runtime permissions — and
     * posting without POST_NOTIFICATIONS is a silent no-op, so every assertion
     * below would fail for the wrong reason.
     */
    private void grantNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        InstrumentationRegistry
            .getInstrumentation()
            .getUiAutomation()
            .grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
    }

    /** Every notification call crosses a binder, so none of them is instant. */
    private void clearAll() {
        manager.cancelAll();
        awaitGone("task-1");
    }

    // ── Payload ─────────────────────────────────────────────────────────────

    @Test
    public void parsesTheInstantFormatTheServerSends() throws Exception {
        Reminder reminder = Reminder.fromJson(
            new JSONObject(
                "{\"key\":\"ev-a-1\",\"tag\":\"ev-a\",\"title\":\"Standup\",\"body\":\"09:15\"," +
                "\"at\":\"2026-08-19T09:00:00.000Z\",\"kind\":\"event\",\"targetId\":\"a\"}"
            )
        );
        assertNotNull(reminder);
        assertEquals(1787130000000L, reminder.at);
        assertEquals("ev-a", reminder.tag);
        assertEquals("a", reminder.targetId);
    }

    @Test
    public void survivesTheRoundTripThroughAnIntentExtra() throws Exception {
        Reminder original = new Reminder("k", "t", "Title", "Body", 1787130000000L, "task", "id-1");
        Reminder restored = Reminder.fromJson(new JSONObject(original.toJson().toString()));
        assertNotNull(restored);
        assertEquals(original.key, restored.key);
        assertEquals(original.at, restored.at);
        assertEquals(original.targetId, restored.targetId);
        assertTrue(restored.isTask());
    }

    @Test
    public void dropsAReminderWithNoUsableTime() throws Exception {
        assertNull(Reminder.fromJson(new JSONObject("{\"key\":\"k\",\"at\":\"whenever\"}")));
        assertNull(Reminder.fromJson(new JSONObject("{\"tag\":\"t\"}")));
    }

    // ── Notification ────────────────────────────────────────────────────────

    @Test
    public void aTaskReminderOffersSnoozeAndComplete() {
        ReminderNotifier.show(context, reminder("task"));

        Notification posted = awaitPosted("task-1");
        assertEquals("Renew passport", posted.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("Due: 2026-08-20", posted.extras.getString(Notification.EXTRA_TEXT));
        assertEquals(2, posted.actions.length);
        assertEquals("Snooze 10 min", posted.actions[0].title.toString());
        assertEquals("Complete", posted.actions[1].title.toString());
        assertNotNull(posted.contentIntent);
    }

    /** Nothing can be completed about an event, so it only offers Snooze. */
    @Test
    public void anEventReminderOffersOnlySnooze() {
        ReminderNotifier.show(context, reminder("event"));

        Notification posted = awaitPosted("task-1");
        assertEquals(1, posted.actions.length);
        assertEquals("Snooze 10 min", posted.actions[0].title.toString());
    }

    @Test
    public void theRemindersChannelIsCreatedOnFirstUse() {
        ReminderNotifier.show(context, reminder("event"));
        assertNotNull(manager.getNotificationChannel(ReminderNotifier.CHANNEL_ID));
    }

    @Test
    public void aFailedCompleteLeavesTheNotificationSayingSo() {
        Reminder reminder = reminder("task");
        ReminderNotifier.show(context, reminder);
        ReminderNotifier.showFailure(context, reminder, "Could not reach Nodecal");

        // Both notifications share a tag, so the replacement has to be waited for
        // by its text — the original is already posted under it.
        awaitText("task-1", "Could not reach Nodecal");
    }

    @Test
    public void cancellingRemovesIt() {
        ReminderNotifier.show(context, reminder("task"));
        assertNotNull(awaitPosted("task-1"));

        ReminderNotifier.cancel(context, "task-1");
        awaitGone("task-1");
    }

    private static Reminder reminder(String kind) {
        return new Reminder(
            "task-1-1787130000000",
            "task-1",
            "Renew passport",
            "Due: 2026-08-20",
            1787130000000L,
            kind,
            "demo-1"
        );
    }

    /** Posting is asynchronous across the binder; give it a moment to land. */
    private Notification awaitPosted(String tag) {
        for (int attempt = 0; attempt < 40; attempt++) {
            Notification found = find(tag);
            if (found != null) return found;
            sleepBriefly();
        }
        throw new AssertionError("No notification was posted under tag " + tag);
    }

    private void awaitText(String tag, String expected) {
        String seen = null;
        for (int attempt = 0; attempt < 40; attempt++) {
            Notification found = find(tag);
            seen = found == null ? null : found.extras.getString(Notification.EXTRA_TEXT);
            if (expected.equals(seen)) return;
            sleepBriefly();
        }
        assertEquals(expected, seen);
    }

    private void awaitGone(String tag) {
        for (int attempt = 0; attempt < 40; attempt++) {
            if (find(tag) == null) return;
            sleepBriefly();
        }
        throw new AssertionError("Notification " + tag + " was still posted");
    }

    private static void sleepBriefly() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private Notification find(String tag) {
        for (StatusBarNotification active : manager.getActiveNotifications()) {
            if (tag.equals(active.getTag())) return active.getNotification();
        }
        return null;
    }
}
