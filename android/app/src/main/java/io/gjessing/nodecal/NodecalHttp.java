package io.gjessing.nodecal;

import android.content.Context;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The small amount of HTTP the native side does without the WebView.
 *
 * Authentication is the WebView's own: nodecal_session is HttpOnly, which hides
 * it from JavaScript but not from the app's cookie store, so copying the jar
 * into a Cookie header authenticates a background request exactly as the page
 * would be. Copying the whole jar rather than one named cookie also carries the
 * proxy cookie of an SSO deployment running BYPASS_AUTH.
 *
 * Redirects are deliberately not followed: a 302 here means the session lapsed
 * and the server is offering a login page, which is a failure to report, not an
 * HTML body to chase.
 */
final class NodecalHttp {
    private static final int TIMEOUT_MS = 15000;

    private NodecalHttp() {}

    static String get(Context context, String path) throws IOException {
        HttpURLConnection connection = open(context, path, "GET");
        try {
            requireSuccess(connection, path);
            return readBody(connection.getInputStream());
        } finally {
            connection.disconnect();
        }
    }

    static void post(Context context, String path) throws IOException {
        HttpURLConnection connection = open(context, path, "POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        try {
            byte[] body = "{}".getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body);
            }
            requireSuccess(connection, path);
        } finally {
            connection.disconnect();
        }
    }

    private static HttpURLConnection open(Context context, String path, String method) throws IOException {
        String server = NodecalPreferences.getServerUrl(context);
        if (server == null) throw new IOException("No Nodecal server is configured");

        HttpURLConnection connection = (HttpURLConnection) new URL(server + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "NodecalAndroid/1");

        String cookies = CookieManager.getInstance().getCookie(server);
        if (cookies != null) connection.setRequestProperty("Cookie", cookies);
        return connection;
    }

    private static void requireSuccess(HttpURLConnection connection, String path) throws IOException {
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IOException("HTTP " + status + " from " + path);
        }
    }

    private static String readBody(InputStream input) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = input.read(chunk)) != -1) buffer.write(chunk, 0, read);
        return buffer.toString(StandardCharsets.UTF_8.name());
    }
}
