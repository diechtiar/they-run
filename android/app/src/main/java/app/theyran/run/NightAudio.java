package app.theyran.run;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.os.Handler;
import android.os.Looper;
import java.io.File;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Beeps and the three words mix with whatever else is playing.
 * Nothing here requests audio focus, so a player keeps going.
 * A phone call wins: we stay silent rather than stepping on it.
 */
public final class NightAudio {
    private static NightAudio instance;

    private final Context context;
    private final AudioAttributes attrs;
    private final AudioTrack beep;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> waiting = ConcurrentHashMap.newKeySet();
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private MediaPlayer player;

    private NightAudio(Context context) {
        this.context = context.getApplicationContext();
        attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        beep = buildBeep();
        tts = new TextToSpeech(this.context, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            ttsReady = true;
            tts.setLanguage(Locale.US);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {}

                @Override
                public void onDone(String utteranceId) {
                    if (!waiting.remove(utteranceId)) return;
                    main.post(() -> playFile(new File(context.getCacheDir(), fileName(utteranceId))));
                }

                @Override
                public void onError(String utteranceId) {
                    waiting.remove(utteranceId);
                }
            });
            warm("Chase");
            warm("Clear");
            warm("Got you");
            for (String text : waiting) synthesize(text);
        });
    }

    public static synchronized NightAudio get(Context context) {
        if (instance == null) instance = new NightAudio(context);
        return instance;
    }

    public void beep() {
        if (callActive() || beep == null) return;
        beep.stop();
        beep.reloadStaticData();
        beep.play();
    }

    public void speak(String text) {
        if (text == null || text.isEmpty() || callActive()) return;
        File file = new File(context.getCacheDir(), fileName(text));
        if (file.exists() && file.length() > 44) {
            playFile(file);
            return;
        }
        waiting.add(text);
        if (ttsReady) synthesize(text);
    }

    public void shutdown() {
        if (player != null) {
            player.release();
            player = null;
        }
    }

    private boolean callActive() {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return false;
        int mode = am.getMode();
        return mode == AudioManager.MODE_IN_CALL
            || mode == AudioManager.MODE_IN_COMMUNICATION
            || mode == AudioManager.MODE_RINGTONE;
    }

    private void warm(String text) {
        File file = new File(context.getCacheDir(), fileName(text));
        if (file.exists() && file.length() > 44) return;
        synthesize(text);
    }

    private void synthesize(String text) {
        if (tts == null) return;
        tts.synthesizeToFile(text, new Bundle(), new File(context.getCacheDir(), fileName(text)), text);
    }

    private void playFile(File file) {
        if (callActive() || file == null || !file.exists()) return;
        try {
            if (player != null) {
                player.release();
                player = null;
            }
            MediaPlayer next = new MediaPlayer();
            next.setAudioAttributes(attrs);
            next.setDataSource(file.getAbsolutePath());
            next.setOnCompletionListener(mp -> {
                mp.release();
                if (player == mp) player = null;
            });
            next.prepare();
            next.start();
            player = next;
        } catch (Exception ignored) {
            // A missing clip is silence, not a focus grab.
        }
    }

    private static String fileName(String text) {
        return "they-run-" + text.toLowerCase(Locale.US).replace(' ', '-') + ".wav";
    }

    private AudioTrack buildBeep() {
        int rate = 22050;
        int samples = (int) (rate * 0.07);
        byte[] pcm = new byte[samples * 2];
        for (int i = 0; i < samples; i++) {
            double env = 1;
            if (i < 180) env = i / 180.0;
            else if (i > samples - 500) env = Math.max(0, (samples - i) / 500.0);
            short sample = (short) (Math.sin(2 * Math.PI * 880 * i / rate) * env * 0.18 * 32767);
            pcm[i * 2] = (byte) (sample & 0xff);
            pcm[i * 2 + 1] = (byte) ((sample >> 8) & 0xff);
        }
        int min = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioTrack track = new AudioTrack.Builder()
            .setAudioAttributes(attrs)
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(rate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(Math.max(min, pcm.length))
            .build();
        track.write(pcm, 0, pcm.length);
        return track;
    }
}
