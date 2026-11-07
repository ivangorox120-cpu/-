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

    /** Размер кнопки из доли высоты экрана (так задана раскладка) в единицах экранных кнопок. */
    private static int sz(float fraction) { return Math.round(fraction * 350f); }

    /**
     * Раскладка по умолчанию — привычная схема мобильных шутеров: стик слева, крупная «Огонь»
     * справа внизу (с неё же можно вести камеру), вокруг — прицел, прыжок, действие,
     * перезарядка и V.A.T.S.; служебные кнопки — тонкой строкой сверху.
     */
    public static List<ScreenKey> defaults() {
        int C = ScreenKeyKt.SCREEN_KEY_CIRCLE, P = ScreenKeyKt.SCREEN_KEY_PILL;
        List<ScreenKey> keys = new ArrayList<>();
        // Ходьба: стик с диагоналями (пустые слоты = нажимаются две соседние клавиши)
        keys.add(new ScreenKey(Arrays.asList(W, 0, D, 0, S, 0, A, 0), 0.14f, 0.70f, sz(0.34f), "", "", "", 1f,
                ScreenKeyKt.SCREEN_KEY_STICK, false, true));
        // Бой
        keys.add(key(BTN_LEFT, 0.90f, 0.68f, sz(0.21f), "ОГОНЬ", C, false));
        keys.add(key(BTN_RIGHT, 0.92f, 0.36f, sz(0.14f), "ПРИЦЕЛ", C, false));
        keys.add(key(E, 0.76f, 0.86f, sz(0.14f), "ВЗЯТЬ", C, false));
        keys.add(key(SPACE, 0.775f, 0.56f, sz(0.13f), "ПРЫЖОК", C, false));
        keys.add(key(R, 0.655f, 0.88f, sz(0.12f), "ПЕРЕЗ.", C, false));
        keys.add(key(V, 0.66f, 0.66f, sz(0.12f), "V.A.T.S.", C, false));
        keys.add(key(LCTRL, 0.05f, 0.40f, sz(0.12f), "ПРИСЕСТЬ", C, false));
        keys.add(key(CAPS, 0.05f, 0.22f, sz(0.10f), "БЕГ/ШАГ", C, false));
        // Верхняя строка
        keys.add(key(ESC, 0.045f, 0.08f, sz(0.10f), "МЕНЮ", P, false));
        keys.add(key(F5, 0.125f, 0.08f, sz(0.10f), "СОХР.", P, false));
        keys.add(key(F9, 0.205f, 0.08f, sz(0.10f), "ЗАГР.", P, false));
        keys.add(key(T, 0.285f, 0.08f, sz(0.10f), "ЖДАТЬ", P, false));
        keys.add(key(F, 0.85f, 0.08f, sz(0.10f), "ВИД", P, false));
        keys.add(key(TAB, 0.95f, 0.08f, sz(0.12f), "PIP-BOY", P, false));
        // Быстрые слоты 1-8 внизу по центру
        for (int i = 1; i <= 8; i++) {
            keys.add(key(K1 + i - 1, 0.24f + i * 0.045f, 0.94f, sz(0.08f), String.valueOf(i), C, false));
        }
        return keys;
    }

    private static final int LAYOUT_VERSION = 2;

    /** Ставит раскладку по умолчанию, если игрок ещё ничего не настраивал или раскладка устарела. */
    public static void installIfEmpty(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences("wasteland", Context.MODE_PRIVATE);
        boolean old = p.getInt("layout_version", 1) < LAYOUT_VERSION;
        if (!old && !ControllerPrefs.INSTANCE.screenKeys(c).isEmpty()) return;
        ControllerPrefs.INSTANCE.setScreenKeys(c, defaults());
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
