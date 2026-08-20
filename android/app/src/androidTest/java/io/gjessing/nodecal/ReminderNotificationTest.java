package io.gjessing.nodecal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
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
    /** Every delivery preference at its shipped default. */
    private static final String DEFAULTS =
        "{\"eventStyle\":\"banner\",\"taskStyle\":\"banner\",\"snoozeMinutes\":10," +
        "\"showBadge\":true,\"clearOnOpen\":true,\"keepUntilDismissed\":false,\"alarmMode\":false}";

    /** A channel that is not ours, to prove the shade sweep is not a cancelAll. */
    private static final String FOREIGN_CHANNEL = "nodecal.test.foreign";

    private Context context;
    private NotificationManager manager;
    private AlarmManager alarms;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        manager = context.getSystemService(NotificationManager.class);
        alarms = context.getSystemService(AlarmManager.class);
        grantNotificationPermission();
        // SharedPreferences outlive the test, so a style set by one case would
        // otherwise decide where the next one posts.
        apply(DEFAULTS);
        clearAll();
    }

    @After
    public void tearDown() throws Exception {
        clearAll();
        manager.deleteNotificationChannel(FOREIGN_CHANNEL);
        ReminderScheduler.disable(context);
        apply(DEFAULTS);
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

    /**
     * Change delivery settings the way the web UI does, minus the re-arm: these
     * tests post notifications and must not leave alarms behind.
     */
    private void apply(String patch) throws Exception {
        ReminderSettings.applyJson(context, new JSONObject(patch));
        ReminderChannels.ensure(context);
    }

    /** Every notification call crosses a binder, so none of them is instant. */
    private void clearAll() {
        manager.cancelAll();
        for (int attempt = 0; attempt < 40; attempt++) {
            if (manager.getActiveNotifications().length == 0) return;
            sleepBriefly();
        }
        throw new AssertionError("Notifications were still posted after cancelAll");
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

    // ── Actions ─────────────────────────────────────────────────────────────

    @Test
    public void aTaskReminderOffersSnoozeDismissAndComplete() {
        ReminderNotifier.show(context, reminder("task"));

        Notification posted = awaitPosted("task-1");
        assertEquals("Renew passport", posted.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("Due: 2026-08-20", posted.extras.getString(Notification.EXTRA_TEXT));
        assertEquals(3, posted.actions.length);
        assertEquals("Snooze 10 min", posted.actions[0].title.toString());
        assertEquals("Dismiss", posted.actions[1].title.toString());
        assertEquals("Complete", posted.actions[2].title.toString());
        assertNotNull(posted.contentIntent);
    }

    /** Nothing can be completed about an event, so it stops at the two. */
    @Test
    public void anEventReminderOffersSnoozeAndDismiss() {
        ReminderNotifier.show(context, reminder("event"));

        Notification posted = awaitPosted("task-1");
        assertEquals(2, posted.actions.length);
        assertEquals("Snooze 10 min", posted.actions[0].title.toString());
        assertEquals("Dismiss", posted.actions[1].title.toString());
    }

    @Test
    public void theSnoozeButtonSaysHowLongItSnoozesFor() throws Exception {
        apply("{\"snoozeMinutes\":30}");
        ReminderNotifier.show(context, reminder("event"));

        assertEquals("Snooze 30 min", awaitPosted("task-1").actions[0].title.toString());
    }

    /** Swiping a reminder away must clean up exactly as Dismiss does. */
    @Test
    public void swipingAwayRunsTheSameCleanupAsDismiss() {
        ReminderNotifier.show(context, reminder("event"));

        assertNotNull(awaitPosted("task-1").deleteIntent);
    }

    @Test
    public void keepingRemindersUntilDismissedMakesThemOngoing() throws Exception {
        ReminderNotifier.show(context, reminder("event"));
        assertEquals(0, awaitPosted("task-1").flags & Notification.FLAG_ONGOING_EVENT);

        clearAll();
        apply("{\"keepUntilDismissed\":true}");
        ReminderNotifier.show(context, reminder("event"));
        assertNotEquals(0, awaitPosted("task-1").flags & Notification.FLAG_ONGOING_EVENT);
    }

    // ── Channels ────────────────────────────────────────────────────────────

    @Test
    public void theChannelAReminderNeedsExistsBeforeItIsPosted() {
        ReminderNotifier.show(context, reminder("event"));

        String channelId = awaitPosted("task-1").getChannelId();
        assertEquals(ReminderChannels.idFor(context, ReminderSettings.STYLE_BANNER), channelId);
        assertNotNull(manager.getNotificationChannel(channelId));
    }

    /** A silent reminder must land in the shade only, which is the channel's job. */
    @Test
    public void theStyleDecidesWhichChannelAReminderPostsTo() throws Exception {
        apply("{\"eventStyle\":\"fullscreen\",\"taskStyle\":\"silent\"}");

        ReminderNotifier.show(context, reminder("task"));
        String quiet = awaitPosted("task-1").getChannelId();
        assertEquals(ReminderChannels.idFor(context, ReminderSettings.STYLE_SILENT), quiet);
        assertEquals(NotificationManager.IMPORTANCE_LOW, manager.getNotificationChannel(quiet).getImportance());

        clearAll();
        ReminderNotifier.show(context, reminder("event"));
        String alert = awaitPosted("task-1").getChannelId();
        assertEquals(ReminderChannels.idFor(context, ReminderSettings.STYLE_FULLSCREEN), alert);
        assertEquals(NotificationManager.IMPORTANCE_HIGH, manager.getNotificationChannel(alert).getImportance());
    }

    /**
     * A channel's badge is the user's the moment it is created and recreating
     * the same id restores their value, so the setting has to move the posting
     * to a different channel — and take the old one off the system screen.
     */
    @Test
    public void turningTheBadgeOffMovesRemindersToAnotherChannel() throws Exception {
        ReminderNotifier.show(context, reminder("event"));
        String badged = awaitPosted("task-1").getChannelId();
        assertTrue(manager.getNotificationChannel(badged).canShowBadge());

        clearAll();
        apply("{\"showBadge\":false}");
        ReminderNotifier.show(context, reminder("event"));

        String plain = awaitPosted("task-1").getChannelId();
        assertNotEquals(badged, plain);
        assertFalse(manager.getNotificationChannel(plain).canShowBadge());
        assertNull("The unused channel must not linger in Android's settings", manager.getNotificationChannel(badged));
    }

    // ── Full screen ─────────────────────────────────────────────────────────

    @Test
    public void aFullScreenReminderCarriesTheAlarmScreen() throws Exception {
        apply("{\"eventStyle\":\"fullscreen\"}");
        ReminderNotifier.show(context, reminder("event"));

        Notification posted = awaitPosted("task-1");
        if (ReminderBridge.fullScreenAllowed(context)) {
            assertNotNull(posted.fullScreenIntent);
        } else {
            // Android 14 can withhold the grant. The reminder must then still
            // arrive as an ordinary heads-up notification, not vanish.
            assertNotNull(posted.contentIntent);
        }
    }

    @Test
    public void aBannerReminderCarriesNoAlarmScreen() throws Exception {
        apply("{\"eventStyle\":\"banner\"}");
        ReminderNotifier.show(context, reminder("event"));

        assertNull(awaitPosted("task-1").fullScreenIntent);
    }

    // ── Shade ───────────────────────────────────────────────────────────────

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

    /** Opening the app clears reminders, and nothing else Nodecal has posted. */
    @Test
    public void clearingTheShadeLeavesOtherNotificationsAlone() {
        postForeignNotification();
        ReminderNotifier.show(context, reminder("task"));
        assertNotNull(awaitPosted("task-1"));

        ReminderShade.cancelAll(context);

        awaitGone("task-1");
        assertNotNull("A notification on another channel is not ours to clear", find("foreign-1"));
    }

    /** The setting is what the launcher counter is read from. */
    @Test
    public void everyPostedReminderRaisesTheCounter() {
        ReminderNotifier.show(context, reminder("event"));
        assertEquals(1, awaitPosted("task-1").number);

        ReminderNotifier.show(context, reminder("event", "task-2"));
        assertEquals(2, awaitPosted("task-2").number);
    }

    @Test
    public void openingTheAppClearsRemindersOnlyWhenAskedTo() throws Exception {
        apply("{\"clearOnOpen\":false}");
        ReminderNotifier.show(context, reminder("event"));
        assertNotNull(awaitPosted("task-1"));

        ReminderShade.cancelAllIfEnabled(context);
        assertNotNull("Clearing is opt-out, and it was opted out of", find("task-1"));

        apply("{\"clearOnOpen\":true}");
        ReminderShade.cancelAllIfEnabled(context);
        awaitGone("task-1");
    }

    // ── Alarms ──────────────────────────────────────────────────────────────

    /**
     * Alarm mode buys immunity from Doze by posting a real alarm clock, and the
     * whole cost of that is the system's next-alarm indicator — so seeing it
     * appear is the test. Snooze is used to arm one: it is the only path that
     * needs no server.
     */
    @Test
    public void alarmModeTakesOverTheSystemNextAlarmIndicator() throws Exception {
        ReminderStore.setEnabled(context, true);
        AlarmManager.AlarmClockInfo before = alarms.getNextAlarmClock();

        apply("{\"alarmMode\":false,\"snoozeMinutes\":60}");
        ReminderScheduler.snooze(context, reminder("event"));
        assertEquals("An exact alarm must stay out of the indicator", before, alarms.getNextAlarmClock());

        apply("{\"alarmMode\":true}");
        ReminderScheduler.snooze(context, reminder("event"));

        AlarmManager.AlarmClockInfo next = alarms.getNextAlarmClock();
        assertNotNull(next);
        assertNotEquals(before, next);
        assertTrue(next.getTriggerTime() > System.currentTimeMillis());
        assertNotNull("Tapping the indicator must lead back into Nodecal", next.getShowIntent());
    }

    private void postForeignNotification() {
        manager.createNotificationChannel(
            new NotificationChannel(FOREIGN_CHANNEL, "Foreign", NotificationManager.IMPORTANCE_LOW)
        );
        manager.notify(
            "foreign-1",
            99,
            new NotificationCompat.Builder(context, FOREIGN_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Not a reminder")
                .build()
        );
        awaitPosted("foreign-1");
    }

    private static Reminder reminder(String kind) {
        return reminder(kind, "task-1");
    }

    private static Reminder reminder(String kind, String tag) {
        return new Reminder(
            tag + "-1787130000000",
            tag,
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
