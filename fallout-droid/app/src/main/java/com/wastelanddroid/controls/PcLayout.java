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

    /** Раскладка по умолчанию: стик WASD слева, мышь и действия справа, служебные сверху. */
    public static List<ScreenKey> defaults() {
        List<ScreenKey> keys = new ArrayList<>();
        // Ходьба: стик с диагоналями (пустые слоты = нажимаются две соседние клавиши)
        keys.add(new ScreenKey(Arrays.asList(W, 0, D, 0, S, 0, A, 0), 0.13f, 0.70f, 120, "", "", "", 1f,
                ScreenKeyKt.SCREEN_KEY_STICK, false, true));
        // Мышь — огонь и прицел
        keys.add(key(BTN_LEFT, 0.90f, 0.62f, 68, "Огонь", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        keys.add(key(BTN_RIGHT, 0.78f, 0.80f, 56, "Прицел", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        // Действия
        keys.add(key(E, 0.78f, 0.47f, 50, "E", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        keys.add(key(SPACE, 0.93f, 0.86f, 50, "Прыжок", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(R, 0.67f, 0.90f, 44, "R", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        keys.add(key(LCTRL, 0.31f, 0.90f, 44, "Присед", ScreenKeyKt.SCREEN_KEY_PILL, true));
        keys.add(key(CAPS, 0.31f, 0.74f, 40, "Шаг", ScreenKeyKt.SCREEN_KEY_PILL, true));
        keys.add(key(V, 0.90f, 0.42f, 50, "VATS", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(Z, 0.67f, 0.74f, 40, "Взять", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(F, 0.84f, 0.10f, 40, "Вид", ScreenKeyKt.SCREEN_KEY_PILL, false));
        // Служебные
        keys.add(key(TAB, 0.05f, 0.10f, 44, "Pip-Boy", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(ESC, 0.95f, 0.10f, 40, "Esc", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(T, 0.37f, 0.10f, 40, "Ждать", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(F5, 0.17f, 0.10f, 36, "F5", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(F9, 0.27f, 0.10f, 36, "F9", ScreenKeyKt.SCREEN_KEY_PILL, false));
        keys.add(key(K1, 0.47f, 0.10f, 36, "1", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        keys.add(key(K2, 0.55f, 0.10f, 36, "2", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        keys.add(key(K3, 0.63f, 0.10f, 36, "3", ScreenKeyKt.SCREEN_KEY_CIRCLE, false));
        return keys;
    }

    /** Ставит раскладку по умолчанию, если игрок ещё ничего не настраивал. */
    public static void installIfEmpty(Context c) {
        if (!ControllerPrefs.INSTANCE.screenKeys(c).isEmpty()) return;
        ControllerPrefs.INSTANCE.setScreenKeys(c, defaults());
    }

    /** Подписи и коды для мини-редактора: что обычно нужно в Fallout. */
    public static final Object[][] CHOICES = {
            {BTN_LEFT, "Левая мышь — огонь"}, {BTN_RIGHT, "Правая мышь — прицел"}, {BTN_MIDDLE, "Средняя мышь"},
            {E, "E — действие"}, {R, "R — перезарядка"}, {SPACE, "Пробел — прыжок"}, {LCTRL, "Ctrl — присед"},
            {LSHIFT, "Shift — бег"}, {CAPS, "Caps — шаг"}, {TAB, "Tab — Пип-бой"}, {V, "V — V.A.T.S."},
            {F, "F — вид от 1/3 лица"}, {Z, "Z — взять предмет"}, {T, "T — ожидание"}, {ESC, "Esc — меню"},
            {F5, "F5 — быстрое сохранение"}, {F9, "F9 — быстрая загрузка"},
            {K1, "1 — оружие 1"}, {K2, "2 — оружие 2"}, {K3, "3 — оружие 3"},
            {W, "W — вперёд"}, {S, "S — назад"}, {A, "A — влево"}, {D, "D — вправо"},
            {28, "Enter — ввод"}, {ScreenKeyKt.SCREEN_KEY_PILL == 0 ? 41 : 41, "~ — консоль"},
    };
}
