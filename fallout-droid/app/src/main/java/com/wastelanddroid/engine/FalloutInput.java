package com.wastelanddroid.engine;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Настройки ввода Fallout Droid, которые читает экран игры движка.
 * Лежат в тех же настройках приложения, что и остальной интерфейс.
 */
public final class FalloutInput {
    private static final String PREFS = "wasteland";

    // обзор и касания
    public static final String LOOK_RIGHT = "look_right_half";
    public static final String LOOK_SENS = "look_sensitivity";
    public static final String TAP_FIRES = "tap_fires";
    public static final String FIRE_LOOK = "fire_look";
    public static final String INVERT_Y = "invert_y";
    public static final String SHOW_CURSOR = "show_cursor";
    // экранные кнопки
    public static final String HAPTICS = "key_haptics";
    public static final String BTN_SCALE = "btn_scale";
    public static final String BTN_OPACITY = "btn_opacity";
    public static final String BTN_LABELS = "btn_labels";
    // движок
    public static final String DEBUG = "input_debug";
    /** Постоянный относительный режим мыши в gamescope (--force-grab-cursor). */
    public static final String GRAB_CURSOR = "grab_cursor";

    private FalloutInput() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Обзор только правой половиной экрана: слева остаётся стик движения. */
    public static boolean lookOnRightOnly(Context c) { return p(c).getBoolean(LOOK_RIGHT, false); }

    /** Чувствительность обзора, проценты (100 = как мышь один к одному). */
    public static float lookSensitivity(Context c) { return p(c).getInt(LOOK_SENS, 115) / 100f; }

    /** Короткое касание нажимает левую кнопку мыши. */
    public static boolean tapFires(Context c) { return p(c).getBoolean(TAP_FIRES, true); }

    /** Обзор пальцем, который держит кнопку огня. */
    public static boolean fireLook(Context c) { return p(c).getBoolean(FIRE_LOOK, true); }

    /** Инверсия обзора по вертикали. */
    public static boolean invertY(Context c) { return p(c).getBoolean(INVERT_Y, false); }

    /** Рисовать свой указатель, даже когда игра прячет системный курсор. */
    public static boolean showCursor(Context c) { return p(c).getBoolean(SHOW_CURSOR, true); }

    /** Вибрация при нажатии экранных кнопок. */
    public static boolean haptics(Context c) { return p(c).getBoolean(HAPTICS, true); }

    /** Строка отладки ввода поверх игры. */
    public static boolean debug(Context c) { return p(c).getBoolean(DEBUG, false); }

    public static boolean grabCursor(Context c) { return p(c).getBoolean(GRAB_CURSOR, true); }
}
