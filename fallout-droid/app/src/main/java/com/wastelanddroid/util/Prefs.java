package com.wastelanddroid.util;

import android.content.Context;
import android.content.SharedPreferences;

/** Настройки лаунчера. Многопроцессный режим не нужен: игра читает их один раз при старте. */
public final class Prefs {
    public static final String GAME_DIR = "game_dir";
    public static final String QUALITY = "quality";          // auto|low|medium|high
    public static final String RES_SCALE = "res_scale";      // процент от нативного разрешения
    public static final String FPS_LOCK = "fps_lock";        // всегда 60, оставлено для отладки
    public static final String SHOW_HUD = "show_hud";
    public static final String SKIP_INTRO = "skip_intro";
    public static final String AUTOSAVE = "autosave";
    public static final String LAA = "laa";
    public static final String WATCHDOG = "watchdog";
    public static final String PIN_BIG_CORES = "pin_big_cores";
    public static final String USE_FOSE = "use_fose";
    /** Экранные кнопки: on — всегда, auto — скрывать при подключённом геймпаде, off — полностью выключены. */
    public static final String OVERLAY_MODE = "overlay_mode";
    /** Сразу запускать последнюю игру после заставки. */
    public static final String AUTOSTART = "autostart";
    public static final String LAST_GAME = "last_game";
    /** Выставляется при вылете или незавершённом запуске: автозапуск не срабатывает, пока игра не стартует нормально. */
    public static final String AUTOSTART_BLOCKED = "autostart_blocked";
    public static final String LAUNCH_PENDING = "launch_pending";
    public static final String CRASH_NOTICE = "crash_notice";
    /** Подробные логи Proton/Wine для диагностики (включены, пока порт в разработке). */
    public static final String GAME_LOGS = "game_logs";
    /** Прямой звук (DirectAudio) вместо обычного PulseAudio. */
    public static final String DIRECT_AUDIO = "direct_audio";
    /** Дописывать в реестр префикса ключ установщика игры. */
    public static final String FIX_REGISTRY = "fix_registry";
    /** Разрешить игре видеть геймпад. Выключено: иначе Fallout прячет курсор и игнорирует мышь. */
    public static final String GAMEPAD = "gamepad_in_game";

    private Prefs() {}

    public static SharedPreferences get(Context c) {
        return c.getSharedPreferences("wasteland", Context.MODE_PRIVATE);
    }
}
