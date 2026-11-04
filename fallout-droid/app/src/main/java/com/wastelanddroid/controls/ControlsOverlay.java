package com.wastelanddroid.controls;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.SparseArray;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;

import com.wastelanddroid.runtime.InputBridge;

/**
 * Прозрачный слой экранного управления поверх изображения игры.
 * Режим игры: мультитач, стик → W/A/S/D, 'тачпад обзора' → относительное движение мыши.
 * Режим редактора: перетаскивание элементов, выбор для настройки размера/прозрачности/клавиши.
 */
public final class ControlsOverlay extends View {
    public interface SelectionListener { void onSelected(ControlButton b); }

    private static final int VK_W = 0x57, VK_A = 0x41, VK_S = 0x53, VK_D = 0x44;

    private ControlLayout layout;
    private InputBridge input;
    private boolean editMode;
    private SelectionListener selectionListener;
    private ControlButton selected;

    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF tmp = new RectF();

    /** Что держит каждый палец. */
    private static final class Touch {
        ControlButton target; float lastX, lastY; float startX, startY;
    }
    private final SparseArray<Touch> touches = new SparseArray<>();
    private final java.util.Set<String> pressed = new java.util.HashSet<>();
    private final java.util.Set<String> toggled = new java.util.HashSet<>();
    private boolean stickW, stickA, stickS, stickD;
    private float stickKnobDx, stickKnobDy;

    public ControlsOverlay(Context c) {
        super(c);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(3f * getResources().getDisplayMetrics().density);
        text.setTextAlign(Paint.Align.CENTER);
        text.setFakeBoldText(true);
        setHapticFeedbackEnabled(true);
    }

    public void setLayout(ControlLayout l) { layout = l; invalidate(); }
    public void setInput(InputBridge in) { input = in; }
    public void setEditMode(boolean e, SelectionListener l) { editMode = e; selectionListener = l; invalidate(); }
    public ControlButton getSelected() { return selected; }
    public void select(ControlButton b) { selected = b; invalidate(); if (selectionListener != null) selectionListener.onSelected(b); }

    private float radiusPx(ControlButton b) {
        return b.size * layout.globalScale * Math.min(getWidth(), getHeight()) / 2f;
    }

    private int alpha255(ControlButton b, boolean down) {
        float a = layout.globalAlpha * b.alpha * (down ? 1.6f : 1f);
        return Math.max(0, Math.min(255, Math.round(a * 255)));
    }

    @Override
    protected void onDraw(Canvas c) {
        if (layout == null) return;
        int w = getWidth(), h = getHeight();
        for (ControlButton b : layout.buttons) {
            float cx = b.x * w, cy = b.y * h;
            boolean down = pressed.contains(b.id) || toggled.contains(b.id);
            int a = alpha255(b, down);
            if (b.type == ControlButton.Type.LOOK_PAD) {
                if (editMode) {
                    stroke.setColor(Color.argb(160, 124, 252, 106));
                    tmp.set(lookPadLeft() * w, 0, w, h);
                    c.drawRect(tmp, stroke);
                    text.setTextSize(h * 0.04f);
                    text.setColor(Color.argb(200, 124, 252, 106));
                    c.drawText("Зона обзора (вся правая часть)", tmp.centerX(), h * 0.3f, text);
                }
                continue;
            }
            float r = radiusPx(b);
            if (b.type == ControlButton.Type.STICK) {
                fill.setColor(Color.argb(a / 2, 20, 30, 20));
                c.drawCircle(cx, cy, r, fill);
                stroke.setColor(Color.argb(a, 124, 252, 106));
                c.drawCircle(cx, cy, r, stroke);
                fill.setColor(Color.argb(a, 124, 252, 106));
                c.drawCircle(cx + stickKnobDx * r, cy + stickKnobDy * r, r * 0.38f, fill);
            } else {
                fill.setColor(down ? Color.argb(a, 124, 252, 106) : Color.argb(a / 2, 20, 30, 20));
                c.drawCircle(cx, cy, r, fill);
                stroke.setColor(Color.argb(a, 124, 252, 106));
                c.drawCircle(cx, cy, r, stroke);
                text.setTextSize(r * (b.label.length() > 4 ? 0.42f : 0.62f));
                text.setColor(down ? Color.argb(Math.min(255, a * 2), 10, 20, 10) : Color.argb(Math.min(255, a * 2), 124, 252, 106));
                c.drawText(b.label, cx, cy - (text.descent() + text.ascent()) / 2, text);
            }
            if (editMode && b == selected) {
                stroke.setColor(Color.YELLOW);
                c.drawCircle(cx, cy, r + stroke.getStrokeWidth() * 2, stroke);
                stroke.setColor(Color.argb(a, 124, 252, 106));
            }
        }
    }

    private float lookPadLeft() {
        ControlButton look = layout.find("look");
        return look != null ? Math.max(0.3f, look.x - 0.12f) : 0.5f;
    }

    private ControlButton hit(float x, float y) {
        int w = getWidth(), h = getHeight();
        ControlButton best = null;
        float bestD = Float.MAX_VALUE;
        for (ControlButton b : layout.buttons) {
            if (b.type == ControlButton.Type.LOOK_PAD) continue;
            float r = radiusPx(b) * (b.type == ControlButton.Type.STICK ? 1.4f : 1.1f); // запас под палец
            float dx = x - b.x * w, dy = y - b.y * h, d = dx * dx + dy * dy;
            if (d <= r * r && d < bestD) { best = b; bestD = d; }
        }
        if (best == null && x >= lookPadLeft() * w) best = layout.find("look");
        return best;
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        if (layout == null) return false;
        return editMode ? onEditTouch(e) : onPlayTouch(e);
    }

