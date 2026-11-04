package com.wastelanddroid.game;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import com.wastelanddroid.util.Files2;

/**
 * Работа с PE-заголовком Fallout3.exe.
 *
 * Флаг IMAGE_FILE_LARGE_ADDRESS_AWARE позволяет 32-битной игре использовать до 4 ГБ
 * адресного пространства вместо 2 ГБ. Нехватка памяти — главная причина «случайных»
 * вылетов в долгих сессиях и в DLC (The Pitt, Point Lookout) даже на ПК.
 * Патч обратим: перед изменением создаётся резервная копия Fallout3.exe.wdbak.
 */
public final class ExePatcher {
    private static final int IMAGE_FILE_LARGE_ADDRESS_AWARE = 0x0020;

    public static final class Info {
        public String error;
        public boolean largeAddressAware;
        public boolean usesGfwl;
        public boolean steamDrm;
        long characteristicsOffset = -1;
    }

    private ExePatcher() {}

    public static Info inspect(File exe) {
        Info info = new Info();
        try (RandomAccessFile f = new RandomAccessFile(exe, "r")) {
            if (f.length() < 1024) { info.error = "Fallout3.exe повреждён (слишком мал)."; return info; }
            if (f.readUnsignedByte() != 'M' || f.readUnsignedByte() != 'Z') {
                info.error = "Fallout3.exe не является PE-файлом."; return info;
            }
            f.seek(0x3C);
            long pe = Integer.toUnsignedLong(Integer.reverseBytes(f.readInt()));
            f.seek(pe);
            if (Integer.reverseBytes(f.readInt()) != 0x00004550) { info.error = "Неверная PE-сигнатура."; return info; }
            int machine = Short.toUnsignedInt(Short.reverseBytes(f.readShort()));
            if (machine != 0x014C) { info.error = "Ожидался 32-битный x86 exe."; return info; }
            int sections = Short.toUnsignedInt(Short.reverseBytes(f.readShort()));
            f.skipBytes(12);
            int optSize = Short.toUnsignedInt(Short.reverseBytes(f.readShort()));
            info.characteristicsOffset = f.getFilePointer();
            int ch = Short.toUnsignedInt(Short.reverseBytes(f.readShort()));
            info.largeAddressAware = (ch & IMAGE_FILE_LARGE_ADDRESS_AWARE) != 0;

            long secTable = info.characteristicsOffset + 2 + optSize;
            byte[] name = new byte[8];
            for (int i = 0; i < sections && i < 96; i++) {
                f.seek(secTable + 40L * i);
                f.readFully(name);
                String n = new String(name, StandardCharsets.US_ASCII).replace("\0", "");
                if (n.equals(".bind")) info.steamDrm = true; // SteamStub
            }
            info.usesGfwl = containsAscii(f, "xlive.dll");
        } catch (IOException e) {
            info.error = "Не удалось прочитать Fallout3.exe: " + e.getMessage();
        }
        return info;
    }

    /** Ищет строку в таблице импорта грубым поиском по первым 16 МБ (быстро, без разбора импорта). */
    private static boolean containsAscii(RandomAccessFile f, String needle) throws IOException {
        byte[] n = needle.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.US_ASCII);
        long len = Math.min(f.length(), 16L << 20);
        byte[] buf = new byte[1 << 20];
        long pos = 0;
        while (pos < len) {
            f.seek(pos);
            int r = f.read(buf, 0, (int) Math.min(buf.length, len - pos));
            if (r <= 0) break;
            outer:
            for (int i = 0; i + n.length <= r; i++) {
                for (int j = 0; j < n.length; j++) {
                    int b = buf[i + j];
                    if (b >= 'A' && b <= 'Z') b += 32;
                    if (b != n[j]) continue outer;
                }
                return true;
            }
            if (r < n.length) break;
            pos += r - n.length + 1;
        }
        return false;
    }

    /** @return true, если флаг установлен (или уже был). */
    public static boolean applyLargeAddressAware(File exe) throws IOException {
        Info info = inspect(exe);
        if (info.error != null) throw new IOException(info.error);
        if (info.largeAddressAware) return true;
        if (info.steamDrm) return false;
        File backup = new File(exe.getPath() + ".wdbak");
        if (!backup.exists()) Files2.copy(exe, backup);
        try (RandomAccessFile f = new RandomAccessFile(exe, "rw")) {
            f.seek(info.characteristicsOffset);
            int ch = Short.toUnsignedInt(Short.reverseBytes(f.readShort()));
            ch |= IMAGE_FILE_LARGE_ADDRESS_AWARE;
            f.seek(info.characteristicsOffset);
            f.writeShort(Short.reverseBytes((short) ch));
        }
        return true;
    }
}
