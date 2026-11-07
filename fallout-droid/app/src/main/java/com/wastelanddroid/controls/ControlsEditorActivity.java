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
import android.widget.TextView;
import android.widget.Toast;

import com.droiddeck.launcher.R;
import com.droiddeck.launcher.input.ControllerPrefs;
import com.droiddeck.launcher.input.OnScreenControls;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.Ui;
import com.wastelanddroid.util.WastelandBackdrop;

/**
 * Редактор экранного геймпада, который видит игра (FO3/NV понимают геймпад Xbox 360 целиком,
 * включая меню и V.A.T.S.).
 *  - перетаскивание групп кнопок (с привязкой к сетке);
 *  - нажатие на кнопку открывает рядом с ней мини-редактор: что эта кнопка делает;
 *  - общая панель (размер, прозрачность, цвет, сброс) перетаскивается за ручку и сворачивается.
 */
public final class ControlsEditorActivity extends Activity {
    /** Что делает кнопка геймпада в Fallout 3 / New Vegas (стандартная схема игры). */
    private static final String[][] TARGETS = {
            {"a", "A — Действие / взять"}, {"b", "B — Пип-бой / назад"}, {"x", "X — Перезарядка"}, {"y", "Y — Прыжок"},
            {"lb", "LB — Схватить"}, {"rb", "RB — V.A.T.S."}, {"lt", "LT — Прицел"}, {"rt", "RT — Огонь"},
            {"select", "Back — Ожидание"}, {"start", "Start — Меню"},
            {"up", "Вверх"}, {"down", "Вниз"}, {"left", "Влево"}, {"right", "Вправо"},
    };

    private OnScreenControls controls;
    private LinearLayout panel, panelBody, mini;
    private FrameLayout root;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        WastelandBackdrop bg = new WastelandBackdrop(this);
        bg.setAlpha(0.45f);
        root.addView(bg, new FrameLayout.LayoutParams(-1, -1));

        controls = new OnScreenControls(this, null, true, null);
        controls.setOnSelect((id, group, x, y) -> { runOnUiThread(() -> showMini(id, x, y)); return kotlin.Unit.INSTANCE; });
        root.addView(controls, new FrameLayout.LayoutParams(-1, -1));

