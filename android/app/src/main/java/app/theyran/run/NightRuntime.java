package app.theyran.run;

import com.getcapacitor.BridgeActivity;

/** Process-wide handles so the foreground service can reach the page. */
public final class NightRuntime {
    public static volatile boolean active = false;
    public static volatile BridgeActivity activity = null;
    public static volatile HuntNightPlugin plugin = null;

    private NightRuntime() {}
}
