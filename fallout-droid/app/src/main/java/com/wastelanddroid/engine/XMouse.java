package com.wastelanddroid.engine;

import android.content.Context;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;

import com.droiddeck.launcher.runtime.LinuxRuntime;

import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Мышь прямо в X-сервер: пишем команды в канал, который читает fd-mouse внутри Linux-среды
 * и превращает их в события XTEST. Для игры это настоящая мышь, а не события композитора,
 * которые Fallout через DirectInput не видит.
 *
 * Канал открывается без блокировки: пока fd-mouse не запустился, открытие просто не удаётся,
 * и мы пробуем снова позже. Переполнение канала тоже не блокирует — лишние события теряются.
 */
public final class XMouse {
    private static final String TAG = "FdXMouse";
    /** Домашняя папка Linux-среды: этот путь виден и приложению, и контейнеру. */
    private static final String FIFO = "root/.fd-mouse";

    private static FileOutputStream out;
    private static long nextTry;
    private static boolean announced;

    private XMouse() {}

    public static synchronized boolean ready(Context c) {
        if (out != null) return true;
        long now = android.os.SystemClock.uptimeMillis();
        if (now < nextTry) return false;
        nextTry = now + 1000;
        File fifo = new File(LinuxRuntime.rootDir(c), FIFO);
        if (!fifo.exists()) return false;
        try {
            FileDescriptor fd = Os.open(fifo.getAbsolutePath(),
                    OsConstants.O_WRONLY | OsConstants.O_NONBLOCK, 0);
            out = new FileOutputStream(fd);
            if (!announced) { announced = true; Log.i(TAG, "XTEST mouse channel open"); }
            return true;
        } catch (ErrnoException e) {
            return false; // ENXIO: fd-mouse ещё не читает канал
        }
    }

    private static synchronized void send(Context c, String line) {
        if (!ready(c)) return;
        try {
            out.write(line.getBytes(StandardCharsets.US_ASCII));
        } catch (Exception e) {
            try { out.close(); } catch (Exception ignored) { }
            out = null;
        }
    }

    public static void move(Context c, int dx, int dy) {
        if (dx != 0 || dy != 0) send(c, "m " + dx + " " + dy + "\n");
    }

    public static void moveTo(Context c, int x, int y) { send(c, "a " + x + " " + y + "\n"); }

    /** Кнопки X11: 1 левая, 2 средняя, 3 правая. */
    public static void button(Context c, int button, boolean down) {
        send(c, "b " + button + " " + (down ? 1 : 0) + "\n");
    }

    public static void wheel(Context c, int steps) {
        if (steps != 0) send(c, "w " + steps + "\n");
    }

    public static synchronized void close() {
        if (out != null) try { out.close(); } catch (Exception ignored) { }
        out = null;
        announced = false;
    }

    /** Кнопка evdev (272 левая, 273 правая, 274 средняя) в номер кнопки X11. */
    public static int x11Button(int evdev) {
        switch (evdev) {
            case 273: return 3;
            case 274: return 2;
            default: return 1;
        }
    }
}
