package app.theyran.run;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "HuntNight",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
            alias = "location"
        ),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class HuntNightPlugin extends Plugin {
    @Override
    public void load() {
        NightRuntime.plugin = this;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAliases(new String[] { "location", "notifications" }, call, "started");
        } else {
            requestPermissionForAlias("location", call, "started");
        }
    }

    @PermissionCallback
    private void started(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Location is required for a night.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("A notification is required so the night can keep running.");
            return;
        }
        NightRuntime.active = true;
        Intent intent = new Intent(getContext(), HuntNightService.class);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
        else getContext().startService(intent);
        offerBatteryExemption();
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NightRuntime.active = false;
        getContext().stopService(new Intent(getContext(), HuntNightService.class));
        call.resolve();
    }

    @PluginMethod
    public void beep(PluginCall call) {
        NightAudio.get(getContext()).beep();
        call.resolve();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        NightAudio.get(getContext()).speak(call.getString("text", ""));
        call.resolve();
    }

    public void emitFix(JSObject data) {
        notifyListeners("fix", data);
    }

    private void offerBatteryExemption() {
        if (Build.VERSION.SDK_INT < 23 || getActivity() == null) return;
        PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        String pkg = getContext().getPackageName();
        if (pm == null || pm.isIgnoringBatteryOptimizations(pkg)) return;
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + pkg));
        getActivity().startActivity(intent);
    }
}
