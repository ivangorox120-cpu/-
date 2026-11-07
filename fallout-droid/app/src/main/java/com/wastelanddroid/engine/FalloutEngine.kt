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

    /** ARM64-сборки Proton, которые ставятся без Steam: собственная сборка движка, затем proton-cachyos. */
    private fun tool(id: String): ProtonExtras.Tool = ProtonExtras.tools.first { it.id == id }
    private val ARM_TOOLS = listOf("droiddeck", "cachyos")

    /** Имя установленной ARM64-сборки Proton или null. */
    @JvmStatic fun armProtonInstalled(context: Context): String? = runCatching {
        ARM_TOOLS.firstNotNullOfOrNull { ProtonExtras.installed(context, tool(it)) }
    }.getOrNull()

    /** Скачивает ARM64 Proton: сначала сборку движка, при неудаче — proton-cachyos. Возвращает ошибку или null. */
    @JvmStatic fun installArmProton(context: Context, progress: Progress): String? {
        var last: String? = null
        for (id in ARM_TOOLS) {
            last = ProtonExtras.install(context.applicationContext, tool(id)) { stage, percent -> progress.on(stage, percent) }
            if (last == null) return null
        }
        return last
    }

    @JvmStatic fun protonExperimental(context: Context): ComponentsManager.Proton? = runCatching {
        ComponentsManager.protons(context).firstOrNull {
            it.name.contains("Experimental", ignoreCase = true) || it.dir.name.contains("Experimental", ignoreCase = true)
        }
    }.getOrNull()

    /** Proton для игры: Experimental (если есть), иначе ARM64-сборка движка, иначе proton-cachyos. */
    @JvmStatic fun preferredProton(context: Context): ComponentsManager.Proton? = runCatching {
        val all = ComponentsManager.protons(context)
        protonExperimental(context)
            ?: all.lastOrNull { it.dir.name.startsWith("DroidDeck-Proton", ignoreCase = true) }
            ?: all.lastOrNull { it.dir.name.startsWith("proton-cachyos", ignoreCase = true) }
    }.getOrNull()

    /** Человекочитаемое имя Proton без названия движка. */
    @JvmStatic fun protonLabel(name: String): String = name.replace("DroidDeck-Proton", "Proton FD", ignoreCase = true)

    /** Префикс Proton (pfx) «добавленной» игры по её scope; появляется после первого запуска. */
    @JvmStatic fun prefixDir(context: Context, scope: String): File =
        File(LinuxRuntime.rootDir(context), "root/.local/share/Steam/steamapps/compatdata/$scope/pfx")

    @JvmStatic fun prefixReady(context: Context, scope: String): Boolean = File(prefixDir(context, scope), "system.reg").isFile

    /** Путь папки игры внутри Linux-среды (например /root/Storage/...), как его видит Wine через диск Z:. */
    @JvmStatic fun guestPath(context: Context, host: File): String? = runCatching { AddedGames.guestPath(context, host) }.getOrNull()

    /** Подробные логи Proton/Wine/DXVK в папке сессии (для диагностики). */
    @JvmStatic fun setGameDebugLogs(context: Context, on: Boolean) {
        runCatching { com.droiddeck.launcher.session.SessionPrefs.setGameDebugLogsEnabled(context, on) }
        runCatching { GameEnvironmentStore.publish(context) }
    }

    /** Режим экранного геймпада в игре: auto (скрыт при физическом геймпаде), on, off. */
    @JvmStatic fun setTouchControlsMode(context: Context, mode: String) {
        val v = when (mode) {
            "on" -> com.droiddeck.launcher.session.SessionPrefs.OSC_ALWAYS
            "off" -> com.droiddeck.launcher.session.SessionPrefs.OSC_NEVER
            else -> com.droiddeck.launcher.session.SessionPrefs.OSC_AUTO
        }
        runCatching { com.droiddeck.launcher.session.SessionPrefs.setOscMode(context, v) }
    }

    /** Есть ли в Linux-среде хоть один Proton, которым скрипт запуска сможет запустить игру. */
    @JvmStatic fun anyProton(context: Context): Boolean = runCatching { ComponentsManager.protons(context).isNotEmpty() }.getOrDefault(false)

    /** Готово ли всё для запуска (кроме выбора папки игры). */
    @JvmStatic fun ready(context: Context): Boolean = runtimeInstalled(context) && !childLimitBlocks(context) && anyProton(context)

    /** Архив логов последней игровой сессии (для отправки разработчику) или null. Не из UI-потока. */
    @JvmStatic fun lastSessionLogs(context: Context): File? = runCatching {
        com.droiddeck.launcher.session.SessionLogShare.latest(context)?.let {
            com.droiddeck.launcher.session.SessionLogShare.zipFolder(context, it, null)
        }
    }.getOrNull()

    @JvmStatic fun shareLogsIntent(context: Context, zip: File): Intent =
        com.droiddeck.launcher.session.SessionLogShare.shareIntent(context, zip)

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

    @JvmStatic fun sdk(): Int = Build.VERSION.SDK_INT
}
