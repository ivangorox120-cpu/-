package com.wastelanddroid.util;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.util.TypedValue;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

/** Небольшие помощники для UI без XML-разметки. */
public final class Ui {
    public static final int FG = Color.rgb(124, 252, 106);
    public static final int BG = Color.rgb(16, 22, 16);

    public interface IntCallback { void on(int v); }

    private Ui() {}

    public static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    /** Полноэкранный режим, вырез камеры используется (игра растягивается на весь экран). */
    public static void immersive(Activity a) {
        a.getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        a.getWindow().setDecorFitsSystemWindows(false);
        WindowInsetsController c = a.getWindow().getInsetsController();
        if (c != null) {
            c.hide(WindowInsets.Type.systemBars());
            c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    public static LinearLayout row(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(android.view.Gravity.CENTER_VERTICAL);
        return l;
    }

    public static LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    }

    public static TextView label(Context c, String s) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextColor(FG);
        t.setTextSize(14);
        t.setPadding(dp(c, 6), dp(c, 4), dp(c, 6), dp(c, 4));
        return t;
    }

    public static Button button(Context c, String s, View.OnClickListener l) {
        Button b = new Button(c);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextColor(BG);
        b.setBackgroundColor(FG);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(c, 4), dp(c, 4), dp(c, 4), dp(c, 4));
        b.setLayoutParams(lp);
        b.setPadding(dp(c, 14), dp(c, 6), dp(c, 14), dp(c, 6));
        if (l != null) b.setOnClickListener(l);
        return b;
    }

    /** Подпись + ползунок; SeekBar доступен через findViewWithTag("seek"). */
    public static View slider(Context c, String title, int min, int max, int value, IntCallback cb) {
        LinearLayout col = new LinearLayout(c);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView t = label(c, title + ": " + value);
        SeekBar s = new SeekBar(c);
        s.setTag("seek");
        s.setMax(max - min);
        s.setProgress(Math.max(0, Math.min(max - min, value - min)));
        s.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int p, boolean user) {
                t.setText(title + ": " + (p + min));
                cb.on(p + min);
            }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        });
        col.addView(t);
        col.addView(s);
        return col;
    }
}
