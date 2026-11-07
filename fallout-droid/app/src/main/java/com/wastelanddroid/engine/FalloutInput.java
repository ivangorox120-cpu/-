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

    private FalloutInput() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Обзор только правой половиной экрана: слева остаётся стик движения. */
    public static boolean lookOnRightOnly(Context c) { return p(c).getBoolean(LOOK_RIGHT, true); }

    /** Чувствительность обзора, проценты (100 = как мышь один к одному). */
    public static float lookSensitivity(Context c) { return p(c).getInt(LOOK_SENS, 115) / 100f; }

    /** Стрелять по касанию экрана (обычно не нужно: огонь на экранной кнопке). */
    public static boolean tapFires(Context c) { return p(c).getBoolean(TAP_FIRES, false); }
}
