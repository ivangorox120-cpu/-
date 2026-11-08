package com.wastelanddroid.engine;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Настройки ввода Fallout Droid, которые читает экран игры движка.
 * Лежат в тех же настройках приложения, что и остальной интерфейс.
 */
public final class FalloutInput {
    private static final String PREFS = "wasteland";
    public static final String LOOK_RIGHT = "look_right_half";
    public static final String LOOK_SENS = "look_sensitivity";
    public static final String TAP_FIRES = "tap_fires";
    public static final String FIRE_LOOK = "fire_look";
    public static final String RELATIVE_MOUSE = "relative_mouse";
    public static final String HAPTICS = "key_haptics";
    public static final String BTN_SCALE = "btn_scale";
    public static final String BTN_OPACITY = "btn_opacity";
    public static final String BTN_LABELS = "btn_labels";

    private FalloutInput() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Обзор только правой половиной экрана: слева остаётся стик движения. */
    public static boolean lookOnRightOnly(Context c) { return p(c).getBoolean(LOOK_RIGHT, true); }

    /** Чувствительность обзора, проценты (100 = как мышь один к одному). */
    public static float lookSensitivity(Context c) { return p(c).getInt(LOOK_SENS, 115) / 100f; }

    /** Стрелять по касанию экрана (обычно не нужно: огонь на экранной кнопке). */
    public static boolean tapFires(Context c) { return p(c).getBoolean(TAP_FIRES, true); }

    /** Обзор пальцем, который держит кнопку огня. */
    public static boolean fireLook(Context c) { return p(c).getBoolean(FIRE_LOOK, true); }

    /** Вибрация при нажатии экранных кнопок. */
    public static boolean haptics(Context c) { return p(c).getBoolean(HAPTICS, true); }

    /** Относительные сдвиги мыши вдобавок к положению курсора (как в Winlator) — для DirectInput. */
    public static boolean relativeMouse(Context c) { return p(c).getBoolean(RELATIVE_MOUSE, true); }
}
