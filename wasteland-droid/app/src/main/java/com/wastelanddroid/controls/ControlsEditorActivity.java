package com.wastelanddroid.controls;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.util.Ui;

import java.io.IOException;

/** Редактор раскладки: положение (перетаскивание), размер, прозрачность, назначение клавиш. */
public final class ControlsEditorActivity extends Activity {
    private ControlLayout layout;
    private ControlsOverlay overlay;
    private LinearLayout selPanel;
    private TextView selTitle;
    private SeekBar selSize, selAlpha;
    private CheckBox selToggle;
    private Button selKey;
    private boolean binding;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        layout = ControlLayout.load(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(28, 34, 28));
        overlay = new ControlsOverlay(this);
        overlay.setLayout(layout);
        overlay.setEditMode(true, this::onSelected);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(Color.argb(220, 10, 14, 10));
        int pad = Ui.dp(this, 10);
        panel.setPadding(pad, pad, pad, pad);

        LinearLayout global = Ui.row(this);
        global.addView(Ui.slider(this, "Размер всех", 50, 200, Math.round(layout.globalScale * 100),
                v -> { layout.globalScale = v / 100f; overlay.invalidate(); }), Ui.weight());
        global.addView(Ui.slider(this, "Прозрачность всех", 5, 100, Math.round(layout.globalAlpha * 100),
                v -> { layout.globalAlpha = v / 100f; overlay.invalidate(); }), Ui.weight());
        global.addView(Ui.slider(this, "Чувствительность обзора", 20, 400, Math.round(layout.lookSensitivity * 100),
                v -> layout.lookSensitivity = v / 100f), Ui.weight());
        panel.addView(global);

        selPanel = Ui.row(this);
        selTitle = Ui.label(this, "");
        selPanel.addView(selTitle);
        View sizeV = Ui.slider(this, "Размер", 4, 50, 14, v -> {
            ControlButton s = overlay.getSelected();
            if (s != null && !binding) { s.size = v / 100f; overlay.invalidate(); }
        });
        selSize = sizeV.findViewWithTag("seek");
        selPanel.addView(sizeV, Ui.weight());
        View alphaV = Ui.slider(this, "Прозрачность", 0, 100, 100, v -> {
            ControlButton s = overlay.getSelected();
            if (s != null && !binding) { s.alpha = v / 100f; overlay.invalidate(); }
        });
        selAlpha = alphaV.findViewWithTag("seek");
        selPanel.addView(alphaV, Ui.weight());
        selKey = Ui.button(this, "Клавиша", v -> chooseKey());
        selPanel.addView(selKey);
        selToggle = new CheckBox(this);
        selToggle.setText("Фиксация");
        selToggle.setTextColor(Ui.FG);
        selToggle.setOnCheckedChangeListener((cb, on) -> { ControlButton s = overlay.getSelected(); if (s != null && !binding) s.toggle = on; });
        selPanel.addView(selToggle);
        selPanel.addView(Ui.button(this, "Удалить", v -> deleteSelected()));
        selPanel.setVisibility(View.GONE);
        panel.addView(selPanel);

        LinearLayout actions = Ui.row(this);
        actions.addView(Ui.button(this, "+ Кнопка", v -> addButton()));
        actions.addView(Ui.button(this, "Сбросить", v -> {
            try { ControlLayout.defaults().save(this); } catch (IOException ignored) {}
            recreate();
        }));
        actions.addView(Ui.button(this, "Сохранить", v -> save(true)));
        panel.addView(actions);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(panel, lp);

        // Панель можно свернуть, чтобы видеть нижние кнопки.
        Button hide = Ui.button(this, "▼ панель", null);
        hide.setOnClickListener(v -> {
            boolean vis = panel.getVisibility() == View.VISIBLE;
            panel.setVisibility(vis ? View.GONE : View.VISIBLE);
            hide.setText(vis ? "▲ панель" : "▼ панель");
        });
        root.addView(hide, new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL));
        setContentView(root);
    }

    private void onSelected(ControlButton b) {
        if (b == null || b.type == ControlButton.Type.LOOK_PAD) { selPanel.setVisibility(View.GONE); return; }
        binding = true;
        selPanel.setVisibility(View.VISIBLE);
        selTitle.setText(b.type == ControlButton.Type.STICK ? "Стик" : "«" + b.label + "»");
        selSize.setProgress(Math.round(b.size * 100) - 4);
        selAlpha.setProgress(Math.round(b.alpha * 100));
        boolean isBtn = b.type == ControlButton.Type.BUTTON;
        selKey.setVisibility(isBtn ? View.VISIBLE : View.GONE);
        selToggle.setVisibility(isBtn ? View.VISIBLE : View.GONE);
        selKey.setText("Клавиша: " + KeyNames.name(b.vk));
        selToggle.setChecked(b.toggle);
        binding = false;
    }

    private void chooseKey() {
        ControlButton b = overlay.getSelected();
        if (b == null) return;
        new AlertDialog.Builder(this)
                .setTitle("Назначить клавишу")
                .setSingleChoiceItems(KeyNames.NAMES, KeyNames.indexOf(b.vk), (d, which) -> {
                    b.vk = KeyNames.CODES[which];
                    if (b.label.isEmpty() || b.label.length() <= 2) b.label = KeyNames.NAMES[which];
                    d.dismiss();
                    onSelected(b);
                    overlay.invalidate();
                }).show();
    }

    private void addButton() {
        ControlButton b = new ControlButton("btn" + System.currentTimeMillis(), "Q", ControlButton.Type.BUTTON, 0x51, 0.5f, 0.5f, 0.11f);
        layout.buttons.add(b);
        overlay.select(b);
    }

    private void deleteSelected() {
        ControlButton b = overlay.getSelected();
        if (b == null || b.type != ControlButton.Type.BUTTON) return;
        layout.buttons.remove(b);
        overlay.select(null);
    }

    private void save(boolean toast) {
        try {
            layout.save(this);
            if (toast) Toast.makeText(this, "Раскладка сохранена", Toast.LENGTH_SHORT).show();
        } catch (IOException e) {
            Toast.makeText(this, "Ошибка сохранения: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onPause() { super.onPause(); save(false); }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
