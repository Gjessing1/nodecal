package io.gjessing.nodecal;

import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;

/**
 * Routes the hardware back press through the web app before the activity exits.
 * The page answers true when it closed an overlay or returned to an earlier
 * view, false when it is already at its root, and null when the WebView shows
 * something else — an SSO login page — that carries no Nodecal handler.
 */
final class NodecalBackNavigation extends OnBackPressedCallback {
    private static final String ASK_WEB_APP = "window.nodecalBack ? window.nodecalBack() : null";

    private final MainActivity activity;
    private boolean awaitingWebApp;

    NodecalBackNavigation(MainActivity activity) {
        super(true);
        this.activity = activity;
    }

    @Override
    public void handleOnBackPressed() {
        Bridge bridge = activity.getBridge();
        if (bridge == null) {
            activity.finish();
            return;
        }
        // Asking the page is asynchronous; ignore presses that arrive meanwhile.
        if (awaitingWebApp) return;
        awaitingWebApp = true;

        WebView webView = bridge.getWebView();
        bridge.eval(ASK_WEB_APP, value -> {
            awaitingWebApp = false;
            if ("true".equals(value)) return;
            if (!"false".equals(value) && webView.canGoBack()) webView.goBack();
            else activity.finish();
        });
    }
}
