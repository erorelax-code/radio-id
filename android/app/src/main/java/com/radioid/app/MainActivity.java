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
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private final ExecutorService recognitionExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.getWebView().addJavascriptInterface(new RecognitionBridge(), "RadioIdNative");
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
            connection = (HttpURLConnection) new URL("https://iaq.onrender.com/api/recognize").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(90000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            JSONObject payload = new JSONObject();
            payload.put("station", station);
            payload.put("url", streamUrl);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            status = connection.getResponseCode();
            InputStream input = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            response = readAll(input);
        } catch (Exception error) {
            response = new JSONObject().put("ok", false).put("error", "native_network_error")
                .put("message", error.getClass().getSimpleName()).toString();
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
    protected void onDestroy() {
        recognitionExecutor.shutdownNow();
        super.onDestroy();
    }
}
