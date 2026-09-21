package com.radioid.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.MediaType;
import okhttp3.Response;

public class MainActivity extends BridgeActivity {
    private final ExecutorService recognitionExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService startupExecutor = Executors.newSingleThreadExecutor();
    private final OkHttpClient recognitionClient = new OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(70, TimeUnit.SECONDS)
        .callTimeout(80, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build();

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
            runOnUiThread(() -> {
                String script = "(function(){var f=document.createElement('iframe');"
                    + "f.style.display='none';f.src='https://iaq.onrender.com/api/recognize-frame?station='"
                    + "+encodeURIComponent(" + JSONObject.quote(station) + ")+'&url='+encodeURIComponent("
                    + JSONObject.quote(streamUrl) + ")+'&requestId='+encodeURIComponent("
                    + JSONObject.quote(requestId) + ")+'&_='+Date.now();document.body.appendChild(f);"
                    + "setTimeout(function(){f.remove()},95000)})()";
                bridge.getWebView().evaluateJavascript(script, null);
            });
        }
    }

    private void performRecognition(String station, String streamUrl, String requestId) {
        int status = 0;
        String response;
        try {
            JSONObject payload = new JSONObject();
            payload.put("station", station);
            payload.put("url", streamUrl);
            Request startRequest = new Request.Builder()
                .url("https://iaq.onrender.com/api/recognize/start")
                .header("Accept", "application/json")
                .header("User-Agent", "RadioID-Android/2.3")
                .header("Cache-Control", "no-cache")
                .post(RequestBody.create(payload.toString(), MediaType.get("application/json; charset=utf-8")))
                .build();
            String jobId;
            try (Response startResponse = recognitionClient.newCall(startRequest).execute()) {
                String startBody = startResponse.body() == null ? "{}" : startResponse.body().string();
                if (!startResponse.isSuccessful()) throw new Exception("start_http_" + startResponse.code() + ": " + startBody);
                jobId = new JSONObject(startBody).getString("job");
            }
            response = "{}";
            for (int attempt = 0; attempt < 45; attempt++) {
                Thread.sleep(2000);
                HttpUrl statusUrl = HttpUrl.get("https://iaq.onrender.com/api/recognize/status").newBuilder()
                    .addQueryParameter("id", jobId)
                    .addQueryParameter("_", Long.toString(System.currentTimeMillis()))
                    .build();
                Request statusRequest = new Request.Builder().url(statusUrl)
                    .header("Accept", "application/json")
                    .header("Cache-Control", "no-cache")
                    .build();
                try (Response statusResponse = recognitionClient.newCall(statusRequest).execute()) {
                    status = statusResponse.code();
                    response = statusResponse.body() == null ? "{}" : statusResponse.body().string();
                }
                JSONObject statusJson = new JSONObject(response);
                if (!statusJson.optBoolean("pending", false)) break;
            }
        } catch (Exception error) {
            response = "{\"ok\":false,\"error\":\"android_connection_detail\",\"message\":"
                + JSONObject.quote(error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage())) + "}";
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
