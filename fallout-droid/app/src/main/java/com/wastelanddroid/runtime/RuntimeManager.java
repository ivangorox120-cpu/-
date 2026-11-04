package com.wastelanddroid.runtime;

import android.content.Context;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;

import com.wastelanddroid.util.Files2;

/**
 * Рантайм x86 → ARM64: glibc rootfs с Box64 (динамическая рекомпиляция x86/x86_64),
 * Wine (WoW64, для 32-битного Fallout3.exe), DXVK (D3D9 → Vulkan) и Mesa Turnip
 * (открытый Vulkan-драйвер Adreno — быстрее и стабильнее штатного для DXVK).
 *
 * Пакет рантайма (rootfs.tar.gz) собирается скриптом tools/build-runtime.sh и
 * импортируется пользователем; см. docs/RUNTIME.md о структуре.
 */
public final class RuntimeManager {
    public final File root;     // files/rootfs
    public final File prefix;   // files/prefix — WINEPREFIX
    public final File logs;
    public final File backups;
    public final File cache;    // кэш шейдеров DXVK и Mesa

    public RuntimeManager(Context ctx) {
        File base = ctx.getFilesDir();
        root = new File(base, "rootfs");
        prefix = new File(base, "prefix");
        logs = new File(ctx.getExternalFilesDir(null), "logs");
        backups = new File(ctx.getExternalFilesDir(null), "save-backups");
        cache = new File(ctx.getCacheDir().getParentFile(), "shader-cache");
        logs.mkdirs(); backups.mkdirs(); cache.mkdirs();
    }

    public File ldLinux() { return new File(root, "lib/ld-linux-aarch64.so.1"); }
    public File box64() { return new File(root, "usr/bin/box64"); }
    public File wine() { return new File(root, "opt/wine/bin/wine"); }
    public File dxvkDir() { return new File(root, "opt/dxvk"); }
    public File turnipIcd() { return new File(root, "usr/share/vulkan/icd.d/freedreno_icd.aarch64.json"); }

    public String missingComponent() {
        File[] need = {ldLinux(), box64(), wine(), new File(dxvkDir(), "x32/d3d9.dll"), turnipIcd()};
        for (File f : need) if (!f.exists()) return f.getPath().substring(root.getPath().length());
        return null;
    }

    public boolean isInstalled() { return missingComponent() == null; }

    /** Распаковка tar(.gz) с сохранением симлинков и прав — через системный toybox tar. */
    public void install(InputStream archive) throws IOException, InterruptedException {
        File tmp = new File(root.getParentFile(), "rootfs.import.tar.gz");
        try (OutputStream out = new FileOutputStream(tmp)) { Files2.copy(archive, out); }
        File staging = new File(root.getParentFile(), "rootfs.new");
        Files2.deleteTree(staging);
        staging.mkdirs();
        Process p = new ProcessBuilder("/system/bin/tar", "-xf", tmp.getPath(), "-C", staging.getPath())
                .redirectErrorStream(true).start();
        byte[] sink = new byte[4096];
        try (InputStream in = p.getInputStream()) { while (in.read(sink) > 0) { /* drain */ } }
        int code = p.waitFor();
        //noinspection ResultOfMethodCallIgnored
        tmp.delete();
        if (code != 0) { Files2.deleteTree(staging); throw new IOException("tar exit " + code); }
        Files2.deleteTree(root);
        if (!staging.renameTo(root)) throw new IOException("Не удалось установить rootfs");
        String miss = missingComponent();
        if (miss != null) throw new IOException("В пакете рантайма нет " + miss);
    }
}
