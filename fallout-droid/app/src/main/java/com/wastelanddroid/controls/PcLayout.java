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

    /** Размер кнопки задан долей высоты экрана, как в раскладке-образце. */
    private static int sz(Context c, float fraction) {
        android.util.DisplayMetrics dm = c.getResources().getDisplayMetrics();
        float heightDp = Math.min(dm.widthPixels, dm.heightPixels) / dm.density;
        return Math.round(fraction * heightDp);
    }

    private static ScreenKey key(Context c, int code, float x, float y, float frac, String text, int shape) {
        return key(code, x, y, sz(c, frac), text, shape, false);
    }

    /**
     * Раскладка по умолчанию — как в мобильных портах Fallout: стик слева, крупная «Огонь»
     * справа внизу, вокруг неё прицел, прыжок, действие, перезарядка и V.A.T.S.; присед и шаг
     * слева, служебные кнопки строкой сверху, быстрые слоты внизу по центру.
     * Координаты и размеры взяты из присланной раскладки, верхняя строка разнесена шире:
     * наши «таблетки» с подписями шире квадратных кнопок оригинала.
     */
    public static List<ScreenKey> defaults(Context c) {
        int C = ScreenKeyKt.SCREEN_KEY_CIRCLE, P = ScreenKeyKt.SCREEN_KEY_PILL;
        List<ScreenKey> keys = new ArrayList<>();
        keys.add(new ScreenKey(Arrays.asList(W, 0, D, 0, S, 0, A, 0), 0.14f, 0.70f, sz(c, 0.34f), "", "", "", 1f,
                ScreenKeyKt.SCREEN_KEY_STICK, false, true));
        // бой
        keys.add(key(c, BTN_LEFT, 0.90f, 0.68f, 0.21f, "ОГОНЬ", C));
        keys.add(key(c, BTN_RIGHT, 0.92f, 0.36f, 0.14f, "ПРИЦЕЛ", C));
        keys.add(key(c, E, 0.76f, 0.86f, 0.14f, "ВЗЯТЬ", C));
        keys.add(key(c, SPACE, 0.775f, 0.56f, 0.13f, "ПРЫЖОК", C));
        keys.add(key(c, R, 0.655f, 0.88f, 0.12f, "ПЕРЕЗ.", C));
        keys.add(key(c, V, 0.66f, 0.66f, 0.12f, "V.A.T.S.", C));
        // слева
        keys.add(key(c, LCTRL, 0.05f, 0.40f, 0.12f, "ПРИСЕСТЬ", C));
        keys.add(key(c, CAPS, 0.05f, 0.22f, 0.10f, "БЕГ/ШАГ", C));
        // служебные сверху
        keys.add(key(c, ESC, 0.06f, 0.08f, 0.075f, "МЕНЮ", P));
        keys.add(key(c, F5, 0.18f, 0.08f, 0.075f, "СОХР", P));
        keys.add(key(c, F9, 0.30f, 0.08f, 0.075f, "ЗАГР", P));
        keys.add(key(c, T, 0.42f, 0.08f, 0.075f, "ЖДАТЬ", P));
        keys.add(key(c, F, 0.78f, 0.08f, 0.075f, "ВИД", P));
        keys.add(key(c, TAB, 0.90f, 0.08f, 0.075f, "ПИП-БОЙ", P));
        // быстрые слоты
        for (int i = 1; i <= 8; i++) {
            keys.add(key(c, K1 + i - 1, 0.24f + i * 0.045f, 0.94f, 0.08f, String.valueOf(i), C));
        }
        return keys;
    }

    private static final int LAYOUT_VERSION = 4;

    /** Ставит раскладку по умолчанию, если игрок ещё ничего не настраивал или раскладка устарела. */
    public static void installIfEmpty(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences("wasteland", Context.MODE_PRIVATE);
        boolean old = p.getInt("layout_version", 1) < LAYOUT_VERSION;
        if (!old && !ControllerPrefs.INSTANCE.screenKeys(c).isEmpty()) return;
        ControllerPrefs.INSTANCE.setScreenKeys(c, defaults(c));
        ControllerPrefs.INSTANCE.setTint(c, com.wastelanddroid.util.Ui.FG);
        p.edit().putInt("layout_version", LAYOUT_VERSION)
                .putInt(com.wastelanddroid.engine.FalloutInput.BTN_SCALE, 100).apply();
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
