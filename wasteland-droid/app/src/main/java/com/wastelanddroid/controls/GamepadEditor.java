package com.wastelanddroid.controls;

import android.app.Activity;
import android.app.AlertDialog;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.util.Ui;

import java.util.Map;

/** Диалог назначения кнопок геймпада. */
public final class GamepadEditor {
    private GamepadEditor() {}

    public static void show(Activity a) {
        GamepadMapping m = GamepadMapping.load(a);
        LinearLayout col = Ui.column(a);
        int p = Ui.dp(a, 16);
        col.setPadding(p, p / 2, p, p / 2);

        TextView status = Ui.withIcon(Ui.hint(a, GamepadInput.anyConnected() ? "Геймпад подключён" : "Геймпад не обнаружен — подключите по Bluetooth или USB"), com.wastelanddroid.R.drawable.ic_gamepad, Ui.FG_DIM);
        col.addView(status);
        col.addView(Ui.hint(a, "Левый стик — ходьба, правый — обзор"));
        col.addView(Ui.slider(a, "Скорость обзора, %", 20, 300, Math.round(m.lookSpeed * 100), v -> m.lookSpeed = v / 100f));
        col.addView(Ui.slider(a, "Мёртвая зона стиков, %", 5, 40, Math.round(m.deadzone * 100), v -> m.deadzone = v / 100f));
        CheckBox inv = Ui.check(a, "Инвертировать ось Y", m.invertY);
        inv.setOnCheckedChangeListener((v, on) -> m.invertY = on);
        col.addView(inv);

        for (Map.Entry<Integer, String> e : GamepadMapping.BUTTON_NAMES.entrySet()) {
            int pad = e.getKey();
            LinearLayout row = Ui.row(a);
            TextView name = Ui.label(a, e.getValue());
            row.addView(name, Ui.weight());
            Integer vk = m.keys.get(pad);
            android.widget.Button b = Ui.ghostButton(a, vk == null ? "—" : KeyNames.name(vk), null);
            b.setOnClickListener(v -> new AlertDialog.Builder(a)
                    .setTitle(e.getValue())
                    .setSingleChoiceItems(KeyNames.NAMES, vk == null ? -1 : KeyNames.indexOf(m.keys.getOrDefault(pad, 0)), (d, which) -> {
                        m.keys.put(pad, KeyNames.CODES[which]);
                        b.setText(KeyNames.NAMES[which]);
                        d.dismiss();
                    })
                    .setNeutralButton("Не назначать", (d, w) -> { m.keys.remove(pad); b.setText("—"); })
                    .show());
            row.addView(b);
            CheckBox tog = Ui.check(a, "фикс.", m.toggles.contains(pad));
            tog.setOnCheckedChangeListener((v, on) -> { if (on) m.toggles.add(pad); else m.toggles.remove(pad); });
            row.addView(tog);
            col.addView(row);
        }

        ScrollView sv = new ScrollView(a);
        sv.addView(col);
        new AlertDialog.Builder(a)
                .setTitle("Геймпад")
                .setView(sv)
                .setPositiveButton("Сохранить", (d, w) -> {
                    try { m.save(a); Toast.makeText(a, "Раскладка геймпада сохранена", Toast.LENGTH_SHORT).show(); }
                    catch (Exception ex) { Toast.makeText(a, "Ошибка: " + ex.getMessage(), Toast.LENGTH_LONG).show(); }
                })
                .setNeutralButton("По умолчанию", (d, w) -> {
                    try { GamepadMapping.defaults().save(a); } catch (Exception ignored) {}
                })
                .setNegativeButton("Отмена", null)
                .show();
    }
}
