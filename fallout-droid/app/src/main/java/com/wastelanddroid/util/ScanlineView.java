package com.wastelanddroid.util;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;

/** Декоративный слой 'кинескопа': едва заметные строки развёртки и виньетка. Касания не перехватывает. */
public final class ScanlineView extends View {
    private final Paint line = new Paint();
    private final Paint vignette = new Paint();

    public ScanlineView(Context c) {
        super(c);
        line.setColor(Color.argb(18, 0, 0, 0));
        setClickable(false);
        setFocusable(false);
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        vignette.setShader(new RadialGradient(w / 2f, h / 2f, Math.max(w, h) * 0.75f,
                new int[]{Color.TRANSPARENT, Color.TRANSPARENT, Color.argb(120, 0, 0, 0)},
                new float[]{0f, 0.6f, 1f}, Shader.TileMode.CLAMP));
    }

    @Override
    protected void onDraw(Canvas c) {
        int step = Math.max(3, Math.round(getResources().getDisplayMetrics().density * 2));
        for (int y = 0; y < getHeight(); y += step) c.drawRect(0, y, getWidth(), y + step / 2f, line);
        c.drawRect(0, 0, getWidth(), getHeight(), vignette);
    }
}
