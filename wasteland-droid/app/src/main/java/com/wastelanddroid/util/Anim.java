package com.wastelanddroid.util;

import android.animation.Animator;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.view.animation.PathInterpolator;

/** Анимации интерфейса: появление, «нажатие», пульсация. Все — на RenderThread-совместимых свойствах. */
public final class Anim {
    /** Плавная кривая «Material emphasized». */
    public static final PathInterpolator EMPHASIZED = new PathInterpolator(0.2f, 0f, 0f, 1f);

    private Anim() {}

    /** Появление: прозрачность + подъём снизу. */
    public static void enter(View v, long delayMs) {
        v.setAlpha(0f);
        v.setTranslationY(v.getResources().getDisplayMetrics().density * 28);
        v.animate().alpha(1f).translationY(0f).setStartDelay(delayMs).setDuration(520)
                .setInterpolator(EMPHASIZED).withLayer().start();
    }

    /** Появление сверху (шапка). */
    public static void enterFromTop(View v, long delayMs) {
        v.setAlpha(0f);
        v.setTranslationY(-v.getResources().getDisplayMetrics().density * 24);
        v.animate().alpha(1f).translationY(0f).setStartDelay(delayMs).setDuration(600)
                .setInterpolator(EMPHASIZED).start();
    }

    /** Каскадное появление всех прямых потомков контейнера. */
    public static void stagger(ViewGroup g, long startDelay, long step) {
        for (int i = 0; i < g.getChildCount(); i++) enter(g.getChildAt(i), startDelay + i * step);
    }

    /** «Пружинящее» нажатие для любой кликабельной View. */
    @SuppressLint("ClickableViewAccessibility")
    public static void pressable(View v) {
        v.setOnTouchListener((view, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    view.animate().scaleX(0.95f).scaleY(0.95f).setDuration(90)
                            .setInterpolator(new DecelerateInterpolator()).setStartDelay(0).start();
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    view.animate().scaleX(1f).scaleY(1f).setDuration(260)
                            .setInterpolator(new OvershootInterpolator(3f)).setStartDelay(0).start();
                    break;
                default:
                    break;
            }
            return false; // клик обрабатывается как обычно
        });
    }

    /** Бесконечная мягкая пульсация (кнопка «Играть»). */
    public static Animator pulse(View v) {
        ObjectAnimator sx = ObjectAnimator.ofFloat(v, View.SCALE_X, 1f, 1.035f);
        ObjectAnimator sy = ObjectAnimator.ofFloat(v, View.SCALE_Y, 1f, 1.035f);
        for (ObjectAnimator a : new ObjectAnimator[]{sx, sy}) {
            a.setRepeatMode(ValueAnimator.REVERSE);
            a.setRepeatCount(ValueAnimator.INFINITE);
            a.setDuration(1100);
            a.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
        }
        AnimatorSet set = new AnimatorSet();
        set.playTogether(sx, sy);
        set.start();
        return set;
    }

    /** Мерцание «лампового» текста. */
    public static Animator flicker(View v) {
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ALPHA, 1f, 0.82f, 1f, 0.9f, 1f);
        a.setDuration(2600);
        a.setRepeatCount(ValueAnimator.INFINITE);
        a.start();
        return a;
    }
}
