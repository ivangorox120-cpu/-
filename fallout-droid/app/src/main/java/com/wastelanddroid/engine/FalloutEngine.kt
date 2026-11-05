package com.wastelanddroid.engine

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import com.droiddeck.launcher.SessionActivity
import com.droiddeck.launcher.core.PhantomProcessLimit
import com.droiddeck.launcher.core.PhantomProcessStatus
import com.droiddeck.launcher.frontend.AddedGames
import com.droiddeck.launcher.runtime.LinuxRuntime
import com.droiddeck.launcher.runtime.LinuxRuntimeInstaller
import com.droiddeck.launcher.runtime.RuntimeInstallService
import com.droiddeck.launcher.session.ComponentsManager
import com.droiddeck.launcher.session.GameEnvironmentStore
import com.droiddeck.launcher.session.NoSteamLaunch
import com.droiddeck.launcher.session.ProtonDefault
import com.droiddeck.launcher.session.ProtonExtras
import com.droiddeck.launcher.session.SessionService
import java.io.File

/**
 * Мост между интерфейсом Fallout Droid и движком запуска (Linux-рантайм + FEX + Proton).
 * Все экраны — наши; движок используется только как библиотека.
 */
object FalloutEngine {
    fun interface Progress { fun on(stage: String, percent: Int) }

    sealed class Prepared {
        class Ok(val program: String, val args: Array<String>, val scope: String, val proton: String?) : Prepared()
        class Error(val message: String) : Prepared()
    }

    // ───── ограничение дочерних процессов (Android 12+) ─────

    @JvmStatic fun childLimitBlocks(context: Context): Boolean =
        PhantomProcessLimit.blocksSteam(PhantomProcessLimit.read(context))

    @JvmStatic fun childLimitApplies(context: Context): Boolean =
        PhantomProcessLimit.read(context) != PhantomProcessStatus.NOT_APPLICABLE

    @JvmStatic fun hasDeveloperToggle(): Boolean = PhantomProcessLimit.hasDeveloperToggle()

    @JvmStatic fun adbCommand(): String = PhantomProcessLimit.adbCommand()

    // ───── Linux-среда ─────

    @JvmStatic fun runtimeInstalled(context: Context): Boolean = LinuxRuntime.isInstalled(context)

    @JvmStatic fun runtimeBusy(): Boolean = LinuxRuntimeInstaller.isBusy()

    /** Сведения о текущей версии рантайма (сеть). null — каталог недоступен. */
    @JvmStatic fun fetchRuntime(): LinuxRuntimeInstaller.Release? = LinuxRuntimeInstaller.fetchRelease()

    /** Установка рантайма с прогрессом. Блокирующий вызов — не из UI-потока. */
    @JvmStatic fun installRuntime(context: Context, release: LinuxRuntimeInstaller.Release, progress: Progress): Boolean {
        val app = context.applicationContext
        runCatching { RuntimeInstallService.start(app, release) } // держит процесс живым, пока идёт загрузка
        return LinuxRuntimeInstaller.install(app, release, object : LinuxRuntimeInstaller.ProgressListener {
            override fun onProgress(stage: String, percent: Int) = progress.on(stage, percent)
        })
    }

    // ───── Proton ─────

    private fun ge(): ProtonExtras.Tool = ProtonExtras.tools.first { it.id == "ge" }

    @JvmStatic fun geInstalled(context: Context): String? = runCatching { ProtonExtras.installed(context, ge()) }.getOrNull()

    /** Скачивает GE-Proton (ARM64). Возвращает текст ошибки или null при успехе. */
    @JvmStatic fun installGe(context: Context, progress: Progress): String? =
        ProtonExtras.install(context.applicationContext, ge()) { stage, percent -> progress.on(stage, percent) }

    @JvmStatic fun protonExperimental(context: Context): ComponentsManager.Proton? = runCatching {
        ComponentsManager.protons(context).firstOrNull {
            it.name.contains("Experimental", ignoreCase = true) || it.dir.name.contains("Experimental", ignoreCase = true)
        }
    }.getOrNull()

    /** Proton для игры: Experimental (если скачан через Steam), иначе GE-Proton, иначе Proton движка. */
    @JvmStatic fun preferredProton(context: Context): ComponentsManager.Proton? = runCatching {
        protonExperimental(context) ?: ComponentsManager.protons(context).lastOrNull {
            it.dir.name.startsWith("GE-Proton", ignoreCase = true)
        }
    }.getOrNull()

    /** Готово ли всё для запуска (кроме выбора папки игры). */
    @JvmStatic fun ready(context: Context): Boolean = runtimeInstalled(context) && !childLimitBlocks(context)

    // ───── запуск ─────

    /** Регистрирует exe в движке и собирает команду запуска. Не из UI-потока. */
    @JvmStatic
    fun prepare(context: Context, exe: File): Prepared {
        val app = context.applicationContext
        val game = when (val r = AddedGames.addExe(app, exe)) {
            is AddedGames.AddResult.Added -> r.game
            is AddedGames.AddResult.Existing -> r.game
            is AddedGames.AddResult.Switched -> r.game
            AddedGames.AddResult.Unreachable -> return Prepared.Error("Папка игры недоступна. Выдайте приложению доступ ко всем файлам.")
            AddedGames.AddResult.NotFound -> return Prepared.Error("Не найден ${exe.name}")
        }
        val scope = java.lang.Long.toUnsignedString(game.appId and 0xFFFFFFFFL)
        GameEnvironmentStore.setGameNoSteam(app, scope, true)
        val proton = preferredProton(app)
        if (proton != null) runCatching { ProtonDefault.requestGame(app, scope, proton) }
        val command = NoSteamLaunch.addedCommand(game)
        NoSteamLaunch.remember(command)
        return Prepared.Ok(command.program, command.args.toTypedArray(), scope, proton?.name)
    }

    /** Открывает экран игры движка и запускает подготовленную команду. */
    @JvmStatic
    fun launch(activity: Activity, ok: Prepared.Ok) {
        activity.startActivity(Intent(activity, SessionActivity::class.java)
            .putExtra(SessionService.EXTRA_MODE, SessionService.MODE_RUN)
            .putExtra(SessionService.EXTRA_PROGRAM, ok.program)
            .putExtra(SessionService.EXTRA_PROGRAM_ARGS, ok.args)
            .putExtra(SessionService.EXTRA_GAME_ID, ok.scope)
            .putExtra(SessionActivity.EXTRA_RETURN_HOME, false))
    }

    /** Сессия Steam — только чтобы один раз войти и скачать Proton Experimental. */
    @JvmStatic
    fun openSteamForProton(activity: Activity) {
        activity.startActivity(Intent(activity, SessionActivity::class.java)
            .putExtra(SessionService.EXTRA_MODE, SessionService.MODE_STEAM)
            .putExtra(SessionActivity.EXTRA_RETURN_HOME, false))
    }

    @JvmStatic fun sdk(): Int = Build.VERSION.SDK_INT
}
