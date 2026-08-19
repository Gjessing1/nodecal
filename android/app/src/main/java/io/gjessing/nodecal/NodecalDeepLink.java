package io.gjessing.nodecal;

import android.content.Intent;
import com.getcapacitor.Bridge;
import org.json.JSONObject;

/**
 * Opens the event or task a reminder notification was about.
 *
 * A tap can arrive long before the web app exists — on a cold start the activity
 * is created, the WebView begins loading the hosted UI, and only then is there a
 * window.nodecalOpen to call. So the target is held until the page reports ready
 * rather than evaluated on arrival.
 */
final class NodecalDeepLink {
    private final MainActivity activity;

    private String kind;
    private String targetId;
    private boolean pageReady;

    NodecalDeepLink(MainActivity activity) {
        this.activity = activity;
    }

    /** Take the target out of a launch intent, if it carried one. */
    void accept(Intent intent) {
        if (intent == null) return;
        String nextKind = intent.getStringExtra(ReminderNotifier.EXTRA_KIND);
        String nextTarget = intent.getStringExtra(ReminderNotifier.EXTRA_TARGET_ID);
        if (nextKind == null || nextTarget == null || nextTarget.isEmpty()) return;

        kind = nextKind;
        targetId = nextTarget;
        // Consume it, so a rotation replaying the same intent does not reopen it.
        intent.removeExtra(ReminderNotifier.EXTRA_KIND);
        intent.removeExtra(ReminderNotifier.EXTRA_TARGET_ID);
        open();
    }

    /** The WebView finished loading a page, so the web app's hook exists again. */
    void onPageReady() {
        pageReady = true;
        open();
    }

    private void open() {
        if (!pageReady || targetId == null) return;
        Bridge bridge = activity.getBridge();
        if (bridge == null) return;

        String script =
            "window.nodecalOpen && window.nodecalOpen(" +
            JSONObject.quote(kind) +
            "," +
            JSONObject.quote(targetId) +
            ")";
        kind = null;
        targetId = null;
        bridge.getWebView().post(() -> bridge.eval(script, value -> {}));
    }
}
