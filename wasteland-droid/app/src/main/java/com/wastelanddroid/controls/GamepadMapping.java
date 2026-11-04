package com.wastelanddroid.controls;

import android.content.Context;
import android.view.KeyEvent;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Назначение кнопок геймпада на клавиши игры (Windows VK). Левый стик — ходьба (WASD),
 * правый — обзор (мышь), курки — огонь/прицел. Схема по умолчанию повторяет привычную
 * раскладку консольных версий; любую кнопку можно переназначить в редакторе.
 */
public final class GamepadMapping {
    /** Псевдо-коды для курков и крестовины (их нет среди KeyEvent-кнопок, если они приходят осями). */
    public static final int PAD_RT = 10001, PAD_LT = 10002;
    public static final int PAD_UP = 10003, PAD_DOWN = 10004, PAD_LEFT = 10005, PAD_RIGHT = 10006;

    /** Порядок и подписи для редактора. */
    public static final Map<Integer, String> BUTTON_NAMES = new LinkedHashMap<>();
    static {
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_A, "A");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_B, "B");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_X, "X");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_Y, "Y");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_L1, "LB");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_R1, "RB");
        BUTTON_NAMES.put(PAD_LT, "LT");
        BUTTON_NAMES.put(PAD_RT, "RT");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_THUMBL, "L3");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_THUMBR, "R3");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_START, "Start");
        BUTTON_NAMES.put(KeyEvent.KEYCODE_BUTTON_SELECT, "Back");
        BUTTON_NAMES.put(PAD_UP, "Крестовина ↑");
        BUTTON_NAMES.put(PAD_DOWN, "Крестовина ↓");
        BUTTON_NAMES.put(PAD_LEFT, "Крестовина ←");
        BUTTON_NAMES.put(PAD_RIGHT, "Крестовина →");
    }

    public final Map<Integer, Integer> keys = new LinkedHashMap<>();
    /** Кнопки с фиксацией (присед). */
    public final java.util.Set<Integer> toggles = new java.util.HashSet<>();
    public float lookSpeed = 1.0f;
    public float deadzone = 0.18f;
    public boolean invertY = false;

    public static GamepadMapping defaults() {
        GamepadMapping m = new GamepadMapping();
        m.keys.put(KeyEvent.KEYCODE_BUTTON_A, 0x45);      // E — использовать
        m.keys.put(KeyEvent.KEYCODE_BUTTON_B, 0x09);      // Tab — Пип-бой / назад
        m.keys.put(KeyEvent.KEYCODE_BUTTON_X, 0x52);      // R — перезарядка
        m.keys.put(KeyEvent.KEYCODE_BUTTON_Y, 0x20);      // пробел — прыжок
        m.keys.put(KeyEvent.KEYCODE_BUTTON_L1, 0x56);     // V — V.A.T.S.
        m.keys.put(KeyEvent.KEYCODE_BUTTON_R1, 0x5A);     // Z — схватить
        m.keys.put(PAD_LT, 0x02);                          // ПКМ — прицел
        m.keys.put(PAD_RT, 0x01);                          // ЛКМ — огонь
        m.keys.put(KeyEvent.KEYCODE_BUTTON_THUMBL, 0x11); // Ctrl — присед
        m.keys.put(KeyEvent.KEYCODE_BUTTON_THUMBR, 0x46); // F — вид от 1/3 лица
        m.keys.put(KeyEvent.KEYCODE_BUTTON_START, 0x1B);  // Esc — меню
        m.keys.put(KeyEvent.KEYCODE_BUTTON_SELECT, 0x54); // T — ожидание
        m.keys.put(PAD_UP, 0x31);
        m.keys.put(PAD_DOWN, 0x32);
        m.keys.put(PAD_LEFT, 0x33);
        m.keys.put(PAD_RIGHT, 0x34);
        m.toggles.add(KeyEvent.KEYCODE_BUTTON_THUMBL);
        return m;
    }

    private static File file(Context c) { return new File(c.getFilesDir(), "gamepad.json"); }

    public static GamepadMapping load(Context c) {
        GamepadMapping m = defaults();
        try {
            File f = file(c);
            if (!f.exists()) return m;
            JSONObject o = new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
            JSONObject k = o.getJSONObject("keys");
            m.keys.clear();
            for (java.util.Iterator<String> it = k.keys(); it.hasNext(); ) {
                String key = it.next();
                m.keys.put(Integer.parseInt(key), k.getInt(key));
            }
            m.toggles.clear();
            org.json.JSONArray t = o.optJSONArray("toggles");
            if (t != null) for (int i = 0; i < t.length(); i++) m.toggles.add(t.getInt(i));
            m.lookSpeed = (float) o.optDouble("lookSpeed", 1.0);
            m.deadzone = (float) o.optDouble("deadzone", 0.18);
            m.invertY = o.optBoolean("invertY", false);
        } catch (Exception e) {
            return defaults();
        }
        return m;
    }

    public void save(Context c) throws Exception {
        JSONObject k = new JSONObject();
        for (Map.Entry<Integer, Integer> e : keys.entrySet()) k.put(String.valueOf(e.getKey()), e.getValue());
        org.json.JSONArray t = new org.json.JSONArray();
        for (int v : toggles) t.put(v);
        JSONObject o = new JSONObject().put("keys", k).put("toggles", t)
                .put("lookSpeed", lookSpeed).put("deadzone", deadzone).put("invertY", invertY);
        Files.write(file(c).toPath(), o.toString(2).getBytes(StandardCharsets.UTF_8));
    }
}
