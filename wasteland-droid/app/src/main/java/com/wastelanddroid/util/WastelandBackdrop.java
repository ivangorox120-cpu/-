package com.wastelanddroid.util;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.view.View;

import java.io.File;
import java.io.InputStream;
import java.util.Random;

/**
 * Фон заставки. Источник (по приоритету):
 *  1) assets/splash.jpg — картинка, положенная в проект при сборке;
 *  2) files/splash_bg — картинка, выбранная пользователем в настройках;
 *  3) собственная процедурная «пустошь на закате» (рисуется кодом).
 * Медленный «наезд камеры» (эффект Кена Бёрнса) задаётся через setZoom().
 */
public final class WastelandBackdrop extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private Bitmap image;
    private float zoom = 1f;
    private long seed = 1977;

    public WastelandBackdrop(Context c) {
        super(c);
        image = load(c);
    }

    public static File customFile(Context c) { return new File(c.getFilesDir(), "splash_bg"); }

    private static Bitmap load(Context c) {
        try (InputStream in = c.getAssets().open("splash.jpg")) {
            return BitmapFactory.decodeStream(in);
        } catch (Exception ignored) { }
        File f = customFile(c);
        if (f.exists()) {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getPath(), o);
            int s = 1;
            while (o.outWidth / (s * 2) >= 1920) s *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = s;
            return BitmapFactory.decodeFile(f.getPath(), o);
        }
        return null;
    }

    public void setZoom(float z) { zoom = z; invalidate(); }
    public float getZoom() { return zoom; }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        if (w == 0 || h == 0) return;
        c.save();
        c.scale(zoom, zoom, w * 0.62f, h * 0.55f);
        if (image != null) {
            float s = Math.max(w / (float) image.getWidth(), h / (float) image.getHeight());
            Matrix m = new Matrix();
            m.setScale(s, s);
            m.postTranslate((w - image.getWidth() * s) / 2f, (h - image.getHeight() * s) / 2f);
            p.setShader(null);
            c.drawBitmap(image, m, p);
        } else {
            drawProcedural(c, w, h);
        }
        c.restore();
        // общий тон и виньетка — чтобы надпись читалась на любой картинке
        p.setShader(new LinearGradient(0, 0, 0, h, Color.argb(40, 0, 0, 0), Color.argb(170, 0, 0, 0), Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(new RadialGradient(w / 2f, h / 2f, Math.max(w, h) * 0.75f,
                new int[]{Color.TRANSPARENT, Color.argb(150, 0, 0, 0)}, new float[]{0.55f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);
    }

    /** Оригинальный пейзаж: закатное небо, солнце, облака, силуэт города и пустошь. */
    private void drawProcedural(Canvas c, int w, int h) {
        float horizon = h * 0.68f;
        p.setShader(new LinearGradient(0, 0, 0, horizon,
                new int[]{Color.rgb(28, 32, 44), Color.rgb(92, 70, 72), Color.rgb(214, 132, 70), Color.rgb(250, 196, 120)},
                new float[]{0f, 0.45f, 0.82f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, horizon, p);

        float sx = w * 0.82f, sy = horizon - h * 0.05f;
        p.setShader(new RadialGradient(sx, sy, h * 0.55f,
                new int[]{Color.argb(255, 255, 236, 190), Color.argb(120, 255, 170, 90), Color.TRANSPARENT},
                new float[]{0f, 0.18f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, horizon, p);
        p.setShader(null);

        // облака — полупрозрачные вытянутые эллипсы
        Random r = new Random(seed);
        for (int i = 0; i < 26; i++) {
            float cx = r.nextFloat() * w, cy = r.nextFloat() * horizon * 0.6f;
            float rw = w * (0.08f + r.nextFloat() * 0.18f), rh = h * (0.015f + r.nextFloat() * 0.04f);
            p.setColor(Color.argb(40 + r.nextInt(60), 30 + r.nextInt(30), 28 + r.nextInt(20), 40 + r.nextInt(20)));
            c.drawOval(cx - rw, cy - rh, cx + rw, cy + rh, p);
        }

        // дальний город (силуэт)
        p.setColor(Color.argb(150, 70, 60, 70));
        Path city = new Path();
        city.moveTo(0, horizon);
        float x = w * 0.30f;
        city.lineTo(x, horizon);
        while (x < w * 0.78f) {
            float bw = w * (0.008f + r.nextFloat() * 0.02f);
            float bh = h * (0.03f + r.nextFloat() * 0.12f);
            city.lineTo(x, horizon - bh);
            city.lineTo(x + bw, horizon - bh);
            x += bw;
            city.lineTo(x, horizon);
            x += w * r.nextFloat() * 0.006f;
        }
        city.lineTo(w, horizon);
        city.close();
        c.drawPath(city, p);
        // одинокая башня-игла
        p.setColor(Color.argb(170, 60, 52, 62));
        float tx = w * 0.56f;
        c.drawRect(tx - w * 0.003f, horizon - h * 0.26f, tx + w * 0.003f, horizon, p);
        c.drawOval(tx - w * 0.022f, horizon - h * 0.27f, tx + w * 0.022f, horizon - h * 0.235f, p);

        // земля
        p.setShader(new LinearGradient(0, horizon, 0, h,
                new int[]{Color.rgb(120, 92, 70), Color.rgb(54, 42, 34), Color.rgb(22, 18, 16)}, null, Shader.TileMode.CLAMP));
        c.drawRect(0, horizon, w, h, p);
        p.setShader(null);
        // руина заправки слева — простые геометрические формы
        p.setColor(Color.argb(235, 26, 22, 22));
        c.drawRect(0, horizon - h * 0.20f, w * 0.30f, horizon - h * 0.17f, p);   // навес
        c.drawRect(w * 0.04f, horizon - h * 0.17f, w * 0.05f, horizon + h * 0.04f, p);
        c.drawRect(w * 0.24f, horizon - h * 0.17f, w * 0.25f, horizon + h * 0.04f, p);
        c.drawRect(w * 0.12f, horizon - h * 0.07f, w * 0.15f, horizon + h * 0.04f, p); // колонка
        c.drawRect(w * 0.27f, horizon - h * 0.42f, w * 0.285f, horizon - h * 0.20f, p); // столб вывески
        p.setColor(Color.argb(235, 40, 34, 30));
        c.drawRect(w * 0.06f, horizon - h * 0.54f, w * 0.31f, horizon - h * 0.40f, p);   // пустой щит
    }
}
