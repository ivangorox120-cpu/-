package com.wastelanddroid.engine

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.droiddeck.launcher.FrontEndActivity
import com.droiddeck.launcher.frontend.AddedGames
import com.droiddeck.launcher.frontend.GameLaunchLink
import com.droiddeck.launcher.runtime.LinuxRuntime
import com.droiddeck.launcher.session.ComponentsManager
import com.droiddeck.launcher.session.GameEnvironmentStore
import com.droiddeck.launcher.session.ProtonDefault
import java.io.File

/**
 * Мост между интерфейсом Fallout Droid и движком запуска (Linux-рантайм + FEX + Proton).
 * Игра регистрируется как «добавленная» по пути к exe, запускается без клиента Steam
 * через Proton Experimental (если он установлен), иначе — через Proton движка по умолчанию.
 */
object FalloutEngine {
    sealed class Prepared {
        class Ok(val link: String, val proton: String?) : Prepared()
        class Error(val message: String) : Prepared()
    }

    @JvmStatic
    fun runtimeInstalled(context: Context): Boolean = LinuxRuntime.isInstalled(context)

    /** Выбранный Proton для игры: Experimental, если есть. Возвращает его имя или null. */
    @JvmStatic
    fun preferredProton(context: Context): ComponentsManager.Proton? = runCatching {
        val all = ComponentsManager.protons(context)
        all.firstOrNull { it.name.contains("Experimental", ignoreCase = true) || it.dir.name.contains("Experimental", ignoreCase = true) }
    }.getOrNull()

    /** Регистрирует exe в движке и настраивает запуск. Выполнять не в UI-потоке. */
    @JvmStatic
    fun prepare(context: Context, exe: File): Prepared {
        val app = context.applicationContext
        val game = when (val r = AddedGames.addExe(app, exe)) {
            is AddedGames.AddResult.Added -> r.game
            is AddedGames.AddResult.Existing -> r.game
            is AddedGames.AddResult.Switched -> r.game
            AddedGames.AddResult.Unreachable -> return Prepared.Error("Папка игры недоступна движку. Проверьте доступ ко всем файлам.")
            AddedGames.AddResult.NotFound -> return Prepared.Error("Не найден ${exe.name}")
        }
        val scope = java.lang.Long.toUnsignedString(game.appId and 0xFFFFFFFFL)
        GameEnvironmentStore.setGameNoSteam(app, scope, true)
        val proton = preferredProton(app)
        if (proton != null) runCatching { ProtonDefault.requestGame(app, scope, proton) }
        return Prepared.Ok(GameLaunchLink.uri(java.lang.Long.toUnsignedString(game.gameId)), proton?.name)
    }

    /** Запуск подготовленной игры: движок открывает сессию и экран игры. */
    @JvmStatic
    fun launch(activity: Activity, link: String) {
        activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link), activity, FrontEndActivity::class.java))
    }

    /** Экран движка: установка рантайма, Proton, вход в Steam для загрузки Proton Experimental. */
    @JvmStatic
    fun openEngine(activity: Activity) {
        activity.startActivity(Intent(activity, FrontEndActivity::class.java))
    }
}