        buildPanel();
        setContentView(root);
        controls.reload();
    }

    // ───────────── общая панель (перетаскиваемая) ─────────────

    @SuppressLint("ClickableViewAccessibility")
    private void buildPanel() {
        panel = Ui.column(this);
        panel.setBackground(Ui.rounded(Color.argb(235, 16, 22, 18), Ui.LINE, 16, this));
        int p = Ui.dp(this, 10);
        panel.setPadding(p, Ui.dp(this, 4), p, p);

        // Ручка: за неё панель перетаскивается; кнопка справа сворачивает/разворачивает
        LinearLayout handle = Ui.row(this);
        TextView grip = Ui.label(this, "=  НАСТРОЙКА КНОПОК  =");
        grip.setTypeface(Ui.mono(true));
        grip.setTextColor(Ui.AMBER);
        grip.setGravity(Gravity.CENTER);
        handle.addView(grip, Ui.weight());
        Button fold = Ui.ghostButton(this, R.drawable.ic_arrow_down, "", null);
        fold.setOnClickListener(v -> {
            boolean open = panelBody.getVisibility() == View.VISIBLE;
            panelBody.setVisibility(open ? View.GONE : View.VISIBLE);
            Ui.withIcon(fold, open ? R.drawable.ic_arrow_up : R.drawable.ic_arrow_down, Ui.FG);
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
        ControllerPrefs.Settings s = ControllerPrefs.INSTANCE.read(this);
        panelBody.addView(Ui.hint(this, "Перетаскивайте кнопки пальцем. Нажмите на кнопку — откроется её настройка."));
        LinearLayout sliders = Ui.row(this);
        sliders.addView(Ui.slider(this, "Размер, %", 50, 200, s.getSize(), v -> { ControllerPrefs.INSTANCE.setSize(this, v); controls.reload(); }), Ui.weight());
        sliders.addView(Ui.slider(this, "Прозрачность, %", 10, 100, s.getOpacity(), v -> { ControllerPrefs.INSTANCE.setOpacity(this, v); controls.reload(); }), Ui.weight());
        panelBody.addView(sliders);

        LinearLayout tints = Ui.row(this);
        tints.addView(Ui.hint(this, "Цвет:"));
        int[][] palette = {{0xFF8AFF80, 0}, {0xFFFFB840, 0}, {0xFFFFFFFF, 0}, {0xFF6EC8FF, 0}};
        for (int[] c : palette) {
            View sw = new View(this);
            sw.setBackground(Ui.rounded(c[0], Ui.LINE, 14, this));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(Ui.dp(this, 30), Ui.dp(this, 30));
            lp.setMargins(Ui.dp(this, 6), Ui.dp(this, 4), Ui.dp(this, 6), Ui.dp(this, 4));
            sw.setOnClickListener(v -> { ControllerPrefs.INSTANCE.setTint(this, c[0]); controls.reload(); });
            Anim.pressable(sw);
            tints.addView(sw, lp);
        }
        CheckBox snap = Ui.check(this, "Привязка к сетке", s.getSnap());
        snap.setOnCheckedChangeListener((v, on) -> { ControllerPrefs.INSTANCE.setSnap(this, on); controls.reload(); });
        tints.addView(snap);
        panelBody.addView(tints);

        LinearLayout actions = Ui.row(this);
        actions.addView(Ui.ghostButton(this, R.drawable.ic_restore, "Сбросить расположение", v -> {
            controls.resetLayout();
            Toast.makeText(this, "Расположение по умолчанию", Toast.LENGTH_SHORT).show();
        }), Ui.weight());
        actions.addView(Ui.ghostButton(this, R.drawable.ic_restore, "Сбросить назначения", v -> {
            ControllerPrefs.INSTANCE.resetMapping(this);
            controls.reload();
        }), Ui.weight());
        actions.addView(Ui.button(this, R.drawable.ic_check, "Готово", v -> finish()));
        panelBody.addView(actions);
        panel.addView(panelBody);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Ui.dp(this, 560), -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lp.topMargin = Ui.dp(this, 8);
        root.addView(panel, lp);
        Anim.enterFromTop(panel, 100);
    }

    // ───────────── мини-редактор кнопки ─────────────

    private void showMini(String id, float x, float y) {
        if (mini != null) { root.removeView(mini); mini = null; }
        if (id == null) return;
        mini = Ui.column(this);
        mini.setBackground(Ui.rounded(Color.argb(245, 16, 22, 18), Ui.AMBER, 14, this));
        int p = Ui.dp(this, 10);
        mini.setPadding(p, p, p, p);
        LinearLayout head = Ui.row(this);
        TextView t = Ui.label(this, "Кнопка " + id.toUpperCase() + " делает:");
        t.setTypeface(Ui.mono(true));
        head.addView(t, Ui.weight());
        Button close = Ui.ghostButton(this, R.drawable.ic_cross, "", v -> { root.removeView(mini); mini = null; });
        head.addView(close);
        mini.addView(head);

        String current = controls.targetOf(id);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(2);
        for (String[] target : TARGETS) {
            boolean on = target[0].equals(current);
            Button bt = on ? Ui.button(this, target[1], null) : Ui.ghostButton(this, target[1], null);
            bt.setTextSize(12);
            bt.setOnClickListener(v -> {
                ControllerPrefs.INSTANCE.setTarget(this, id, target[0]);
                controls.reload();
                showMini(id, x, y); // перерисовать с новой отметкой
            });
            grid.addView(bt);
        }
        mini.addView(grid);

        int w = Ui.dp(this, 380);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, -2);
        root.addView(mini, lp);
        // ставим рядом с кнопкой, на свободную сторону экрана, чтобы не закрывать её
        mini.post(() -> {
            float gap = Ui.dp(this, 70);
            float mx = x < root.getWidth() / 2f ? x + gap : x - gap - mini.getWidth();
            float my = y - mini.getHeight() / 2f;
            mini.setX(clamp(mx, Ui.dp(this, 8), root.getWidth() - mini.getWidth() - Ui.dp(this, 8)));
            mini.setY(clamp(my, Ui.dp(this, 8), root.getHeight() - mini.getHeight() - Ui.dp(this, 8)));
            Anim.enter(mini, 0);
        });
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(Math.max(lo, hi), v)); }

    @Override
    protected void onPause() {
        super.onPause();
        controls.saveLayout();
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
