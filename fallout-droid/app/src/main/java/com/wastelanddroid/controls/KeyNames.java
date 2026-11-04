package com.wastelanddroid.controls;

/** Список назначаемых клавиш для редактора (Windows Virtual-Key коды). */
public final class KeyNames {
    private KeyNames() {}

    public static final String[] NAMES;
    public static final int[] CODES;

    static {
        java.util.List<String> n = new java.util.ArrayList<>();
        java.util.List<Integer> c = new java.util.ArrayList<>();
        Object[][] fixed = {
                {"ЛКМ", 0x01}, {"ПКМ", 0x02}, {"СКМ", 0x04}, {"Пробел", 0x20}, {"Enter", 0x0D}, {"Esc", 0x1B},
                {"Tab", 0x09}, {"Shift", 0x10}, {"Ctrl", 0x11}, {"Alt", 0x12}, {"Caps Lock", 0x14},
                {"Backspace", 0x08}, {"Вверх", 0x26}, {"Вниз", 0x28}, {"Влево", 0x25}, {"Вправо", 0x27},
                {"`/~ (консоль)", 0xC0},
        };
        for (Object[] f : fixed) { n.add((String) f[0]); c.add((Integer) f[1]); }
        for (char ch = 'A'; ch <= 'Z'; ch++) { n.add(String.valueOf(ch)); c.add((int) ch); }
        for (char ch = '0'; ch <= '9'; ch++) { n.add(String.valueOf(ch)); c.add((int) ch); }
        for (int i = 1; i <= 12; i++) { n.add("F" + i); c.add(0x70 + i - 1); }
        NAMES = n.toArray(new String[0]);
        CODES = new int[c.size()];
        for (int i = 0; i < CODES.length; i++) CODES[i] = c.get(i);
    }

    public static String name(int vk) {
        for (int i = 0; i < CODES.length; i++) if (CODES[i] == vk) return NAMES[i];
        return String.format("0x%02X", vk);
    }

    public static int indexOf(int vk) {
        for (int i = 0; i < CODES.length; i++) if (CODES[i] == vk) return i;
        return 0;
    }
}
