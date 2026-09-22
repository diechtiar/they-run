package app.theyran.run;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;

/**
 * Keeps one night alive with the screen off: a location foreground service,
 * a partial wake lock, and a tick into the page. The page still owns the hunt.
 */
public class HuntNightService extends Service implements LocationListener {
    public static final String CHANNEL = "night";
    private static final int NOTICE = 41;
    private static final long TICK_MS = 250;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wake;
    private LocationManager locations;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!NightRuntime.active) return;
            pokePage();
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        NightAudio.get(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NightRuntime.active = true;
        ensureChannel();
        Notification notice = buildNotice();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTICE, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTICE, notice);
        }
        holdWake();
        listen();
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        NightRuntime.active = false;
        handler.removeCallbacks(tick);
        if (locations != null) locations.removeUpdates(this);
        if (wake != null && wake.isHeld()) wake.release();
        NightAudio.get(this).shutdown();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        HuntNightPlugin plugin = NightRuntime.plugin;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("lat", location.getLatitude());
        data.put("lon", location.getLongitude());
        data.put("speed", location.hasSpeed() ? location.getSpeed() : -1);
        data.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : -1);
        data.put("time", location.getTime());
        plugin.emitFix(data);
    }

    private void pokePage() {
        if (NightRuntime.activity == null) return;
        try {
            if (NightRuntime.activity.getBridge() == null) return;
            if (NightRuntime.activity.getBridge().getWebView() == null) return;
            NightRuntime.activity.getBridge().eval("window.__theyRunTick&&window.__theyRunTick()", null);
        } catch (Exception ignored) {
            // The page is gone. The service still holds the night until Stop.
        }
    }

    private void listen() {
        locations = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locations == null) return;
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }
        String provider = LocationManager.GPS_PROVIDER;
        if (Build.VERSION.SDK_INT >= 31) provider = LocationManager.FUSED_PROVIDER;
        try {
            locations.requestLocationUpdates(provider, 1000, 0f, this, Looper.getMainLooper());
        } catch (Exception primary) {
            try {
                locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0f, this, Looper.getMainLooper());
            } catch (Exception ignored) {
                // The page still has its own watch while the screen is on.
            }
        }
    }

    private void holdWake() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm == null) return;
        if (wake == null) {
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "theyran:night");
            wake.setReferenceCounted(false);
        }
        if (!wake.isHeld()) wake.acquire();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Night", NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotice() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("THEY RUN")
            .setContentText(getString(R.string.night_notice))
            .setSmallIcon(R.drawable.ic_stat_night)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setContentIntent(pending)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }
}
