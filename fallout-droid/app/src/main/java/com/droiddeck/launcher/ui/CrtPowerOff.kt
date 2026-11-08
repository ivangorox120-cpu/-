package com.droiddeck.launcher.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.launch

private val Collapse = CubicBezierEasing(0.55f, 0f, 0.85f, 0.35f)

/**
 * Fallout Droid: выход из игры как выключение старого лампового телевизора — картинка
 * сжимается в яркую горизонтальную полосу, полоса — в точку, точка гаснет. Игра под эффектом
 * видна сквозь полупрозрачное затемнение, пока экран «гаснет».
 */
@Composable
fun CrtPowerOff(tint: Color, onDone: () -> Unit) {
    val squeeze = remember { Animatable(0f) }   // 0..1 — высота «кадра» сжимается в линию
    val narrow = remember { Animatable(0f) }    // 0..1 — линия сжимается в точку
    val fade = remember { Animatable(0f) }      // 0..1 — точка гаснет
    val done by rememberUpdatedState(onDone)
    LaunchedEffect(Unit) {
        squeeze.animateTo(1f, tween(260, easing = Collapse))
        narrow.animateTo(1f, tween(200, easing = Collapse))
        launch { fade.animateTo(1f, tween(260)) }.join()
        done()
    }
    Canvas(Modifier.fillMaxSize().pointerInput(Unit) { awaitEachGesture { while (true) awaitPointerEvent().changes.forEach { it.consume() } } }) {
        val w = size.width
        val h = size.height
        val cy = h / 2f
        // затемнение: сначала полупрозрачное (игра просвечивает), к концу — чёрный экран
        val dim = 0.45f + 0.55f * squeeze.value
        val bandH = maxOf(h * (1f - squeeze.value), 3f)
        val bandW = w * (1f - narrow.value * 0.985f)
        val left = (w - bandW) / 2f
        val top = cy - bandH / 2f
        drawRect(Color.Black.copy(alpha = dim), size = Size(w, top))
        drawRect(Color.Black.copy(alpha = dim), topLeft = Offset(0f, top + bandH), size = Size(w, h - top - bandH))
        drawRect(Color.Black.copy(alpha = dim), topLeft = Offset(0f, top), size = Size(left, bandH))
        drawRect(Color.Black.copy(alpha = dim), topLeft = Offset(left + bandW, top), size = Size(w - left - bandW, bandH))
        // сам «кадр»: светлеет по мере сжатия, как перегретый люминофор
        val glow = (squeeze.value * 0.9f) * (1f - fade.value)
        drawRect(Color.White.copy(alpha = glow), topLeft = Offset(left, top), size = Size(bandW, bandH))
        // ореол вокруг полосы / точки
        val halo = (if (narrow.value > 0f) 60f else 30f) * (1f - fade.value)
        if (squeeze.value > 0.6f) drawRect(
            Brush.verticalGradient(listOf(Color.Transparent, tint.copy(alpha = 0.35f * (1f - fade.value)), Color.Transparent),
                startY = top - halo, endY = top + bandH + halo),
            topLeft = Offset(left - halo, top - halo), size = Size(bandW + 2 * halo, bandH + 2 * halo),
        )
        if (fade.value > 0f) drawRect(Color.Black.copy(alpha = fade.value))
    }
}
