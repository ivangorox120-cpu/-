package com.wastelanddroid.util;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

public final class Links {
    public static final String TELEGRAM_CHANNEL = "rommy_apps";
    public static final String TELEGRAM_URL = "https://t.me/" + TELEGRAM_CHANNEL;

    private Links() {}

    /** Открывает канал в приложении Telegram, если оно установлено, иначе в браузере. */
    public static void openTelegram(Context c) {
        Intent app = new Intent(Intent.ACTION_VIEW, Uri.parse("tg://resolve?domain=" + TELEGRAM_CHANNEL));
        try {
            c.startActivity(app);
            return;
        } catch (ActivityNotFoundException ignored) {
            // Telegram не установлен
        }
        try {
            c.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(TELEGRAM_URL)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(c, TELEGRAM_URL, Toast.LENGTH_LONG).show();
        }
    }
}
