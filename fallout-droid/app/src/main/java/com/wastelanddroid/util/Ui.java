package com.wastelanddroid.util;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

/** Дизайн-система приложения: 'ламповый терминал' — янтарь и фосфорная зелень на графите. */
public final class Ui {
    // Палитра. Акцентные цвета не final: их задаёт выбранная тема (зелёный, оранжевый, белый).
    public static final int BG = Color.rgb(11, 14, 12);
    public static final int BG2 = Color.rgb(20, 26, 22);
    public static final int CARD = Color.argb(225, 20, 26, 22);
    public static final int LINE = Color.rgb(44, 56, 48);
    public static final int RED = Color.rgb(236, 112, 100);
    public static final int TG = Color.rgb(42, 171, 238);       // цвет Telegram
    public static final int TEXT = Color.rgb(222, 228, 220);    // нейтральный основной текст
    public static final int TEXT_DIM = Color.rgb(146, 156, 146);
    public static int FG = Color.rgb(160, 226, 150);    // приглушённый фосфор
    public static int FG_DIM = Color.rgb(112, 142, 110);
    public static int AMBER = Color.rgb(232, 190, 120);  // второй акцент: заголовки, предупреждения
    public static int ON_ACCENT = Color.rgb(12, 18, 12);

    public static final String ACCENT_KEY = "accent";
    public static final String[] ACCENTS = {"green", "orange", "white"};
    public static final String[] ACCENT_NAMES = {"Зелёный", "Оранжевый", "Белый"};
    /** Основной цвет каждой темы — для образцов в настройках и тона экранных кнопок. */
    public static final int[] ACCENT_COLORS = {Color.rgb(160, 226, 150), Color.rgb(242, 182, 98), Color.rgb(228, 232, 226)};

    /** Применяет тему из настроек. Вызывается при старте приложения и после её смены. */
    public static void applyAccent(Context c) {
        String a = c.getSharedPreferences("wasteland", Context.MODE_PRIVATE).getString(ACCENT_KEY, "green");
        switch (a) {
            case "orange":
                FG = ACCENT_COLORS[1]; FG_DIM = Color.rgb(160, 132, 94); AMBER = Color.rgb(238, 218, 178);
                ON_ACCENT = Color.rgb(24, 16, 6);
                break;
            case "white":
                FG = ACCENT_COLORS[2]; FG_DIM = Color.rgb(140, 146, 140); AMBER = Color.rgb(226, 200, 146);
                ON_ACCENT = Color.rgb(14, 16, 14);
                break;
            default:
                FG = ACCENT_COLORS[0]; FG_DIM = Color.rgb(112, 142, 110); AMBER = Color.rgb(232, 190, 120);
                ON_ACCENT = Color.rgb(12, 18, 12);
        }
    }

    public static String accent(Context c) {
        return c.getSharedPreferences("wasteland", Context.MODE_PRIVATE).getString(ACCENT_KEY, "green");
    }

    /** Акцент с прозрачностью — для подложек и подсветок. */
    public static int tint(int alpha) {
        return Color.argb(alpha, Color.red(FG), Color.green(FG), Color.blue(FG));
    }

    public interface IntCallback { void on(int v); }

    private Ui() {}

    public static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    private static Typeface font = Typeface.MONOSPACE;

    /** Загружает фирменный шрифт приложения (res/font/fallout.ttf). Вызывается из Application. */
    public static void init(Context c) {
        try {
            font = c.getResources().getFont(com.droiddeck.launcher.R.font.fallout);
        } catch (RuntimeException e) {
            font = Typeface.MONOSPACE; // не должно случаться, но без шрифта приложение всё равно работает
        }
        applyAccent(c);
    }

    public static Typeface mono(boolean bold) {
        return bold ? Typeface.create(font, Typeface.BOLD) : font;
    }

    /** Иконка из пака (векторная, белая) в нужном цвете и размере. */
    public static Drawable icon(Context c, int res, int color, float sizeDp) {
        Drawable d = c.getDrawable(res).mutate();
        d.setTint(color);
        int s = dp(c, sizeDp);
        d.setBounds(0, 0, s, s);
        return d;
    }

    /** Ставит иконку слева от текста кнопки/надписи. */
    public static <T extends TextView> T withIcon(T v, int res, int color) {
        Drawable d = icon(v.getContext(), res, color, Math.max(16, v.getTextSize() / v.getResources().getDisplayMetrics().density + 4));
        v.setCompoundDrawablesRelative(d, null, null, null);
        v.setCompoundDrawablePadding(dp(v.getContext(), 8));
        return v;
    }

    /**
     * Полноэкранный режим, вырез камеры используется (игра растягивается на весь экран).
     *
     * Важно: на Android 11 Window.getInsetsController() падает с NPE, если окно ещё не создано
     * (вызов из onCreate до setContentView). Поэтому сначала принудительно создаём DecorView
     * и берём контроллер у него; любые сбои здесь не должны ронять приложение.
     */
    @SuppressWarnings("deprecation")
    public static void immersive(Activity a) {
        if (font == Typeface.MONOSPACE) init(a.getApplicationContext());
        try {
            android.view.Window w = a.getWindow();
            View decor = w.getDecorView(); // создаёт окно, если его ещё нет
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
            // Совместимый способ — работает на всех версиях, включая прошивки с нестандартным окном.
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = decor.getWindowInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } catch (RuntimeException e) {
            android.util.Log.w("Ui", "immersive mode failed", e);
        }
    }

