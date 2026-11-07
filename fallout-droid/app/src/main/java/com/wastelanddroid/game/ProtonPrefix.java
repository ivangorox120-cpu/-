package com.wastelanddroid.game;

import com.wastelanddroid.util.Files2;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Работа с префиксом Proton: ключи реестра установщика (без них часть копий игры пишет,
 * что не установлена) и каталог «Мои документы».
 *
 * Файл system.reg бывает в UTF-8 и в UTF-16, поэтому он не перечитывается и не переписывается
 * целиком: новая секция дописывается в конец в той же кодировке. Перед первой правкой
 * создаётся резервная копия.
 */
public final class ProtonPrefix {
    private static final String HEADER = "WINE REGISTRY";

    private ProtonPrefix() {}

    public static File myGamesDir(GameDef g, File pfx) {
        return new File(pfx, "drive_c/users/steamuser/Documents/My Games/" + g.folder);
    }

    /** Windows-путь к папке игры: Wine видит корень Linux-среды как диск Z:. */
    public static String windowsPath(String guestDir) {
        String p = guestDir.endsWith("/") ? guestDir : guestDir + "/";
        return "Z:" + p.replace('/', '\\');
    }

    private static File systemReg(File pfx) { return new File(pfx, "system.reg"); }

    /** Кодировка реестра Wine по метке порядка байтов; по умолчанию UTF-8. */
    private static Charset charsetOf(byte[] head) {
        if (head.length >= 2 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xFE) return StandardCharsets.UTF_16LE;
        if (head.length >= 2 && (head[0] & 0xFF) == 0xFE && (head[1] & 0xFF) == 0xFF) return StandardCharsets.UTF_16BE;
        // UTF-16 без метки: у ASCII-текста каждый второй байт нулевой
        if (head.length >= 4 && head[1] == 0 && head[3] == 0) return StandardCharsets.UTF_16LE;
        return StandardCharsets.UTF_8;
    }

    private static byte[] head(File f, int n) throws IOException {
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            byte[] b = new byte[(int) Math.min(n, r.length())];
            r.readFully(b);
            return b;
        }
    }

    /** Похож ли префикс на целый: есть реестр и он начинается правильным заголовком. */
    public static boolean looksValid(File pfx) {
        File reg = systemReg(pfx);
        if (!reg.isFile() || reg.length() < 64) return false;
        try {
            byte[] h = head(reg, 256);
            String text = new String(h, charsetOf(h)).replace("﻿", "");
            return text.trim().startsWith(HEADER);
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Префикс сломан: реестр есть, но испорчен. Каталог без реестра — не поломка: это префикс,
     * который Proton ещё не создавал (в нём могут лежать наши заранее записанные ini).
     */
    public static boolean isBroken(File pfx) {
        File reg = systemReg(pfx);
        return reg.exists() && !looksValid(pfx);
    }

    /** Есть ли уже наша секция с этим путём (чтобы не дописывать её каждый запуск). */
    private static boolean alreadyThere(File reg, Charset cs, String section, String path) throws IOException {
        String all = new String(Files.readAllBytes(reg.toPath()), cs);
        int at = all.indexOf("[" + section + "]");
        if (at < 0) return false;
        int end = all.indexOf("\n[", at);
        String block = end < 0 ? all.substring(at) : all.substring(at, end);
        return block.contains(path);
    }

    /**
     * Дописывает ключи установщика в конец system.reg, не трогая остальной файл.
     * @return true, если что-то дописали.
     */
    public static boolean writeRegistry(File pfx, GameDef g, String guestDir) throws IOException {
        File reg = systemReg(pfx);
        if (!looksValid(pfx)) throw new IOException("Реестр префикса недоступен или повреждён");
        Charset cs = charsetOf(head(reg, 8));
        String esc = windowsPath(guestDir).replace("\\", "\\\\");
        String[] sections = {
                "Software\\\\Bethesda Softworks\\\\" + g.folder,
                "Software\\\\Wow6432Node\\\\Bethesda Softworks\\\\" + g.folder,
        };
        StringBuilder add = new StringBuilder();
        long now = System.currentTimeMillis() / 1000;
        for (String section : sections) {
            if (alreadyThere(reg, cs, section, esc)) continue;
            add.append("\n[").append(section).append("] ").append(now).append('\n')
               .append("#time=0\n")
               .append("\"Installed Path\"=\"").append(esc).append("\"\n")
               .append("\"Installed\"=dword:00000001\n");
        }
        if (add.length() == 0) return false;
        File backup = new File(reg.getPath() + ".fd-backup");
        if (!backup.exists()) Files2.copy(reg, backup);
        byte[] bytes = add.toString().getBytes(cs);
        if (cs != StandardCharsets.UTF_8 && bytes.length >= 2
                && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xFE) {
            // метка порядка байтов нужна только в начале файла
            byte[] cut = new byte[bytes.length - 2];
            System.arraycopy(bytes, 2, cut, 0, cut.length);
            bytes = cut;
        }
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(reg, true)) {
            out.write(bytes);
        }
        if (!looksValid(pfx)) { // подстраховка: вернуть как было
            Files2.copy(backup, reg);
            throw new IOException("Запись в реестр отменена: файл стал нечитаемым");
        }
        return true;
    }

    /**
     * Восстановление после повреждённого префикса: папка удаляется целиком,
     * Proton создаст её заново при следующем запуске. Сохранения переносятся.
     */
    public static void recreate(GameDef g, File pfx, File savesBackupRoot) {
        File saves = new File(myGamesDir(g, pfx), "Saves");
        if (saves.isDirectory() && savesBackupRoot != null) {
            try {
                Files2.copyTree(saves, new File(new File(savesBackupRoot, g.id), "before-prefix-reset"));
            } catch (IOException ignored) {
                // копия сохранений — не повод отменять починку
            }
        }
        Files2.deleteTree(pfx);
    }
}
