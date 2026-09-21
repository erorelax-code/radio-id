package com.radioid.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private final ExecutorService recognitionExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService startupExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.getWebView().addJavascriptInterface(new RecognitionBridge(), "RadioIdNative");
        startupExecutor.execute(this::warmBackendAndLoadApp);
    }

    private void warmBackendAndLoadApp() {
        for (int attempt = 0; attempt < 10 && !Thread.currentThread().isInterrupted(); attempt++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("https://iaq.onrender.com/health").openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setUseCaches(false);
                if (connection.getResponseCode() == 200) {
                    runOnUiThread(() -> bridge.getWebView().loadUrl("https://iaq.onrender.com"));
                    return;
                }
            } catch (Exception ignored) {
                // Render free instances can need several attempts after sleeping.
            } finally {
                if (connection != null) connection.disconnect();
            }
            try {
                Thread.sleep(3000);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private final class RecognitionBridge {
        @JavascriptInterface
        public void recognize(String station, String streamUrl, String requestId) {
            recognitionExecutor.execute(() -> performRecognition(station, streamUrl, requestId));
        }
    }

    private void performRecognition(String station, String streamUrl, String requestId) {
        HttpURLConnection connection = null;
        int status = 0;
        String response;
        try {
            String query = "station=" + URLEncoder.encode(station, "UTF-8")
                + "&url=" + URLEncoder.encode(streamUrl, "UTF-8")
                + "&_=" + System.currentTimeMillis();
            connection = (HttpURLConnection) new URL("https://iaq.onrender.com/api/recognize?" + query).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(60000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            status = connection.getResponseCode();
            InputStream input = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            response = readAll(input);
        } catch (Exception error) {
            response = "{\"ok\":false,\"error\":\"native_network_error\",\"message\":"
                + JSONObject.quote(error.getClass().getSimpleName()) + "}";
        } finally {
            if (connection != null) connection.disconnect();
        }
        final int finalStatus = status;
        final String finalResponse = response;
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(
            "window.__radioIdNativeResult(" + JSONObject.quote(requestId) + "," + finalStatus + "," + JSONObject.quote(finalResponse) + ")",
            null
        ));
    }

    private static String readAll(InputStream input) throws Exception {
        if (input == null) return "{}";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    @Override
    public void onDestroy() {
        startupExecutor.shutdownNow();
        recognitionExecutor.shutdownNow();
        super.onDestroy();
    }
}
