package com.wastelanddroid.util;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

import java.io.File;

/**
 * Обложка игры. Картинку выбирает пользователь на устройстве (хранится в files/covers и не
 * входит в APK). Без неё рисуется собственная обложка-заглушка: градиент, штриховка и название.
 */
public final class CoverView extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path clip = new Path();
    private final RectF rect = new RectF();
    private Bitmap bitmap;
    private String title = "";
    private int accent = Ui.FG, dark = Ui.BG;
    private boolean selected;

    public CoverView(Context c) {
        super(c);
        text.setTypeface(Ui.mono(true));
        text.setColor(Color.WHITE);
        text.setTextAlign(Paint.Align.LEFT);
    }

    public void set(String title, int accent, int dark, File image) {
        this.title = title; this.accent = accent; this.dark = dark;
        bitmap = null;
        if (image != null && image.exists()) {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(image.getPath(), o);
            int sample = 1;
            while (o.outWidth / (sample * 2) >= 720) sample *= 2; // экономим память лаунчера
            o = new BitmapFactory.Options();
            o.inSampleSize = sample;
            bitmap = BitmapFactory.decodeFile(image.getPath(), o);
        }
        invalidate();
    }

    public void setSelectedCard(boolean s) { selected = s; invalidate(); }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        float r = Ui.dp(getContext(), 14);
        rect.set(0, 0, w, h);
        clip.reset();
        clip.addRoundRect(rect, r, r, Path.Direction.CW);
        c.save();
        c.clipPath(clip);

        paint.setShader(null);
        if (bitmap != null) {
            // centerCrop
            float scale = Math.max(w / (float) bitmap.getWidth(), h / (float) bitmap.getHeight());
            Matrix m = new Matrix();
            m.setScale(scale, scale);
            m.postTranslate((w - bitmap.getWidth() * scale) / 2f, (h - bitmap.getHeight() * scale) / 4f);
            BitmapShader bs = new BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            bs.setLocalMatrix(m);
            paint.setShader(bs);
            c.drawRect(rect, paint);
        } else {
            paint.setShader(new LinearGradient(0, 0, w, h, accent, dark, Shader.TileMode.CLAMP));
            c.drawRect(rect, paint);
            paint.setShader(null);
            paint.setColor(Color.argb(28, 255, 255, 255));
            float step = Ui.dp(getContext(), 14);
            paint.setStrokeWidth(Ui.dp(getContext(), 3));
            for (float x = -h; x < w; x += step) c.drawLine(x, h, x + h, 0, paint);
        }

        // затемнение снизу под подпись
        paint.setShader(new LinearGradient(0, h * 0.45f, 0, h, Color.TRANSPARENT, Color.argb(230, 0, 0, 0), Shader.TileMode.CLAMP));
        c.drawRect(rect, paint);
        paint.setShader(null);

        text.setTextSize(Math.min(w, h) * 0.085f);
        text.setShadowLayer(8, 0, 2, Color.BLACK);
        float pad = Ui.dp(getContext(), 12);
        c.drawText(title.toUpperCase(), pad, h - pad, text);
        c.restore();

        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(Ui.dp(getContext(), selected ? 2.5f : 1));
        paint.setColor(selected ? Ui.AMBER : Ui.LINE);
        rect.inset(paint.getStrokeWidth() / 2, paint.getStrokeWidth() / 2);
        c.drawRoundRect(rect, r, r, paint);
        paint.setStyle(Paint.Style.FILL);
    }
}
