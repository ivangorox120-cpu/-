package com.wastelanddroid.game;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.util.DisplayMetrics;

import java.util.Locale;

/**
 * Профиль качества под устройство. Базовая планка — Snapdragon 870 (Adreno 650):
 * на ней 'low' обязан держать 60 к/с. Более мощные SoC получают более высокое разрешение,
 * но лок 60 к/с не меняется никогда (физика Havok в игре рассчитана на ≤60 к/с).
 */
public final class DeviceProfile {
    public enum Quality { LOW, MEDIUM, HIGH }

    public final Quality quality;
    public final int renderWidth;
    public final int renderHeight;
    public final long totalRamMb;
    public final String soc;

    private DeviceProfile(Quality q, int w, int h, long ram, String soc) {
        this.quality = q; this.renderWidth = w; this.renderHeight = h; this.totalRamMb = ram; this.soc = soc;
    }

    public static Quality autoQuality(Context ctx) {
        String soc = socModel().toLowerCase(Locale.ROOT);
        long ram = totalRamMb(ctx);
        // SM8650/SM8750 (8 Gen 3 / 8 Elite) и аналоги — high; SM8450..SM8550 — medium; SD865/870/888 — low.
        if (soc.matches(".*sm8(6|7)\\d0.*") || soc.contains("8 elite")) return ram >= 11000 ? Quality.HIGH : Quality.MEDIUM;
        if (soc.matches(".*sm8(4|5)\\d0.*")) return Quality.MEDIUM;
        return Quality.LOW;
    }

    public static DeviceProfile create(Context ctx, Quality q, int resScalePercent) {
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        int w = Math.max(dm.widthPixels, dm.heightPixels);
        int h = Math.min(dm.widthPixels, dm.heightPixels);
        int targetH;
        switch (q) {
            case HIGH: targetH = 1080; break;
            case MEDIUM: targetH = 900; break;
            default: targetH = 720; break;
        }
        targetH = Math.min(targetH, h);
        targetH = targetH * Math.max(50, Math.min(100, resScalePercent)) / 100;
        int targetW = Math.round(targetH * (float) w / h);
        targetW &= ~1; targetH &= ~1;
        return new DeviceProfile(q, targetW, targetH, totalRamMb(ctx), socModel());
    }

    static String socModel() {
        if (Build.VERSION.SDK_INT >= 31) return Build.SOC_MANUFACTURER + " " + Build.SOC_MODEL;
        return Build.HARDWARE;
    }

    static long totalRamMb(Context ctx) {
        ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        return mi.totalMem / (1024 * 1024);
    }
}
