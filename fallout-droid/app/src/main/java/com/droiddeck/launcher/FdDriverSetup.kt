package com.droiddeck.launcher

import android.app.Activity
import android.os.Handler
import android.os.Looper
import com.droiddeck.launcher.gpu.GpuInfo
import com.droiddeck.launcher.session.SessionPrefs

/**
 * Автоподбор графических драйверов без экранов движка.
 *
 * На Adreno 8xx встроенный Turnip годится не для всех чипов: Android-компоситор с ним не видит
 * GPU («present: no physical devices»), и игра идёт без картинки. Движок в своём меню драйверов
 * сам скачивает рекомендованную пару (драйвер экрана + драйвер Linux); здесь то же самое,
 * только для нашего мастера настройки.
 */
class FdDriverSetup(activity: Activity) {
    private val menus = DriverMenus(activity, Handler(Looper.getMainLooper()))
    private val context = activity.applicationContext

    /** Нужен ли скачиваемый драйвер этому GPU (не Adreno — системный драйвер подходит сам). */
    fun applies(): Boolean = menus.gpu.family != GpuInfo.Family.NOT_ADRENO

    /** Запускает проверку и при необходимости загрузку рекомендованной пары. */
    fun start(force: Boolean) {
        SessionPrefs.setGpuDriverMode(context, SessionPrefs.GPU_DRIVERS_AUTO)
        menus.mode = SessionPrefs.GPU_DRIVERS_AUTO
        menus.ensureAuto(force)
    }

    fun busy(): Boolean = menus.pairBusy != null || menus.releaseChecking
    fun percent(): Int = menus.pairPercent
    fun status(): String = menus.autoStatus

    /** Рекомендованная пара установлена и выбрана. */
    fun ready(): Boolean {
        if (!applies()) return true
        menus.refreshPairs()
        val rows = menus.pairRows
        return rows.any { it.recommended && it.active } || (rows.none { it.recommended } && rows.any { it.active })
    }

    /** Название выбранного драйвера экрана для показа пользователю. */
    fun activeName(): String? = menus.pairRows.firstOrNull { it.active }?.let { "${it.name} ${it.version}" }

    companion object {
        /** Драйвер уже выбран (скачанный), без запросов в сеть. */
        @JvmStatic fun chosen(activity: Activity): Boolean {
            val id = SessionPrefs.androidDriver(activity)
            if (id.isEmpty()) return false
            // скачанный рекомендованный или выбранный вручную в настройке контейнера
            return SessionPrefs.gpuAutoInstalled(activity).contains(id) ||
                activity.getSharedPreferences("wasteland", android.content.Context.MODE_PRIVATE).getBoolean("driver_manual", false)
        }
    }
}