    public static GradientDrawable rounded(int fill, int stroke, float radiusDp, Context c) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(c, radiusDp));
        if (stroke != 0) g.setStroke(dp(c, 1), stroke);
        return g;
    }

    /** Фон экрана: вертикальный градиент графита. */
    public static Drawable screenBackground() {
        return new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{BG2, BG, Color.rgb(8, 10, 9)});
    }

    public static LinearLayout row(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    public static LinearLayout column(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    public static LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    }

    public static LinearLayout.LayoutParams matchWrap(Context c, int topMarginDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(c, topMarginDp);
        return lp;
    }

    /** Карточка с заголовком-'вкладкой'. Содержимое добавляется в возвращаемый контейнер. */
    public static LinearLayout card(Context c, String title) {
        LinearLayout card = column(c);
        card.setBackground(rounded(CARD, LINE, 14, c));
        int p = dp(c, 14);
        card.setPadding(p, dp(c, 10), p, p);
        if (title != null) {
            TextView t = new TextView(c);
            t.setText(title.toUpperCase());
            t.setTextColor(AMBER);
            t.setTextSize(12);
            t.setLetterSpacing(0.18f);
            t.setTypeface(mono(true));
            t.setPadding(0, 0, 0, dp(c, 6));
            card.addView(t);
        }
        return card;
    }

    public static TextView label(Context c, String s) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextColor(TEXT);
        t.setTextSize(14);
        t.setTypeface(mono(false));
        t.setLineSpacing(0, 1.15f);
        t.setPadding(dp(c, 2), dp(c, 3), dp(c, 2), dp(c, 3));
        return t;
    }

    public static TextView hint(Context c, String s) {
        TextView t = label(c, s);
        t.setTextColor(TEXT_DIM);
        t.setTextSize(12);
        return t;
    }

    private static Drawable buttonBg(Context c, int fill, int stroke) {
        StateListDrawable s = new StateListDrawable();
        GradientDrawable disabled = rounded(Color.argb(60, Color.red(fill), Color.green(fill), Color.blue(fill)), 0, 12, c);
        s.addState(new int[]{-android.R.attr.state_enabled}, disabled);
        s.addState(new int[]{}, rounded(fill, stroke, 12, c));
        return new RippleDrawable(ColorStateList.valueOf(Color.argb(90, 255, 255, 255)), s, null);
    }

    /** Основная кнопка (залитая фосфором). */
    public static Button button(Context c, String s, View.OnClickListener l) {
        return styledButton(c, s, l, FG, ON_ACCENT, 0);
    }

    public static Button button(Context c, int icon, String s, View.OnClickListener l) {
        return withIcon(button(c, s, l), icon, ON_ACCENT);
    }

    public static Button ghostButton(Context c, int icon, String s, View.OnClickListener l) {
        return withIcon(ghostButton(c, s, l), icon, FG);
    }

    /** Второстепенная кнопка (контур). */
    public static Button ghostButton(Context c, String s, View.OnClickListener l) {
        return styledButton(c, s, l, tint(26), FG, FG_DIM);
    }

    public static Button styledButton(Context c, String s, View.OnClickListener l, int fill, int textColor, int stroke) {
        Button b = new Button(c);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextColor(textColor);
        b.setTypeface(mono(true));
        b.setTextSize(14);
        b.setStateListAnimator(null);
        b.setBackground(buttonBg(c, fill, stroke));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(c, 4), dp(c, 4), dp(c, 4), dp(c, 4));
        b.setLayoutParams(lp);
        b.setMinHeight(dp(c, 44));
        b.setPadding(dp(c, 16), dp(c, 8), dp(c, 16), dp(c, 8));
        if (l != null) b.setOnClickListener(l);
        Anim.pressable(b);
        return b;
    }

    public static CheckBox check(Context c, String text, boolean checked) {
        CheckBox cb = new CheckBox(c);
        cb.setText(text);
        cb.setTextColor(TEXT);
        cb.setTypeface(mono(false));
        cb.setTextSize(13);
        cb.setChecked(checked);
        cb.setButtonTintList(new ColorStateList(
                new int[][]{{android.R.attr.state_checked}, {}}, new int[]{FG, FG_DIM}));
        return cb;
    }

    /** Подпись + ползунок; SeekBar доступен через findViewWithTag("seek"). */
    public static View slider(Context c, String title, int min, int max, int value, IntCallback cb) {
        LinearLayout col = column(c);
        TextView t = label(c, title + ": " + value);
        t.setTextSize(12);
        SeekBar s = new SeekBar(c);
        s.setTag("seek");
        s.setMax(max - min);
        s.setProgress(Math.max(0, Math.min(max - min, value - min)));
        s.setProgressTintList(ColorStateList.valueOf(FG));
        s.setThumbTintList(ColorStateList.valueOf(AMBER));
        s.setProgressBackgroundTintList(ColorStateList.valueOf(LINE));
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
