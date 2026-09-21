package com.radioid.app;

import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.LibraryResult;
import androidx.media3.session.MediaLibraryService;
import androidx.media3.session.MediaSession;

import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Natywny odtwarzacz Radio ID. Android Auto łączy się z tą usługą i sam
 * renderuje bezpieczny interfejs listy stacji oraz sterowania odtwarzaniem.
 */
public final class RadioPlaybackService extends MediaLibraryService {
    private static final String ROOT_ID = "radio_id_root";

    private static final class Station {
        final String id;
        final String name;
        final String country;
        final String streamUrl;
        final String artworkUrl;

        Station(String id, String name, String country, String streamUrl, String artworkUrl) {
            this.id = id;
            this.name = name;
            this.country = country;
            this.streamUrl = streamUrl;
            this.artworkUrl = artworkUrl;
        }
    }

    private static final List<Station> STATIONS = ImmutableList.of(
        new Station("prl", "Polskie Radio Londyn (PRL)", "United Kingdom",
            "https://stream.rcs.revma.com/prfmwmwy768uv",
            "https://commons.wikimedia.org/wiki/Special:Redirect/file/Logo_prl_new.jpg"),
        new Station("sami", "Sami Swoi Radio", "United Kingdom",
            "https://s2.radio.co/s0dc6b5c9b/listen",
            "https://www.google.com/s2/favicons?domain=samiswoiradio.co.uk&sz=256"),
        new Station("fix", "Fix Radio", "United Kingdom",
            "https://stream.rcs.revma.com/pq7npt2nzbuvv",
            "https://www.google.com/s2/favicons?domain=fixradio.co.uk&sz=256"),
        new Station("zet", "Radio ZET", "Poland",
            "https://zt.cdn.eurozet.pl/zet-net.mp3",
            "https://www.google.com/s2/favicons?domain=radiozet.pl&sz=256"),
        new Station("zetkids", "Radio ZET Kids", "Poland",
            "https://zt.cdn.eurozet.pl/ZETKID.mp3",
            "https://www.google.com/s2/favicons?domain=radiozet.pl&sz=256"),
        new Station("zet2000", "Radio ZET - 2000", "Poland",
            "https://zt.cdn.eurozet.pl/ZET200.mp3",
            "https://www.google.com/s2/favicons?domain=radiozet.pl&sz=256")
    );

    private final Map<String, Station> stationsById = new LinkedHashMap<>();
    private ExoPlayer player;
    private MediaLibrarySession mediaLibrarySession;

    @Override
    public void onCreate() {
        super.onCreate();
        for (Station station : STATIONS) {
            stationsById.put(station.id, station);
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build();

        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(audioAttributes, true);
        player.setHandleAudioBecomingNoisy(true);

        mediaLibrarySession = new MediaLibrarySession.Builder(this, player, new LibraryCallback())
            .build();
    }

    @Nullable
    @Override
    public MediaLibrarySession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return mediaLibrarySession;
    }

    @Override
    public void onDestroy() {
        if (mediaLibrarySession != null) {
            Player sessionPlayer = mediaLibrarySession.getPlayer();
            mediaLibrarySession.release();
            sessionPlayer.release();
            mediaLibrarySession = null;
            player = null;
        }
        super.onDestroy();
    }

    private MediaItem rootItem() {
        return new MediaItem.Builder()
            .setMediaId(ROOT_ID)
            .setMediaMetadata(new MediaMetadata.Builder()
                .setTitle("Radio ID")
                .setSubtitle("Stacje radiowe")
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .build())
            .build();
    }

    private MediaItem stationItem(Station station) {
        return new MediaItem.Builder()
            .setMediaId(station.id)
            .setUri(station.streamUrl)
            .setMediaMetadata(new MediaMetadata.Builder()
                .setTitle(station.name)
                .setArtist(station.country)
                .setAlbumTitle("Radio ID")
                .setArtworkUri(Uri.parse(station.artworkUrl))
                .setMediaType(MediaMetadata.MEDIA_TYPE_RADIO_STATION)
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .build())
            .build();
    }

    private final class LibraryCallback implements MediaLibrarySession.Callback {
        @NonNull
        @Override
        public ListenableFuture<LibraryResult<MediaItem>> onGetLibraryRoot(
                @NonNull MediaLibrarySession session,
                @NonNull MediaSession.ControllerInfo browser,
                @Nullable LibraryParams params) {
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem(), params));
        }

        @NonNull
        @Override
        public ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> onGetChildren(
                @NonNull MediaLibrarySession session,
                @NonNull MediaSession.ControllerInfo browser,
                @NonNull String parentId,
                int page,
                int pageSize,
                @Nullable LibraryParams params) {
            if (!ROOT_ID.equals(parentId)) {
                return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
            }

            int from = Math.min(page * pageSize, STATIONS.size());
            int to = Math.min(from + pageSize, STATIONS.size());
            ImmutableList.Builder<MediaItem> items = ImmutableList.builder();
            for (int index = from; index < to; index++) {
                items.add(stationItem(STATIONS.get(index)));
            }
            return Futures.immediateFuture(LibraryResult.ofItemList(items.build(), params));
        }

        @NonNull
        @Override
        public ListenableFuture<LibraryResult<MediaItem>> onGetItem(
                @NonNull MediaLibrarySession session,
                @NonNull MediaSession.ControllerInfo browser,
                @NonNull String mediaId) {
            Station station = stationsById.get(mediaId);
            if (station == null) {
                return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE));
            }
            return Futures.immediateFuture(LibraryResult.ofItem(stationItem(station), null));
        }

        @NonNull
        @Override
        public ListenableFuture<List<MediaItem>> onAddMediaItems(
                @NonNull MediaSession mediaSession,
                @NonNull MediaSession.ControllerInfo controller,
                @NonNull List<MediaItem> mediaItems) {
            List<MediaItem> resolved = new ArrayList<>();
            for (MediaItem requested : mediaItems) {
                Station station = stationsById.get(requested.mediaId);
                resolved.add(station == null ? requested : stationItem(station));
            }
            return Futures.immediateFuture(resolved);
        }
    }
}
