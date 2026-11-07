package com.wastelanddroid;

import android.animation.ObjectAnimator;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.runtime.RuntimeManager;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.Ui;
import com.wastelanddroid.util.WastelandBackdrop;

import java.io.File;

/**
 * Заставка: фон с медленным наездом камеры, плавно проявляющаяся надпись 'Fallout Droid'
 * и 'by Rommy' под словом Droid. Затем — сразу игра (если включён автозапуск и всё готово)
 * или лаунчер. Касание экрана пропускает заставку.
 */
public final class SplashActivity extends Activity {
    private static final long DURATION_MS = 3200;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean done;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        WastelandBackdrop bg = new WastelandBackdrop(this);
        root.addView(bg, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout titleBox = Ui.column(this);
        titleBox.setGravity(Gravity.END);
        TextView title = new TextView(this);
        title.setText("Fallout Droid");
        title.setTextColor(Color.rgb(250, 240, 220));
        title.setTextSize(54);
        title.setTypeface(Ui.mono(true));
        title.setShadowLayer(Ui.dp(this, 18), 0, Ui.dp(this, 2), Color.argb(220, 0, 0, 0));
        titleBox.addView(title);
        TextView by = new TextView(this);
        by.setText("by Rommy");
        by.setTextColor(Ui.AMBER);
        by.setTextSize(18);
        by.setTypeface(Ui.mono(false));
        by.setLetterSpacing(0.25f);
        by.setShadowLayer(Ui.dp(this, 10), 0, 0, Color.BLACK);
        titleBox.addView(by);
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        root.addView(titleBox, tlp);
        setContentView(root);

        // Наезд камеры на фон
        ObjectAnimator zoom = ObjectAnimator.ofFloat(bg, "zoom", 1.0f, 1.12f);
        zoom.setDuration(DURATION_MS + 1500);
        zoom.setInterpolator(new LinearInterpolator());
        zoom.start();
        bg.setAlpha(0f);
        bg.animate().alpha(1f).setDuration(900).start();

        // Надпись: проявление с 'разъезжающимися' буквами
        title.setAlpha(0f);
        title.setLetterSpacing(0.45f);
        title.setScaleX(0.94f);
        title.setScaleY(0.94f);
        title.animate().alpha(1f).scaleX(1f).scaleY(1f).setStartDelay(500).setDuration(1500).setInterpolator(Anim.EMPHASIZED).start();
        ObjectAnimator spacing = ObjectAnimator.ofFloat(title, "letterSpacing", 0.45f, 0.06f);
        spacing.setStartDelay(500);
        spacing.setDuration(1700);
        spacing.setInterpolator(Anim.EMPHASIZED);
        spacing.start();

        by.setAlpha(0f);
        by.setTranslationY(Ui.dp(this, 10));
        by.animate().alpha(1f).translationY(0f).setStartDelay(1600).setDuration(900).setInterpolator(Anim.EMPHASIZED).start();

        root.setOnClickListener(v -> next());
        handler.postDelayed(this::next, DURATION_MS);
    }

    private void next() {
        if (done) return;
        done = true;
        Intent i = new Intent(this, MainActivity.class);
        GameDef ready = autostartGame();
        if (ready != null) i.putExtra(MainActivity.EXTRA_AUTOSTART, ready.id);
        startActivity(i);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        finish();
    }

    /** Игра для автозапуска: последняя запущенная, если всё для неё готово. */
    private GameDef autostartGame() {
        if (Prefs.get(this).getBoolean(Prefs.LAUNCH_PENDING, false)) {
            // прошлый запуск не дошёл до игры (вылет) — не повторяем его автоматически
            Prefs.get(this).edit().putBoolean(Prefs.LAUNCH_PENDING, false).putBoolean(Prefs.AUTOSTART_BLOCKED, true).putBoolean(Prefs.CRASH_NOTICE, true).apply();
            return null;
        }
        if (!Prefs.get(this).getBoolean(Prefs.AUTOSTART, false)) return null;
        if (Prefs.get(this).getBoolean(Prefs.AUTOSTART_BLOCKED, false)) return null;
        String last = Prefs.get(this).getString(Prefs.LAST_GAME, null);
        if (last == null) return null;
        GameDef d = GameDef.byId(last);
        String dir = d.gameDir(this);
        if (dir == null || !GameFiles.validate(d, new File(dir)).ok()) return null;
        if (!com.wastelanddroid.engine.FalloutEngine.ready(this) || !Prefs.get(this).getBoolean(MainActivity.ONBOARDED, false)) return null;
        return d;
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
