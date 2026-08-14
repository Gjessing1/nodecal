package io.gjessing.nodecal;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class NodecalPreferencesTest {
    @Test
    public void normalizesRootHttpsUrls() {
        assertEquals(
            "https://calendar.example.com",
            NodecalPreferences.normalizeServerUrl(" https://calendar.example.com/ ")
        );
        assertEquals(
            "https://calendar.example.com:8443",
            NodecalPreferences.normalizeServerUrl("https://calendar.example.com:8443")
        );
    }

    @Test
    public void rejectsInsecureOrNonRootUrls() {
        assertNull(NodecalPreferences.normalizeServerUrl("http://calendar.example.com"));
        assertNull(NodecalPreferences.normalizeServerUrl("https://calendar.example.com/nodecal"));
        assertNull(NodecalPreferences.normalizeServerUrl("https://user@calendar.example.com"));
        assertNull(NodecalPreferences.normalizeServerUrl("https://calendar.example.com?redirect=other"));
        assertNull(NodecalPreferences.normalizeServerUrl("not a url"));
    }
}
