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
    public static final String SHOW_CURSOR = "show_cursor";
    public static final String INVERT_Y = "invert_y";
    public static final String DEBUG = "input_debug";
    /** Способ доставки мыши игре: compositor | relative | device. */
    public static final String MOUSE_MODE = "mouse_mode";
    public static final String MOUSE_COMPOSITOR = "compositor";
    public static final String MOUSE_RELATIVE = "relative";
    public static final String MOUSE_DEVICE = "device";
    /** Касания двигают курсор игры (gamescope, режим hover). */
    public static final String MOUSE_TOUCH = "touch";
    /** Касания двигают курсор и нажимают левую кнопку (gamescope, режим left). */
    public static final String MOUSE_TOUCH_CLICK = "touchclick";
    public static final String HAPTICS = "key_haptics";
    public static final String BTN_SCALE = "btn_scale";
    public static final String BTN_OPACITY = "btn_opacity";
    public static final String BTN_LABELS = "btn_labels";

    private FalloutInput() {}

    private static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Обзор только правой половиной экрана: слева остаётся стик движения. */
    public static boolean lookOnRightOnly(Context c) { return p(c).getBoolean(LOOK_RIGHT, false); }

    /** Чувствительность обзора, проценты (100 = как мышь один к одному). */
    public static float lookSensitivity(Context c) { return p(c).getInt(LOOK_SENS, 115) / 100f; }

    /** Стрелять по касанию экрана (обычно не нужно: огонь на экранной кнопке). */
    public static boolean tapFires(Context c) { return p(c).getBoolean(TAP_FIRES, true); }

    /** Обзор пальцем, который держит кнопку огня. */
    public static boolean fireLook(Context c) { return p(c).getBoolean(FIRE_LOOK, true); }

    /** Вибрация при нажатии экранных кнопок. */
    public static boolean haptics(Context c) { return p(c).getBoolean(HAPTICS, true); }

    /**
     * Мышь как в Winlator: игре идут только относительные сдвиги, без «телепорта» курсора
     * в точку. Fallout читает мышь через DirectInput и сам рисует курсор по этим сдвигам;
     * абсолютная позиция ему мешает — игра возвращает курсор назад, и он стоит на месте.
     */
    public static boolean relativeMouse(Context c) { return p(c).getBoolean(RELATIVE_MOUSE, true); }

    /** Рисовать свой указатель, даже когда игра прячет системный курсор (меню Fallout). */
    public static boolean showCursor(Context c) { return p(c).getBoolean(SHOW_CURSOR, true); }

    /** Инверсия обзора по вертикали. */
    public static boolean invertY(Context c) { return p(c).getBoolean(INVERT_Y, false); }

    /** Строка отладки ввода поверх игры. */
    public static boolean debug(Context c) { return p(c).getBoolean(DEBUG, false); }

    public static String mouseMode(Context c) {
        return p(c).getString(MOUSE_MODE, MOUSE_TOUCH);
    }

    public static boolean mouseDevice(Context c) { return MOUSE_DEVICE.equals(mouseMode(c)); }

    /** Касания уходят игре как есть, а в мышь их превращает gamescope. */
    public static boolean mouseTouch(Context c) {
        String m = mouseMode(c);
        return MOUSE_TOUCH.equals(m) || MOUSE_TOUCH_CLICK.equals(m);
    }

    /** Номер режима касаний gamescope для выбранного способа, или null. */
    public static String gamescopeTouchMode(Context c) {
        String m = mouseMode(c);
        if (MOUSE_TOUCH.equals(m)) return "0";
        if (MOUSE_TOUCH_CLICK.equals(m)) return "1";
        return null;
    }

    public static boolean mouseRelativeOnly(Context c) {
        String m = mouseMode(c);
        return MOUSE_RELATIVE.equals(m) || MOUSE_DEVICE.equals(m);
    }
}
