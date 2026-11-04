package com.wastelanddroid.util;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Минимальный редактор INI, сохраняющий порядок строк и комментарии.
 * Движок игры читает ключи без учёта регистра, поэтому сравнение тоже без регистра.
 */
public final class IniFile {
    private final List<String> lines = new ArrayList<>();

    public static IniFile load(File f) throws IOException {
        IniFile ini = new IniFile();
        if (f.exists()) {
            // Оригинальные ini игры — в Windows-1252; ASCII-ключи читаются одинаково
            for (String l : new String(Files.readAllBytes(f.toPath()), StandardCharsets.ISO_8859_1).split("\r?\n", -1)) {
                ini.lines.add(l);
            }
            while (!ini.lines.isEmpty() && ini.lines.get(ini.lines.size() - 1).isEmpty()) {
                ini.lines.remove(ini.lines.size() - 1);
            }
        }
        return ini;
    }

    public void save(File f) throws IOException {
        File parent = f.getParentFile();
        if (parent != null) parent.mkdirs();
        String text = String.join("\r\n", lines) + "\r\n";
        File tmp = new File(f.getPath() + ".tmp");
        Files.write(tmp.toPath(), text.getBytes(StandardCharsets.ISO_8859_1));
        if (!tmp.renameTo(f)) throw new IOException("rename failed: " + f);
    }

    private static boolean isSection(String l, String section) {
        String t = l.trim();
        return t.startsWith("[") && t.endsWith("]")
                && t.substring(1, t.length() - 1).trim().equalsIgnoreCase(section);
    }

    private static String keyOf(String l) {
        int eq = l.indexOf('=');
        if (eq <= 0) return null;
        String t = l.trim();
        if (t.startsWith(";") || t.startsWith("#")) return null;
        return l.substring(0, eq).trim().toLowerCase(Locale.ROOT);
    }

    public String get(String section, String key) {
        boolean in = false;
        for (String l : lines) {
            String t = l.trim();
            if (t.startsWith("[")) { in = isSection(l, section); continue; }
            if (in && key.toLowerCase(Locale.ROOT).equals(keyOf(l))) {
                return l.substring(l.indexOf('=') + 1).trim();
            }
        }
        return null;
    }

    public void set(String section, String key, String value) {
        String k = key.toLowerCase(Locale.ROOT);
        int sectionStart = -1, sectionEnd = lines.size();
        for (int i = 0; i < lines.size(); i++) {
            String t = lines.get(i).trim();
            if (t.startsWith("[")) {
                if (sectionStart >= 0) { sectionEnd = i; break; }
                if (isSection(lines.get(i), section)) sectionStart = i;
            }
        }
        if (sectionStart < 0) {
            if (!lines.isEmpty()) lines.add("");
            lines.add("[" + section + "]");
            lines.add(key + "=" + value);
            return;
        }
        int lastNonEmpty = sectionStart;
        for (int i = sectionStart + 1; i < sectionEnd; i++) {
            if (k.equals(keyOf(lines.get(i)))) {
                lines.set(i, key + "=" + value);
                return;
            }
            if (!lines.get(i).trim().isEmpty()) lastNonEmpty = i;
        }
        lines.add(lastNonEmpty + 1, key + "=" + value);
    }
}
