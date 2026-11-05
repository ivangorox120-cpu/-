package com.wastelanddroid.util;

import android.content.Context;

import java.io.File;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Отчёт о вылете: сохраняется при любой необработанной ошибке и показывается при следующем
 * запуске, чтобы его можно было отправить разработчику.
 */
public final class CrashLog {
    private static final String FILE = "fd-last-crash.txt";

    private CrashLog() {}

    public static void install(Context context) {
        Context app = context.getApplicationContext();
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                write(app, "thread=" + thread.getName(), error);
                Prefs.get(app).edit().putBoolean(Prefs.AUTOSTART_BLOCKED, true).commit();
            } catch (Throwable ignored) {
                // отчёт не должен мешать штатной обработке
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    public static void write(Context context, String where, Throwable error) {
        try {
            StringWriter sw = new StringWriter();
            error.printStackTrace(new PrintWriter(sw));
            String text = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date())
                    + "  " + where + "\nAndroid " + android.os.Build.VERSION.RELEASE + " (API " + android.os.Build.VERSION.SDK_INT + "), "
                    + android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL + "\n\n" + sw;
            Files.write(new File(context.getFilesDir(), FILE).toPath(), text.getBytes(StandardCharsets.UTF_8));
        } catch (Throwable ignored) {
        }
    }

    /** Текст последнего непоказанного отчёта или null. */
    public static String takeUnseen(Context context) {
        File f = new File(context.getFilesDir(), FILE);
        if (!f.isFile()) return null;
        try {
            String text = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            File seen = new File(context.getFilesDir(), FILE + ".seen");
            //noinspection ResultOfMethodCallIgnored
            seen.delete();
            //noinspection ResultOfMethodCallIgnored
            f.renameTo(seen);
            return text;
        } catch (Exception e) {
            return null;
        }
    }
}
