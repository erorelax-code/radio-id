package com.radioid.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends Activity {
    private static final String RADIO_ID_URL = "https://iaq.onrender.com/";
    private static final long RETRY_DELAY_MS = 4000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private WebView radioWebView;
    private View loadingView;
    private boolean pageReady;

    private final Runnable retryLoad = () -> {
        if (!isFinishing() && !isDestroyed() && !pageReady && radioWebView != null) {
            radioWebView.loadUrl(RADIO_ID_URL, java.util.Collections.singletonMap("Cache-Control", "no-cache"));
        }
    };

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(3, 15, 32));
        radioWebView = new WebView(this);
        radioWebView.setBackgroundColor(Color.rgb(3, 15, 32));
        radioWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        radioWebView.setVisibility(View.INVISIBLE);
        WebSettings settings = radioWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(radioWebView, true);
        radioWebView.setWebChromeClient(new WebChromeClient());
        radioWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("iaq.onrender.com".equalsIgnoreCase(url.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!url.startsWith(RADIO_ID_URL)) return;
                view.evaluateJavascript(
                    "(function(){return !!(document.querySelector('.app') && document.getElementById('player') && typeof recognize === 'function')})()",
                    result -> { if ("true".equals(result)) showRadio(); else scheduleRetry(); }
                );
            }
        });
        loadingView = createLoadingView();
        root.addView(radioWebView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(loadingView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        radioWebView.loadUrl(RADIO_ID_URL, java.util.Collections.singletonMap("Cache-Control", "no-cache"));
    }

    private View createLoadingView() {
        LinearLayout loading = new LinearLayout(this);
        loading.setOrientation(LinearLayout.VERTICAL);
        loading.setGravity(Gravity.CENTER);
        loading.setPadding(48, 48, 48, 48);
        loading.setBackgroundColor(Color.rgb(3, 15, 32));
        loading.addView(new ProgressBar(this));
        TextView title = new TextView(this);
        title.setText("Radio ID");
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = 28;
        loading.addView(title, titleParams);
        TextView message = new TextView(this);
        message.setText("Uruchamiam radio…\nPierwsze uruchomienie może potrwać około minuty.");
        message.setTextColor(Color.rgb(154, 169, 197));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = 14;
        loading.addView(message, messageParams);
        return loading;
    }

    private void scheduleRetry() {
        handler.removeCallbacks(retryLoad);
        handler.postDelayed(retryLoad, RETRY_DELAY_MS);
    }

    private void showRadio() {
        if (pageReady) return;
        pageReady = true;
        handler.removeCallbacks(retryLoad);
        radioWebView.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        radioWebView.setVisibility(View.VISIBLE);
        loadingView.setVisibility(View.GONE);
    }

    @Override
    public void onBackPressed() {
        if (radioWebView != null && pageReady && radioWebView.canGoBack()) radioWebView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (radioWebView != null) {
            radioWebView.stopLoading();
            radioWebView.loadUrl("about:blank");
            radioWebView.destroy();
            radioWebView = null;
        }
        super.onDestroy();
    }
}