    private boolean onEditTouch(MotionEvent e) {
        int w = getWidth(), h = getHeight();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                ControlButton b = hit(e.getX(), e.getY());
                select(b);
                Touch t = new Touch();
                t.target = b; t.lastX = e.getX(); t.lastY = e.getY();
                touches.put(0, t);
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                Touch t = touches.get(0);
                if (t == null || t.target == null) return true;
                t.target.x = clamp(t.target.x + (e.getX() - t.lastX) / w, 0.02f, 0.98f);
                t.target.y = clamp(t.target.y + (e.getY() - t.lastY) / h, 0.02f, 0.98f);
                t.lastX = e.getX(); t.lastY = e.getY();
                invalidate();
                return true;
            }
            default:
                if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) touches.clear();
                return true;
        }
    }

    private boolean onPlayTouch(MotionEvent e) {
        int action = e.getActionMasked();
        int idx = e.getActionIndex();
        switch (action) {
            case MotionEvent.ACTION_DOWN:
            case MotionEvent.ACTION_POINTER_DOWN: {
                int id = e.getPointerId(idx);
                Touch t = new Touch();
                t.target = hit(e.getX(idx), e.getY(idx));
                t.lastX = t.startX = e.getX(idx);
                t.lastY = t.startY = e.getY(idx);
                touches.put(id, t);
                if (t.target != null) press(t.target, t);
                break;
            }
            case MotionEvent.ACTION_MOVE:
                for (int i = 0; i < e.getPointerCount(); i++) {
                    Touch t = touches.get(e.getPointerId(i));
                    if (t == null || t.target == null) continue;
                    float x = e.getX(i), y = e.getY(i);
                    if (t.target.type == ControlButton.Type.STICK) updateStick(t.target, x, y);
                    else if (t.target.type == ControlButton.Type.LOOK_PAD && input != null) {
                        // Нелинейная кривая: точное прицеливание на малых движениях, быстрый разворот на больших.
                        float dx = x - t.lastX, dy = y - t.lastY;
                        float k = layout.lookSensitivity * (1f + Math.min(1.5f, (float) Math.hypot(dx, dy) / 40f));
                        input.mouseMove(dx * k, dy * k);
                    }
                    t.lastX = x; t.lastY = y;
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_POINTER_UP:
            case MotionEvent.ACTION_CANCEL: {
                if (action == MotionEvent.ACTION_CANCEL) {
                    for (int i = 0; i < touches.size(); i++) release(touches.valueAt(i));
                    touches.clear();
                } else {
                    int id = e.getPointerId(idx);
                    Touch t = touches.get(id);
                    if (t != null) release(t);
                    touches.remove(id);
                }
                break;
            }
        }
        invalidate();
        return true;
    }

    private void press(ControlButton b, Touch t) {
        if (b.type == ControlButton.Type.STICK) { updateStick(b, t.startX, t.startY); return; }
        if (b.type == ControlButton.Type.LOOK_PAD) return;
        if (layout.haptics) performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        if (b.toggle) {
            boolean on = !toggled.contains(b.id);
            if (on) toggled.add(b.id); else toggled.remove(b.id);
            if (input != null) input.key(b.vk, on);
            return;
        }
        pressed.add(b.id);
        if (input != null) input.key(b.vk, true);
    }

    private void release(Touch t) {
        ControlButton b = t.target;
        if (b == null) return;
        if (b.type == ControlButton.Type.STICK) { setStick(false, false, false, false); stickKnobDx = stickKnobDy = 0; return; }
        if (b.type == ControlButton.Type.LOOK_PAD || b.toggle) return;
        // Кнопка могла быть зажата двумя пальцами — отпускаем, только если больше никто не держит.
        for (int i = 0; i < touches.size(); i++) {
            Touch o = touches.valueAt(i);
            if (o != t && o.target == b) return;
        }
        pressed.remove(b.id);
        if (input != null) input.key(b.vk, false);
    }

    private void updateStick(ControlButton b, float x, float y) {
        float r = radiusPx(b);
        float dx = (x - b.x * getWidth()) / r, dy = (y - b.y * getHeight()) / r;
        float len = (float) Math.hypot(dx, dy);
        if (len > 1f) { dx /= len; dy /= len; }
        stickKnobDx = dx; stickKnobDy = dy;
        final float dead = 0.25f;
        if (len < dead) { setStick(false, false, false, false); return; }
        // 8 направлений: диагональ включается, когда вторая ось > sin(22.5°) от длины.
        float t = 0.38f * Math.min(len, 1f);
        setStick(dy < -t, dx < -t, dy > t, dx > t);
    }

    private void setStick(boolean w, boolean a, boolean s, boolean d) {
        if (input != null) {
            if (w != stickW) input.key(VK_W, w);
            if (a != stickA) input.key(VK_A, a);
            if (s != stickS) input.key(VK_S, s);
            if (d != stickD) input.key(VK_D, d);
        }
        stickW = w; stickA = a; stickS = s; stickD = d;
    }

    /** Отпустить всё (при сворачивании), чтобы в игре не 'залипли' клавиши. */
    public void releaseAll() {
        for (int i = 0; i < touches.size(); i++) release(touches.valueAt(i));
        touches.clear();
        setStick(false, false, false, false);
        stickKnobDx = stickKnobDy = 0;
        invalidate();
    }

    private static float clamp(float v, float lo, float hi) { return Math.max(lo, Math.min(hi, v)); }
}
