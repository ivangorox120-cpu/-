package com.wastelanddroid.controls;

import android.content.Context;

import com.droiddeck.launcher.input.ControllerPrefs;
import com.droiddeck.launcher.input.ScreenKey;
import com.droiddeck.launcher.input.ScreenKeyKt;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Экранная раскладка под ПК-версию Fallout 3 / New Vegas: клавиатура и мышь.
 * Коды — evdev (их понимает движок), мышь: 272 левая, 273 правая, 274 средняя.
 * Обзор — свайпом по пустому месту экрана (режим «тачпад» включается при запуске).
 */
public final class PcLayout {
    public static final int BTN_LEFT = 272, BTN_RIGHT = 273, BTN_MIDDLE = 274;

    private static final int W = 17, A = 30, S = 31, D = 32;
    private static final int E = 18, R = 19, SPACE = 57, LCTRL = 29, TAB = 15, V = 47, F = 33, Z = 44, T = 20;
    private static final int ESC = 1, F5 = 63, F9 = 67, K1 = 2, K2 = 3, K3 = 4, LSHIFT = 42, CAPS = 58;

    private PcLayout() {}

    public static boolean isMouse(int code) { return code >= BTN_LEFT && code <= 0x117; }

    private static ScreenKey key(int code, float x, float y, int size, String text, int shape, boolean toggle) {
        return new ScreenKey(java.util.Collections.singletonList(code), x, y, size, "", text, "", 1f, shape, toggle, true);
    }

    /**
     * Раскладка по умолчанию: стик WASD слева, крупная «Огонь» справа (с неё же можно вести
     * камеру), вокруг неё прицел, действие, прыжок, перезарядка и V.A.T.S.; слева присед и шаг;
     * служебные кнопки — короткими «таблетками» сверху, разнесёнными так, чтобы не наезжали.
     */
    public static List<ScreenKey> defaults() {
        int C = ScreenKeyKt.SCREEN_KEY_CIRCLE, P = ScreenKeyKt.SCREEN_KEY_PILL;
        List<ScreenKey> keys = new ArrayList<>();
        keys.add(new ScreenKey(Arrays.asList(W, 0, D, 0, S, 0, A, 0), 0.13f, 0.70f, 116, "", "", "", 1f,
                ScreenKeyKt.SCREEN_KEY_STICK, false, true));
        // бой
        keys.add(key(BTN_LEFT, 0.885f, 0.68f, 72, "Огонь", C, false));
        keys.add(key(BTN_RIGHT, 0.745f, 0.86f, 50, "Прицел", C, false));
        keys.add(key(E, 0.735f, 0.58f, 46, "Взять", C, false));
        keys.add(key(SPACE, 0.905f, 0.37f, 46, "Прыжок", C, false));
        keys.add(key(R, 0.615f, 0.88f, 40, "Перез.", C, false));
        keys.add(key(V, 0.775f, 0.33f, 42, "VATS", C, false));
        // слева
        keys.add(key(LCTRL, 0.055f, 0.42f, 40, "Присед", C, false));
        keys.add(key(CAPS, 0.055f, 0.24f, 34, "Шаг", C, false));
        // сверху
        keys.add(key(ESC, 0.07f, 0.08f, 30, "Меню", P, false));
        keys.add(key(F5, 0.21f, 0.08f, 30, "Сохр", P, false));
        keys.add(key(F9, 0.35f, 0.08f, 30, "Загр", P, false));
        keys.add(key(F, 0.745f, 0.08f, 30, "Вид", P, false));
        keys.add(key(TAB, 0.905f, 0.08f, 30, "Пип-бой", P, false));
        // быстрые слоты
        for (int i = 0; i < 4; i++) {
            keys.add(key(K1 + i, 0.40f + i * 0.06f, 0.92f, 30, String.valueOf(i + 1), C, false));
        }
        return keys;
    }

    private static final int LAYOUT_VERSION = 3;

    /** Ставит раскладку по умолчанию, если игрок ещё ничего не настраивал или раскладка устарела. */
    public static void installIfEmpty(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences("wasteland", Context.MODE_PRIVATE);
        boolean old = p.getInt("layout_version", 1) < LAYOUT_VERSION;
        if (!old && !ControllerPrefs.INSTANCE.screenKeys(c).isEmpty()) return;
        ControllerPrefs.INSTANCE.setScreenKeys(c, defaults());
        ControllerPrefs.INSTANCE.setTint(c, com.wastelanddroid.util.Ui.FG);
        p.edit().putInt("layout_version", LAYOUT_VERSION).putInt(com.wastelanddroid.engine.FalloutInput.BTN_SCALE, 100).apply();
    }

    /** Подписи и коды для мини-редактора: что обычно нужно в Fallout. */
    public static final Object[][] CHOICES = {
            {BTN_LEFT, "Левая мышь — огонь"}, {BTN_RIGHT, "Правая мышь — прицел"}, {BTN_MIDDLE, "Средняя мышь"},
            {E, "E — действие"}, {R, "R — перезарядка"}, {SPACE, "Пробел — прыжок"}, {LCTRL, "Ctrl — присед"},
            {LSHIFT, "Shift — бег"}, {CAPS, "Caps — шаг"}, {TAB, "Tab — Пип-бой"}, {V, "V — V.A.T.S."},
            {F, "F — вид от 1/3 лица"}, {Z, "Z — взять предмет"}, {T, "T — ожидание"}, {ESC, "Esc — меню"},
            {F5, "F5 — быстрое сохранение"}, {F9, "F9 — быстрая загрузка"},
            {K1, "1 — слот 1"}, {K2, "2 — слот 2"}, {K3, "3 — слот 3"}, {5, "4 — слот 4"}, {6, "5 — слот 5"}, {7, "6 — слот 6"}, {8, "7 — слот 7"}, {9, "8 — слот 8"},
            {W, "W — вперёд"}, {S, "S — назад"}, {A, "A — влево"}, {D, "D — вправо"},
            {28, "Enter — ввод"}, {ScreenKeyKt.SCREEN_KEY_PILL == 0 ? 41 : 41, "~ — консоль"},
    };
}
