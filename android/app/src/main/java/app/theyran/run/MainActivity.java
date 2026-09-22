package app.theyran.run;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HuntNightPlugin.class);
        super.onCreate(savedInstanceState);
        NightRuntime.activity = this;
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (NightRuntime.active) {
                    moveTaskToBack(true);
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        NightRuntime.activity = this;
    }

    @Override
    public void onDestroy() {
        if (NightRuntime.activity == this) NightRuntime.activity = null;
        super.onDestroy();
    }
}
