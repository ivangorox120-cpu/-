package com.wastelanddroid.runtime;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Командная строка и окружение для запуска Fallout3.exe через Box64 + Wine. */
public final class LaunchConfig {
    public final List<String> argv = new ArrayList<>();
    public final List<String> env = new ArrayList<>();
    public final File cwd;

    /** Запуск игры (или fose_loader.exe) в виртуальном рабочем столе Wine. */
    public static LaunchConfig game(RuntimeManager rt, File gameDir, File exe, File dxvkConf, int width, int height,
                                    File tmpDir, String display) {
        // Виртуальный рабочий стол Wine: игра не переключает видеорежим 'экрана' —
        // это устраняет чёрный экран/зависание при сворачивании приложения.
        return new LaunchConfig(rt, gameDir, dxvkConf, tmpDir, display,
                "explorer", "/desktop=Wasteland," + width + "x" + height, toWinPath(exe));
    }

    /** Произвольная команда Wine (например, regedit /S для импорта ключей реестра). */
    public static LaunchConfig wine(RuntimeManager rt, File cwd, File dxvkConf, File tmpDir, String display,
                                    String... args) {
        return new LaunchConfig(rt, cwd, dxvkConf, tmpDir, display, args);
    }

    private LaunchConfig(RuntimeManager rt, File cwd, File dxvkConf, File tmpDir, String display, String... wineArgs) {
        this.cwd = cwd;
        String r = rt.root.getPath();

        // glibc-загрузчик запускает Box64; Box64 запускает x86_64-Wine (WoW64 → 32-битный exe).
        argv.add(rt.ldLinux().getPath());
        argv.add("--library-path");
        argv.add(r + "/lib:" + r + "/usr/lib");
        argv.add(rt.box64().getPath());
        argv.add(rt.wine().getPath());
        for (String a : wineArgs) argv.add(a);

        env.add("HOME=" + rt.prefix.getParent());
        env.add("USER=steamuser");
        env.add("TMPDIR=" + tmpDir.getPath());
        env.add("PATH=" + r + "/usr/bin:" + r + "/opt/wine/bin");
        env.add("LANG=en_US.UTF-8");
        env.add("DISPLAY=" + display);
        env.add("WINEPREFIX=" + rt.prefix.getPath());
        env.add("WINEARCH=win64");
        env.add("WINEDEBUG=-all");
        env.add("WINEESYNC=1");               // меньше системных вызовов на синхронизацию
        // xlive=n: используется xlive.dll из папки игры (заглушка GFWL из фикс-паков), если она есть.
        env.add("WINEDLLOVERRIDES=d3d9=n,b;xlive=n;winemenubuilder.exe=d;mscoree=d;mshtml=d");
        env.add("WINE_LARGE_ADDRESS_AWARE=1");

        env.add("DXVK_CONFIG_FILE=" + dxvkConf.getPath());
        env.add("DXVK_STATE_CACHE_PATH=" + rt.cache.getPath());
        env.add("DXVK_LOG_LEVEL=warn");
        env.add("DXVK_LOG_PATH=" + rt.logs.getPath());
        env.add("DXVK_FRAME_RATE=60");        // дублируем лок на случай перезаписи конфига
        env.add("VK_ICD_FILENAMES=" + rt.turnipIcd().getPath());
        env.add("MESA_VK_WSI_PRESENT_MODE=fifo");
        env.add("MESA_SHADER_CACHE_DIR=" + rt.cache.getPath());
        env.add("MESA_SHADER_CACHE_MAX_SIZE=1G");
        env.add("TU_DEBUG=noconform");

        // Box64: профиль 'стабильность прежде всего' для многопоточного Gamebryo.
        env.add("BOX64_LOG=0");
        env.add("BOX64_NOBANNER=1");
        env.add("BOX64_DYNAREC=1");
        env.add("BOX64_DYNAREC_BIGBLOCK=1");
        env.add("BOX64_DYNAREC_STRONGMEM=1"); // без этого — гонки между потоками движка → вылеты
        env.add("BOX64_DYNAREC_SAFEFLAGS=1");
        env.add("BOX64_DYNAREC_FASTNAN=1");
        env.add("BOX64_DYNAREC_FASTROUND=1");
        env.add("BOX64_DYNAREC_X87DOUBLE=1"); // точность x87, на которой построена физика
        env.add("BOX64_DYNAREC_CALLRET=1");
        env.add("BOX64_DYNAREC_WAIT=1");
        env.add("BOX64_MAXCPU=4");            // совпадает с числом 'больших' ядер на SD870
        env.add("BOX64_AVX=0");
    }

    /** Путь Android → путь Wine. Диск Z: в Wine смонтирован на корень файловой системы. */
    public static String toWinPath(File f) {
        return "Z:" + f.getAbsolutePath().replace('/', '\\');
    }

    public String[] argvArray() { return argv.toArray(new String[0]); }
    public String[] envArray() { return env.toArray(new String[0]); }
}
