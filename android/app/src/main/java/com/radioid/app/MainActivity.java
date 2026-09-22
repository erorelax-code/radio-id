package com.radioid.app;

import android.net.Uri;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final Uri RADIO_ID_URL = Uri.parse("https://iaq.onrender.com");

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        CustomTabsIntent customTab = new CustomTabsIntent.Builder()
            .setShowTitle(false)
            .setUrlBarHidingEnabled(true)
            .build();
        customTab.launchUrl(this, RADIO_ID_URL);
        finish();
    }
}
