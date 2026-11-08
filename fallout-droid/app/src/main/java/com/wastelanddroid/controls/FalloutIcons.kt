package com.wastelanddroid.controls

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF

/**
 * Значки на экранных кнопках Fallout Droid: огонь, прицел, рука, перезарядка, V.A.T.S. и прочее.
 * Рисуются векторно по коду клавиши, как в мобильных портах игры, — без картинок в ресурсах,
 * поэтому они одинаково чёткие на любом экране и красятся в акцентный цвет.
 */
object FalloutIcons {
    // evdev-коды клавиш, у которых есть свой значок
    private const val BTN_LEFT = 272
    private const val BTN_RIGHT = 273
    private const val E = 18
    private const val R = 19
    private const val V = 47
    private const val LCTRL = 29
    private const val CAPS = 58
    private const val SPACE = 57
    private const val TAB = 15
    private const val F = 33
    private const val ESC = 1
    private const val F5 = 63
    private const val F9 = 67
    private const val T = 20

    private val SET = setOf(BTN_LEFT, BTN_RIGHT, E, R, V, LCTRL, CAPS, SPACE, TAB, F, ESC, F5, F9, T)

    fun has(code: Int): Boolean = code in SET

    private val path = Path()
    private val rect = RectF()

    /** @param box размер значка (описанный квадрат). @return true, если значок нарисован. */
    fun draw(canvas: Canvas, code: Int, cx: Float, cy: Float, box: Float, paint: Paint): Boolean {
        if (code !in SET) return false
        val h = box / 2f
        val stroke = box * 0.09f
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = stroke
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        path.reset()
        when (code) {
            // Огонь: пуля в полёте
            BTN_LEFT -> {
                path.moveTo(cx - 0.10f * h, cy - 0.46f * h)
                path.cubicTo(cx + 0.34f * h, cy - 0.30f * h, cx + 0.34f * h, cy + 0.30f * h, cx - 0.10f * h, cy + 0.46f * h)
                path.lineTo(cx - 0.42f * h, cy + 0.46f * h)
                path.lineTo(cx - 0.42f * h, cy - 0.46f * h)
                path.close()
                canvas.drawPath(path, paint)
                path.reset()
                path.moveTo(cx - 0.92f * h, cy - 0.30f * h)
                path.lineTo(cx - 0.62f * h, cy - 0.30f * h)
                path.moveTo(cx - 0.98f * h, cy)
                path.lineTo(cx - 0.62f * h, cy)
                path.moveTo(cx - 0.92f * h, cy + 0.30f * h)
                path.lineTo(cx - 0.62f * h, cy + 0.30f * h)
                canvas.drawPath(path, paint)
            }
            // Прицел: перекрестие
            BTN_RIGHT -> {
                canvas.drawCircle(cx, cy, 0.62f * h, paint)
                path.moveTo(cx, cy - 0.98f * h); path.lineTo(cx, cy - 0.70f * h)
                path.moveTo(cx, cy + 0.70f * h); path.lineTo(cx, cy + 0.98f * h)
                path.moveTo(cx - 0.98f * h, cy); path.lineTo(cx - 0.70f * h, cy)
                path.moveTo(cx + 0.70f * h, cy); path.lineTo(cx + 0.98f * h, cy)
                canvas.drawPath(path, paint)
                paint.style = Paint.Style.FILL
                canvas.drawCircle(cx, cy, 0.14f * h, paint)
            }
            // Взять: рука
            E -> {
                path.moveTo(cx - 0.46f * h, cy + 0.18f * h)
                path.lineTo(cx - 0.46f * h, cy - 0.26f * h)
                path.moveTo(cx - 0.16f * h, cy - 0.06f * h)
                path.lineTo(cx - 0.16f * h, cy - 0.60f * h)
                path.moveTo(cx + 0.14f * h, cy - 0.06f * h)
                path.lineTo(cx + 0.14f * h, cy - 0.52f * h)
                canvas.drawPath(path, paint)
                path.reset()
                path.moveTo(cx - 0.62f * h, cy + 0.10f * h)
                path.cubicTo(cx - 0.62f * h, cy + 0.86f * h, cx + 0.46f * h, cy + 0.94f * h, cx + 0.44f * h, cy + 0.24f * h)
                path.lineTo(cx + 0.44f * h, cy - 0.22f * h)
                canvas.drawPath(path, paint)
            }
            // Перезарядка: круговая стрелка
            R -> {
                rect.set(cx - 0.62f * h, cy - 0.62f * h, cx + 0.62f * h, cy + 0.62f * h)
                canvas.drawArc(rect, -40f, 290f, false, paint)
                path.moveTo(cx + 0.30f * h, cy - 0.76f * h)
                path.lineTo(cx + 0.76f * h, cy - 0.44f * h)
                path.lineTo(cx + 0.30f * h, cy - 0.12f * h)
                canvas.drawPath(path, paint)
            }
            // V.A.T.S.: цель в уголках
            V -> {
                canvas.drawCircle(cx, cy, 0.34f * h, paint)
                val a = 0.92f * h
                val b = 0.46f * h
                path.moveTo(cx - a, cy - b); path.lineTo(cx - a, cy - a); path.lineTo(cx - b, cy - a)
                path.moveTo(cx + b, cy - a); path.lineTo(cx + a, cy - a); path.lineTo(cx + a, cy - b)
                path.moveTo(cx + a, cy + b); path.lineTo(cx + a, cy + a); path.lineTo(cx + b, cy + a)
                path.moveTo(cx - b, cy + a); path.lineTo(cx - a, cy + a); path.lineTo(cx - a, cy + b)
                canvas.drawPath(path, paint)
            }
            // Присесть: фигурка на корточках
            LCTRL -> {
                paint.style = Paint.Style.FILL
                canvas.drawCircle(cx - 0.10f * h, cy - 0.64f * h, 0.20f * h, paint)
                paint.style = Paint.Style.STROKE
                path.moveTo(cx - 0.10f * h, cy - 0.38f * h)
                path.lineTo(cx + 0.16f * h, cy + 0.06f * h)
                path.lineTo(cx - 0.22f * h, cy + 0.34f * h)
                path.lineTo(cx - 0.22f * h, cy + 0.84f * h)
                canvas.drawPath(path, paint)
                path.reset()
                path.moveTo(cx + 0.16f * h, cy + 0.06f * h)
                path.lineTo(cx + 0.56f * h, cy + 0.34f * h)
                path.moveTo(cx - 0.10f * h, cy - 0.24f * h)
                path.lineTo(cx + 0.46f * h, cy - 0.34f * h)
                canvas.drawPath(path, paint)
            }
            // Бег: две стрелки
            CAPS -> {
                path.moveTo(cx - 0.70f * h, cy - 0.52f * h)
                path.lineTo(cx - 0.12f * h, cy)
                path.lineTo(cx - 0.70f * h, cy + 0.52f * h)
                path.moveTo(cx + 0.12f * h, cy - 0.52f * h)
                path.lineTo(cx + 0.70f * h, cy)
                path.lineTo(cx + 0.12f * h, cy + 0.52f * h)
                canvas.drawPath(path, paint)
            }
            // Прыжок: стрелка вверх над площадкой
            SPACE -> {
                path.moveTo(cx, cy - 0.86f * h)
                path.lineTo(cx, cy + 0.20f * h)
                path.moveTo(cx - 0.42f * h, cy - 0.42f * h)
                path.lineTo(cx, cy - 0.86f * h)
                path.lineTo(cx + 0.42f * h, cy - 0.42f * h)
                path.moveTo(cx - 0.70f * h, cy + 0.66f * h)
                path.lineTo(cx + 0.70f * h, cy + 0.66f * h)
                canvas.drawPath(path, paint)
            }
            // Пип-бой: экран на запястье
            TAB -> {
                rect.set(cx - 0.68f * h, cy - 0.74f * h, cx + 0.68f * h, cy + 0.34f * h)
                canvas.drawRoundRect(rect, 0.16f * h, 0.16f * h, paint)
                path.moveTo(cx - 0.34f * h, cy - 0.34f * h)
                path.lineTo(cx + 0.34f * h, cy - 0.34f * h)
                path.moveTo(cx - 0.34f * h, cy - 0.04f * h)
                path.lineTo(cx + 0.12f * h, cy - 0.04f * h)
                path.moveTo(cx - 0.44f * h, cy + 0.34f * h)
                path.lineTo(cx - 0.44f * h, cy + 0.84f * h)
                path.moveTo(cx + 0.44f * h, cy + 0.34f * h)
                path.lineTo(cx + 0.44f * h, cy + 0.84f * h)
                canvas.drawPath(path, paint)
            }
            // Вид: глаз
            F -> {
                path.moveTo(cx - 0.94f * h, cy)
                path.cubicTo(cx - 0.40f * h, cy - 0.76f * h, cx + 0.40f * h, cy - 0.76f * h, cx + 0.94f * h, cy)
                path.cubicTo(cx + 0.40f * h, cy + 0.76f * h, cx - 0.40f * h, cy + 0.76f * h, cx - 0.94f * h, cy)
                canvas.drawPath(path, paint)
                canvas.drawCircle(cx, cy, 0.26f * h, paint)
            }
            // Меню: три полосы
            ESC -> {
                path.moveTo(cx - 0.72f * h, cy - 0.50f * h); path.lineTo(cx + 0.72f * h, cy - 0.50f * h)
                path.moveTo(cx - 0.72f * h, cy); path.lineTo(cx + 0.72f * h, cy)
                path.moveTo(cx - 0.72f * h, cy + 0.50f * h); path.lineTo(cx + 0.72f * h, cy + 0.50f * h)
                canvas.drawPath(path, paint)
            }
            // Сохранить: дискета
            F5 -> {
                rect.set(cx - 0.72f * h, cy - 0.72f * h, cx + 0.72f * h, cy + 0.72f * h)
                canvas.drawRoundRect(rect, 0.14f * h, 0.14f * h, paint)
                rect.set(cx - 0.36f * h, cy - 0.72f * h, cx + 0.36f * h, cy - 0.16f * h)
                canvas.drawRect(rect, paint)
                rect.set(cx - 0.46f * h, cy + 0.14f * h, cx + 0.46f * h, cy + 0.72f * h)
                canvas.drawRect(rect, paint)
            }
            // Загрузить: стрелка из папки
            F9 -> {
                path.moveTo(cx - 0.80f * h, cy + 0.66f * h)
                path.lineTo(cx - 0.80f * h, cy - 0.44f * h)
                path.lineTo(cx - 0.14f * h, cy - 0.44f * h)
                path.lineTo(cx + 0.02f * h, cy - 0.18f * h)
                path.lineTo(cx + 0.80f * h, cy - 0.18f * h)
                path.lineTo(cx + 0.80f * h, cy + 0.66f * h)
                path.close()
                canvas.drawPath(path, paint)
                path.reset()
                path.moveTo(cx, cy + 0.52f * h)
                path.lineTo(cx, cy + 0.04f * h)
                path.moveTo(cx - 0.26f * h, cy + 0.28f * h)
                path.lineTo(cx, cy + 0.04f * h)
                path.lineTo(cx + 0.26f * h, cy + 0.28f * h)
                canvas.drawPath(path, paint)
            }
            // Ждать: часы
            T -> {
                canvas.drawCircle(cx, cy, 0.78f * h, paint)
                path.moveTo(cx, cy - 0.44f * h)
                path.lineTo(cx, cy + 0.06f * h)
                path.lineTo(cx + 0.36f * h, cy + 0.30f * h)
                canvas.drawPath(path, paint)
            }
        }
        paint.style = Paint.Style.FILL
        return true
    }
}
