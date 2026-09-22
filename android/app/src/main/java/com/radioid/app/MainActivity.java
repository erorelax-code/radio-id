package com.radioid.app;

import android.content.ComponentName;
import android.net.Uri;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final Uri RADIO_ID_URL = Uri.parse("https://iaq.onrender.com");
    private boolean launched;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        launchTrustedWebActivity();
    }

    private void launchTrustedWebActivity() {
        String browserPackage = CustomTabsClient.getPackageName(this, null);
        if (browserPackage == null) {
            launchFallback();
            return;
        }

        boolean bound = CustomTabsClient.bindCustomTabsService(this, browserPackage,
            new CustomTabsServiceConnection() {
                @Override
                public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
                    client.warmup(0L);
                    CustomTabsSession session = client.newSession(null);
                    if (session == null) {
                        launchFallback();
                        return;
                    }
                    launched = true;
                    new TrustedWebActivityIntentBuilder(RADIO_ID_URL)
                        .build(session)
                        .launchTrustedWebActivity(MainActivity.this);
                    finish();
                }

                @Override
                public void onServiceDisconnected(ComponentName name) {
                    if (!launched) launchFallback();
                }
            });

        if (!bound) launchFallback();
    }

    private void launchFallback() {
        if (launched) return;
        launched = true;
        new CustomTabsIntent.Builder()
            .setShowTitle(false)
            .setUrlBarHidingEnabled(true)
            .build()
            .launchUrl(this, RADIO_ID_URL);
        finish();
    }
}
