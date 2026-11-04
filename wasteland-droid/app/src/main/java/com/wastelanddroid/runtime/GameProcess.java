package com.wastelanddroid.runtime;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.File;

/**
 * Процесс игры + сторож зависаний.
 *
 * Зависание определяется так: процессы группы (wineserver + игра) не тратят CPU
 * дольше {@link #HANG_TIMEOUT_MS}, пока приложение на переднем плане. Классические
 * зависания FO3 (deadlock при подгрузке ячеек, «вечный» экран загрузки) выглядят именно так.
 */
public final class GameProcess {
    public interface Listener {
        void onExited(int code);
        void onHangSuspected(long stalledMs);
    }

    private static final String TAG = "GameProcess";
    private static final long POLL_MS = 2000;
    private static final long HANG_TIMEOUT_MS = 45_000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile int pid = -1;
    private volatile boolean paused;
    private Thread waiter, watchdog;

    public int start(LaunchConfig cfg, File log, boolean pinBigCores, boolean watchdogEnabled, Listener l) {
        pid = NativeBridge.nativeSpawn(cfg.argvArray(), cfg.envArray(), cfg.cwd.getPath(), log.getPath(), pinBigCores);
        if (pid <= 0) return pid;
        final int p = pid;
        waiter = new Thread(() -> {
            int code = NativeBridge.nativeWait(p);
            pid = -1;
            main.post(() -> l.onExited(code));
        }, "game-wait");
        waiter.setDaemon(true);
        waiter.start();
        if (watchdogEnabled) {
            watchdog = new Thread(() -> watch(p, l), "game-watchdog");
            watchdog.setDaemon(true);
            watchdog.start();
        }
        return pid;
    }

    private void watch(int p, Listener l) {
        long last = -1, stalledSince = 0;
        boolean reported = false;
        while (pid == p) {
            try { Thread.sleep(POLL_MS); } catch (InterruptedException e) { return; }
            long now = System.currentTimeMillis();
            long ticks = NativeBridge.nativeGroupCpuTicks(p);
            if (paused || ticks != last) { last = ticks; stalledSince = now; reported = false; continue; }
            if (!reported && now - stalledSince > HANG_TIMEOUT_MS) {
                reported = true;
                long ms = now - stalledSince;
                Log.w(TAG, "hang suspected, stalled " + ms + "ms");
                main.post(() -> l.onHangSuspected(ms));
            }
        }
    }

    public void setPaused(boolean p) { paused = p; }
    public boolean isRunning() { return pid > 0; }

    /** Пауза процессов игры при сворачивании: экономит батарею и не даёт DXVK потерять swapchain. */
    public void suspend() { if (pid > 0) NativeBridge.nativeKillGroup(pid, 19 /* SIGSTOP */); }
    public void resume() { if (pid > 0) NativeBridge.nativeKillGroup(pid, 18 /* SIGCONT */); }

    public void kill() {
        int p = pid;
        if (p <= 0) return;
        NativeBridge.nativeKillGroup(p, 18);
        NativeBridge.nativeKillGroup(p, 15 /* SIGTERM */);
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (pid == p) NativeBridge.nativeKillGroup(p, 9 /* SIGKILL */);
        }, 3000);
    }
}
