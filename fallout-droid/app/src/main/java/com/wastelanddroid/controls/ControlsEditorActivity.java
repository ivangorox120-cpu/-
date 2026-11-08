package com.wastelanddroid.controls;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.droiddeck.launcher.R;
import com.droiddeck.launcher.input.ControllerPrefs;
import com.droiddeck.launcher.input.ScreenKey;
import com.droiddeck.launcher.input.ScreenKeyKt;
import com.droiddeck.launcher.input.ScreenKeys;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.Ui;
import com.wastelanddroid.util.WastelandBackdrop;

import java.util.Collections;
import java.util.List;

/**
 * Редактор экранного управления под ПК-раскладку Fallout: клавиатура и мышь.
 * Кнопки перетаскиваются пальцем; нажатие на кнопку открывает мини-редактор рядом с ней,
 * так что сама кнопка остаётся видна. Верхняя панель перетаскивается за ручку и сворачивается.
 */
public final class ControlsEditorActivity extends Activity {
    private ScreenKeys keys;
    private FrameLayout root;
    private LinearLayout panel, panelBody, mini;
    private List<Integer> selected;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        PcLayout.installIfEmpty(this);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        WastelandBackdrop bg = new WastelandBackdrop(this);
        bg.setAlpha(0.5f);
        root.addView(bg, new FrameLayout.LayoutParams(-1, -1));

        TextView look = Ui.label(this, "Обзор: свайп по пустому месту экрана");
        look.setTextColor(Ui.FG_DIM);
        FrameLayout.LayoutParams llp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        root.addView(look, llp);

        keys = new ScreenKeys(this, (code, down) -> kotlin.Unit.INSTANCE);
        keys.setOnSelect(codes -> { showMini(codes); return kotlin.Unit.INSTANCE; });
        root.addView(keys, new FrameLayout.LayoutParams(-1, -1));
        keys.load(ControllerPrefs.INSTANCE.encodeScreenKeys(ControllerPrefs.INSTANCE.screenKeys(this)));
        keys.startEditing();

