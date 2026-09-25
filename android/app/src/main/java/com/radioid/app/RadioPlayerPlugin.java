package com.radioid.app;

import android.content.ComponentName;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

@CapacitorPlugin(name = "RadioPlayer")
public class RadioPlayerPlugin extends Plugin {
    private ListenableFuture<MediaController> controllerFuture;
    private MediaController controller;

    @Override
    public void load() {
        SessionToken token = new SessionToken(getContext(),
            new ComponentName(getContext(), RadioPlaybackService.class));
        controllerFuture = new MediaController.Builder(getContext(), token).buildAsync();
        Futures.addCallback(controllerFuture, new FutureCallback<MediaController>() {
            @Override
            public void onSuccess(MediaController connected) {
                controller = connected;
                connected.addListener(new Player.Listener() {
                    @Override public void onIsPlayingChanged(boolean playing) { publish(); }
                    @Override public void onMediaItemTransition(MediaItem item, int reason) { publish(); }
                    @Override public void onPlayerError(PlaybackException error) {
                        JSObject data = snapshot();
                        data.put("error", error.getMessage());
                        notifyListeners("playbackState", data);
                    }
                });
                publish();
            }
            @Override public void onFailure(@NonNull Throwable error) {
                JSObject data = new JSObject();
                data.put("error", error.getMessage());
                notifyListeners("playbackState", data);
            }
        }, getActivity().getMainExecutor());
    }

    private JSObject snapshot() {
        JSObject data = new JSObject();
        MediaItem item = controller == null ? null : controller.getCurrentMediaItem();
        data.put("playing", controller != null && controller.isPlaying());
        data.put("mediaId", item == null ? "" : item.mediaId);
        return data;
    }

    private void publish() { notifyListeners("playbackState", snapshot()); }

    private void withController(PluginCall call, java.util.function.Consumer<MediaController> action) {
        if (controllerFuture == null) { call.reject("Radio player unavailable"); return; }
        Futures.addCallback(controllerFuture, new FutureCallback<MediaController>() {
            @Override public void onSuccess(MediaController connected) {
                try {
                    action.accept(connected);
                    call.resolve(snapshot());
                } catch (Exception error) {
                    call.reject("Radio player error", error);
                }
            }
            @Override public void onFailure(@NonNull Throwable error) {
                call.reject("Radio player connection failed: " + error.getMessage());
            }
        }, getActivity().getMainExecutor());
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        String name = call.getString("name");
        if (url == null || !url.startsWith("https://") || name == null || name.isEmpty()) {
            call.reject("A valid HTTPS radio stream and station name are required");
            return;
        }
        withController(call, connected -> {
            MediaMetadata.Builder metadata = new MediaMetadata.Builder()
                .setTitle(name)
                .setArtist("Radio ID")
                .setMediaType(MediaMetadata.MEDIA_TYPE_RADIO_STATION)
                .setIsPlayable(true);
            String artwork = call.getString("artwork");
            if (artwork != null && artwork.startsWith("https://")) {
                metadata.setArtworkUri(Uri.parse(artwork));
            }
            MediaItem item = new MediaItem.Builder()
                .setMediaId(call.getString("mediaId", url))
                .setUri(url)
                .setMediaMetadata(metadata.build())
                .build();
            connected.setMediaItem(item);
            connected.prepare();
            connected.play();
            publish();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        withController(call, connected -> { connected.play(); publish(); });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, connected -> { connected.pause(); publish(); });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        withController(call, connected -> {
            connected.stop();
            connected.clearMediaItems();
            publish();
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        withController(call, connected -> {});
    }
}
