package com.wastelanddroid.game;

import com.wastelanddroid.runtime.LaunchConfig;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Ключи реестра, которые в Windows записывает официальный установщик игры.
 *
 * Fallout 3 (как и New Vegas) ищет каталог установки в
 * HKLM\SOFTWARE\Bethesda Softworks\Fallout3 → "Installed Path". При 'переносе папки'
 * ключа нет, и игра/лаунчер отказываются стартовать (сообщение о повреждённой/некупленной
 * копии). Здесь просто восстанавливается то, что сделал бы установщик для вашей копии игры.
 * Защиту от копирования (SteamStub) это не затрагивает и не обходит.
 */
public final class Registry {
    private Registry() {}

    public static File writeRegFile(GameDef g, File gameDir, File outDir) throws IOException {
        String path = escape(LaunchConfig.toWinPath(gameDir) + "\\");
        StringBuilder sb = new StringBuilder("Windows Registry Editor Version 5.00\r\n\r\n");
        // 32-битный exe в 64-битном префиксе читает ветку Wow6432Node; пишем в обе.
        for (String root : new String[]{"HKEY_LOCAL_MACHINE\\SOFTWARE\\Wow6432Node", "HKEY_LOCAL_MACHINE\\SOFTWARE"}) {
            sb.append('[').append(root).append("\\Bethesda Softworks\\").append(g.folder).append("]\r\n")
              .append("\"Installed Path\"=\"").append(path).append("\"\r\n")
              .append("\"Installed\"=dword:00000001\r\n\r\n");
        }
        // Звук: принудительно стерео, иначе на некоторых сборках Wine/PulseAudio игра зависает на старте.
        sb.append("[HKEY_CURRENT_USER\\Software\\Wine\\DirectSound]\r\n")
          .append("\"DefaultSampleRate\"=\"44100\"\r\n\r\n");
        outDir.mkdirs();
        File f = new File(outDir, g.id + ".reg");
        // regedit принимает UTF-16LE с BOM
        byte[] body = sb.toString().getBytes(StandardCharsets.UTF_16LE);
        byte[] out = new byte[body.length + 2];
        out[0] = (byte) 0xFF; out[1] = (byte) 0xFE;
        System.arraycopy(body, 0, out, 2, body.length);
        Files.write(f.toPath(), out);
        return f;
    }

    private static String escape(String s) { return s.replace("\\", "\\\\").replace("\"", "\\\""); }
}
