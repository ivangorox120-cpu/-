package com.wastelanddroid.game;

import android.app.Activity;
import android.os.Build;
import android.os.PerformanceHintManager;
import android.os.PowerManager;
import android.os.Process;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

/**
 * Режим экрана 60 Гц и удержание производительности.
 *
 * На панелях 90/120/144 Гц 60 к/с без выравнивания по vsync дают неравномерный
 * кадровый ритм (джаддер). Поэтому экран переключается в режим ровно 60 Гц, а DXVK
 * ограничивает игру 60 к/с с FIFO-подачей — получаем ровные 16,67 мс на кадр.
 */
public final class Performance {
    private Performance() {}

    public static void apply(Activity a) {
        WindowManager.LayoutParams lp = a.getWindow().getAttributes();
        Display d;
        try {
            d = a.getDisplay();
        } catch (RuntimeException e) {
            d = a.getWindowManager().getDefaultDisplay(); // старые/нестандартные прошивки
        }
        if (d != null) {
            Display.Mode cur = d.getMode();
            Display.Mode best = null;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                if (Math.abs(m.getRefreshRate() - 60f) < 1f) { best = m; break; }
                // нет 60 Гц — подойдёт кратная частота (120 Гц: каждый кадр показывается ровно дважды)
                if (best == null && Math.abs(m.getRefreshRate() % 60f) < 1f) best = m;
            }
            if (best != null) lp.preferredDisplayModeId = best.getModeId();
            lp.preferredRefreshRate = 60f;
        }
        lp.flags |= WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
        a.getWindow().setAttributes(lp);

        try {
            PowerManager pm = (PowerManager) a.getSystemService(Activity.POWER_SERVICE);
            // Устойчивый режим: чуть ниже пик, но без троттлинга через 10 минут игры.
            if (pm != null && pm.isSustainedPerformanceModeSupported()) a.getWindow().setSustainedPerformanceMode(true);
        } catch (RuntimeException ignored) { }
        Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY);
    }

    public static void setSurfaceFrameRate(Surface s) {
        if (Build.VERSION.SDK_INT >= 30 && s != null && s.isValid()) {
            s.setFrameRate(60f, Surface.FRAME_RATE_COMPATIBILITY_FIXED_SOURCE);
        }
    }

    /** Подсказка планировщику о целевом времени кадра (Android 12+). */
    public static PerformanceHintManager.Session hintSession(Activity a, int[] tids) {
        if (Build.VERSION.SDK_INT < 31) return null;
        PerformanceHintManager m = a.getSystemService(PerformanceHintManager.class);
        if (m == null || tids.length == 0) return null;
        return m.createHintSession(tids, 16_666_667L);
    }
}