        buildPanel();
        setContentView(root);
    }

    // ───────────── верхняя панель ─────────────

    @SuppressLint("ClickableViewAccessibility")
    private void buildPanel() {
        panel = Ui.column(this);
        panel.setBackground(Ui.rounded(Color.argb(238, 14, 20, 16), Ui.LINE, 16, this));
        int p = Ui.dp(this, 10);
        panel.setPadding(p, Ui.dp(this, 4), p, p);

        LinearLayout handle = Ui.row(this);
        TextView grip = Ui.label(this, "===  УПРАВЛЕНИЕ  ===");
        grip.setTypeface(Ui.mono(true));
        grip.setTextColor(Ui.AMBER);
        grip.setGravity(Gravity.CENTER);
        handle.addView(grip, Ui.weight());
        Button fold = Ui.ghostButton(this, R.drawable.ic_arrow_up, "", null);
        fold.setOnClickListener(v -> {
            boolean open = panelBody.getVisibility() == View.VISIBLE;
            panelBody.setVisibility(open ? View.GONE : View.VISIBLE);
            Ui.withIcon(fold, open ? R.drawable.ic_arrow_down : R.drawable.ic_arrow_up, Ui.FG);
        });
        handle.addView(fold);
        panel.addView(handle);
        final float[] grab = new float[2];
        grip.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    grab[0] = e.getRawX() - panel.getX();
                    grab[1] = e.getRawY() - panel.getY();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    panel.setX(clamp(e.getRawX() - grab[0], 0, root.getWidth() - panel.getWidth()));
                    panel.setY(clamp(e.getRawY() - grab[1], 0, root.getHeight() - panel.getHeight()));
                    return true;
                default:
                    return true;
            }
        });

        panelBody = Ui.column(this);
        panelBody.addView(Ui.hint(this, "Перетаскивайте кнопки. Нажмите на кнопку — рядом откроется её настройка."));
        android.content.SharedPreferences ip = getSharedPreferences("wasteland", MODE_PRIVATE);
        // Все кнопки разом
        LinearLayout all = Ui.row(this);
        final int[] scale = {ip.getInt(com.wastelanddroid.engine.FalloutInput.BTN_SCALE, 100)};
        all.addView(Ui.slider(this, "Размер всех кнопок, %", 60, 160, scale[0], v -> {
            if (v == scale[0]) return;
            keys.scaleAll(v / (float) scale[0]);
            scale[0] = v;
            ip.edit().putInt(com.wastelanddroid.engine.FalloutInput.BTN_SCALE, v).apply();
        }), Ui.weight());
        all.addView(Ui.slider(this, "Прозрачность всех, %", 20, 100,
                ip.getInt(com.wastelanddroid.engine.FalloutInput.BTN_OPACITY, 100), v -> {
                    keys.opacityAll(v / 100f);
                    ip.edit().putInt(com.wastelanddroid.engine.FalloutInput.BTN_OPACITY, v).apply();
                }), Ui.weight());
        panelBody.addView(all);
        LinearLayout look = Ui.row(this);
        look.addView(Ui.slider(this, "Чувствительность обзора, %", 30, 300,
                ip.getInt(com.wastelanddroid.engine.FalloutInput.LOOK_SENS, 115),
                v -> ip.edit().putInt(com.wastelanddroid.engine.FalloutInput.LOOK_SENS, v).apply()), Ui.weight());
        panelBody.addView(look);
        LinearLayout opts = Ui.row(this);
        opts.addView(pref(ip, "Обзор с кнопки огня", com.wastelanddroid.engine.FalloutInput.FIRE_LOOK, true), Ui.weight());
        opts.addView(pref(ip, "Обзор правой половиной", com.wastelanddroid.engine.FalloutInput.LOOK_RIGHT, false), Ui.weight());
        panelBody.addView(opts);
        LinearLayout opts2 = Ui.row(this);
        opts2.addView(pref(ip, "Вибрация", com.wastelanddroid.engine.FalloutInput.HAPTICS, true), Ui.weight());
        opts2.addView(pref(ip, "Касание = клик мыши", com.wastelanddroid.engine.FalloutInput.TAP_FIRES, true), Ui.weight());
        CheckBox labels = Ui.check(this, "Подписи", ip.getBoolean(com.wastelanddroid.engine.FalloutInput.BTN_LABELS, true));
        labels.setOnCheckedChangeListener((v, on) -> {
            ip.edit().putBoolean(com.wastelanddroid.engine.FalloutInput.BTN_LABELS, on).apply();
            keys.labelsAll(on);
        });
        opts2.addView(labels, Ui.weight());
        panelBody.addView(opts2);
        LinearLayout opts3 = Ui.row(this);
        opts3.addView(pref(ip, "Показывать курсор", com.wastelanddroid.engine.FalloutInput.SHOW_CURSOR, true), Ui.weight());
        opts3.addView(pref(ip, "Инверсия по вертикали", com.wastelanddroid.engine.FalloutInput.INVERT_Y, false), Ui.weight());
        panelBody.addView(opts3);
        LinearLayout colors = Ui.row(this);
        colors.addView(Ui.hint(this, "Цвет кнопок:"));
        int[] palette = {Ui.ACCENT_COLORS[1], Ui.ACCENT_COLORS[0], Ui.ACCENT_COLORS[2]};
        String[] paletteNames = {"Оранжевый", "Зелёный", "Белый"};
        for (int i = 0; i < palette.length; i++) {
            int color = palette[i];
            Button sw = Ui.styledButton(this, paletteNames[i], v -> {
                ControllerPrefs.INSTANCE.setTint(this, color);
                keys.refreshAppearance();
            }, color, Color.argb(255, 10, 16, 10), 0);
            sw.setTextSize(11);
            colors.addView(sw);
        }
        panelBody.addView(colors);

        LinearLayout actions = Ui.row(this);
        actions.addView(Ui.ghostButton(this, R.drawable.ic_plus, "Добавить кнопку", v -> addKey()), Ui.weight());
        actions.addView(Ui.ghostButton(this, R.drawable.ic_restore, "Сбросить", v -> {
            ControllerPrefs.INSTANCE.setScreenKeys(this, PcLayout.defaults(this));
            ip.edit().putInt(com.wastelanddroid.engine.FalloutInput.BTN_SCALE, 100)
                    .putInt(com.wastelanddroid.engine.FalloutInput.BTN_OPACITY, 100).apply();
            keys.load(ControllerPrefs.INSTANCE.encodeScreenKeys(PcLayout.defaults(this)));
            keys.startEditing();
            closeMini();
            Toast.makeText(this, "Стандартная раскладка Fallout", Toast.LENGTH_SHORT).show();
        }), Ui.weight());
        actions.addView(Ui.button(this, R.drawable.ic_check, "Готово", v -> finish()));
        panelBody.addView(actions);
        panel.addView(panelBody);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Ui.dp(this, 580), -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lp.topMargin = Ui.dp(this, 6);
        root.addView(panel, lp);
        Anim.enterFromTop(panel, 80);
    }

    private CheckBox pref(android.content.SharedPreferences ip, String text, String key, boolean def) {
        CheckBox c = Ui.check(this, text, ip.getBoolean(key, def));
        c.setOnCheckedChangeListener((v, on) -> ip.edit().putBoolean(key, on).apply());
        return c;
    }

    private void addKey() {
        int code = 18; // E — потом меняется в мини-редакторе
        for (Object[] c : PcLayout.CHOICES) {
            int candidate = (Integer) c[0];
            if (keys.stateOf(Collections.singletonList(candidate)) == null) { code = candidate; break; }
        }
        keys.add(Collections.singletonList(code));
        showMini(Collections.singletonList(code));
    }

    // ───────────── мини-редактор кнопки ─────────────

    private void closeMini() {
        if (mini != null) { root.removeView(mini); mini = null; }
        selected = null;
    }

    private void showMini(List<Integer> codes) {
        closeMini();
        if (codes == null) return;
        ScreenKey state = keys.stateOf(codes);
        if (state == null) return;
        selected = codes;
        boolean stick = state.getShape() == ScreenKeyKt.SCREEN_KEY_STICK || state.getShape() == ScreenKeyKt.SCREEN_KEY_DPAD;

        mini = Ui.column(this);
        mini.setBackground(Ui.rounded(Color.argb(246, 14, 20, 16), Ui.AMBER, 14, this));
        int p = Ui.dp(this, 10);
        mini.setPadding(p, p, p, p);

        LinearLayout head = Ui.row(this);
        TextView title = Ui.label(this, stick ? "Стик движения (WASD)" : "Кнопка: " + state.shownLabel(this));
        title.setTypeface(Ui.mono(true));
        title.setTextColor(Ui.AMBER);
        head.addView(title, Ui.weight());
        head.addView(Ui.ghostButton(this, R.drawable.ic_cross, "", v -> closeMini()));
        mini.addView(head);

        mini.addView(Ui.slider(this, "Размер", ScreenKeys.MIN_SIZE, ScreenKeys.MAX_SIZE, state.getSize(),
                v -> keys.resize(codes, v)));
        mini.addView(Ui.slider(this, "Прозрачность, %", 15, 100, Math.round(state.getOpacity() * 100),
                v -> keys.setOpacity(codes, v / 100f)));

        if (!stick) {
            mini.addView(Ui.hint(this, "Форма:"));
            LinearLayout shapes = Ui.row(this);
            int[][] forms = {
                    {ScreenKeyKt.SCREEN_KEY_CIRCLE, 0}, {ScreenKeyKt.SCREEN_KEY_RECT, 0},
                    {ScreenKeyKt.SCREEN_KEY_OVAL, 0}, {ScreenKeyKt.SCREEN_KEY_DIAMOND, 0},
                    {ScreenKeyKt.SCREEN_KEY_HEX, 0}, {ScreenKeyKt.SCREEN_KEY_NONE, 0},
            };
            String[] names = {"Круг", "Квадрат", "Овал", "Ромб", "Шестиуг.", "Без формы"};
            for (int i = 0; i < forms.length; i++) {
                int shape = forms[i][0];
                boolean on = state.getShape() == shape;
                Button bt = on ? Ui.button(this, names[i], null) : Ui.ghostButton(this, names[i], null);
                bt.setTextSize(11);
                bt.setOnClickListener(v -> { keys.setShape(codes, shape); showMini(codes); });
                shapes.addView(bt);
            }
            mini.addView(shapes);

            CheckBox toggle = Ui.check(this, "Фиксация (нажал — держится)", state.getToggle());
            toggle.setOnCheckedChangeListener((v, on) -> keys.setToggle(codes, on));
            mini.addView(toggle);

            TextView what = Ui.hint(this, "Что делает кнопка:");
            mini.addView(what);
            GridLayout grid = new GridLayout(this);
            grid.setColumnCount(2);
            int current = codes.isEmpty() ? 0 : codes.get(0);
            for (Object[] choice : PcLayout.CHOICES) {
                int code = (Integer) choice[0];
                String label = (String) choice[1];
                boolean on = code == current;
                Button bt = on ? Ui.button(this, label, null) : Ui.ghostButton(this, label, null);
                bt.setTextSize(11);
                bt.setOnClickListener(v -> {
                    if (keys.stateOf(Collections.singletonList(code)) != null && code != current) {
                        Toast.makeText(this, "Такая кнопка уже есть", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    ScreenKey changed = keys.setCodes(codes, Collections.singletonList(code));
                    keys.setText(Collections.singletonList(code), shortLabel(label));
                    showMini(changed != null ? changed.getCodes() : Collections.singletonList(code));
                });
                grid.addView(bt);
            }
            ScrollView sv = new ScrollView(this);
            sv.addView(grid);
            mini.addView(sv, new LinearLayout.LayoutParams(-1, Ui.dp(this, 170)));

            mini.addView(Ui.styledButton(this, "Удалить кнопку", v -> {
                keys.remove(codes);
                closeMini();
            }, Color.argb(60, 255, 100, 90), Ui.RED, Ui.RED));
        }

        root.addView(mini, new FrameLayout.LayoutParams(Ui.dp(this, 340), -2));
        float kx = state.getX() * root.getWidth();
        float ky = state.getY() * root.getHeight();
        mini.post(() -> {
            float gap = Ui.dp(this, 60);
            float mx = kx < root.getWidth() / 2f ? kx + gap : kx - gap - mini.getWidth();
            float my = ky - mini.getHeight() / 2f;
            mini.setX(clamp(mx, Ui.dp(this, 8), root.getWidth() - mini.getWidth() - Ui.dp(this, 8)));
            mini.setY(clamp(my, Ui.dp(this, 8), root.getHeight() - mini.getHeight() - Ui.dp(this, 8)));
            Anim.enter(mini, 0);
        });
    }

    /** «E — действие» → «E»: на кнопке нужен короткий текст. */
    private static String shortLabel(String full) {
        int dash = full.indexOf('—');
        String head = dash > 0 ? full.substring(0, dash).trim() : full;
        if (head.toLowerCase().contains("мышь")) return dash > 0 ? full.substring(dash + 1).trim() : head;
        return head;
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(Math.max(lo, hi), v)); }

    @Override
    protected void onPause() {
        super.onPause();
        ControllerPrefs.INSTANCE.setScreenKeys(this, ControllerPrefs.INSTANCE.decodeScreenKeys(keys.export()));
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
