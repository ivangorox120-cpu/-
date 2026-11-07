package com.wastelanddroid.game;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Подготовка префикса Proton до запуска игры: ключи реестра установщика (без них игра
 * пишет, что не установлена / не куплена, и выходит) и файлы ini в «Мои документы».
 */
public final class ProtonPrefix {
    private ProtonPrefix() {}

    /** «Мои документы/My Games/<Игра>» внутри префикса Proton. */
    public static File myGamesDir(GameDef g, File pfx) {
        return new File(pfx, "drive_c/users/steamuser/Documents/My Games/" + g.folder);
    }

    /** Windows-путь к папке игры: Wine видит корень Linux-среды как диск Z:. */
    public static String windowsPath(String guestDir) {
        String p = guestDir.endsWith("/") ? guestDir : guestDir + "/";
        return "Z:" + p.replace('/', '\\');
    }

    /** Записывает "Installed Path" и сопутствующие ключи в system.reg префикса. */
    public static void writeRegistry(File pfx, GameDef g, String guestDir) throws IOException {
        File reg = new File(pfx, "system.reg");
        if (!reg.isFile()) throw new IOException("Префикс Proton ещё не создан");
        List<String> lines = new ArrayList<>(Files.readAllLines(reg.toPath(), StandardCharsets.UTF_8));
        String esc = windowsPath(guestDir).replace("\\", "\\\\");
        String[] keys = {
                "Software\\\\Bethesda Softworks\\\\" + g.folder,
                "Software\\\\Wow6432Node\\\\Bethesda Softworks\\\\" + g.folder,
        };
        for (String key : keys) removeSection(lines, key);
        long now = System.currentTimeMillis() / 1000;
        for (String key : keys) {
            lines.add("");
            lines.add("[" + key + "] " + now);
            lines.add("\"Installed Path\"=\"" + esc + "\"");
            lines.add("\"Installed\"=dword:00000001");
        }
        File tmp = new File(reg.getPath() + ".fd-tmp");
        Files.write(tmp.toPath(), (String.join("\n", lines) + "\n").getBytes(StandardCharsets.UTF_8));
        if (!tmp.renameTo(reg)) throw new IOException("Не удалось обновить реестр");
    }

    /** Удаляет секцию [key] (до следующей секции) из файла реестра Wine. */
    private static void removeSection(List<String> lines, String key) {
        String head = "[" + key.toLowerCase(Locale.ROOT) + "]";
        for (int i = 0; i < lines.size(); i++) {
            String l = lines.get(i).toLowerCase(Locale.ROOT);
            if (!l.startsWith(head)) continue;
            int j = i + 1;
            while (j < lines.size() && !lines.get(j).startsWith("[")) j++;
            // убираем и пустую строку перед секцией
            int from = (i > 0 && lines.get(i - 1).trim().isEmpty()) ? i - 1 : i;
            lines.subList(from, j).clear();
            i = from - 1;
        }
    }
}
