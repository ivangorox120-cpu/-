package com.wastelanddroid.game;

import com.wastelanddroid.util.Files2;
import com.wastelanddroid.util.IniFile;

import java.io.File;
import java.io.IOException;

/**
 * Твики Fallout.ini / FalloutPrefs.ini, закрывающие известные проблемы игры, которые
 * воспроизводятся и на ПК: вылеты на многоядерных CPU, зависания при подгрузке ячеек,
 * рассинхрон физики при высоком FPS. Каждый ключ — стандартный параметр движка.
 */
public final class IniTweaks {
    private IniTweaks() {}

    /** Каталог 'Мои документы/My Games/Fallout3' внутри префикса Wine. */
    public static File myGamesDir(GameDef g, File winePrefix) {
        File users = new File(winePrefix, "drive_c/users");
        File docs = new File(users, "steamuser/Documents"); // пользователь префикса Proton — steamuser
        return new File(docs, "My Games/" + g.folder);
    }

    /** Видеорежим игры: 1280x720 (поддерживается всеми сборками Wine/Proton и самой игрой). */
    static int[] gameMode(DeviceProfile p) {
        return new int[]{1280, 720};
    }

    public static void apply(GameDef g, File gameDir, File winePrefix, DeviceProfile p, GraphicsSettings gfx,
                             boolean skipIntro, boolean autosave, boolean gamepad)
            throws IOException {
        File dir = ProtonPrefix.myGamesDir(g, winePrefix);
        dir.mkdirs();
        File ini = new File(dir, "Fallout.ini");
        File prefs = new File(dir, "FalloutPrefs.ini");

        // При первом запуске игра сама копирует Fallout_default.ini — делаем это заранее, чтобы
        // наши правки не были перезаписаны.
        // Замена оригинального лаунчера: он лишь создаёт эти ini при первом запуске.
        if (!ini.exists()) {
            File def = Files2.findCaseInsensitive(gameDir, "Fallout_default.ini");
            if (def != null) Files2.copy(def, ini);
        }

        IniFile f = IniFile.load(ini);
        // Классический фикс вылетов/фризов FO3 на CPU с >2 ядрами: движок плохо масштабируется.
        f.set("General", "iNumHWThreads", "2");
        f.set("General", "bUseThreadedAI", "1");
        f.set("General", "bUseThreadedMorpher", "1");
        f.set("General", "bUseThreadedBlood", "1");
        f.set("General", "bUseThreadedTempEffects", "1");
        f.set("General", "bUseThreadedParticleSystem", "1");
        // Фоновая подгрузка: меньше статтеров на границах ячеек.
        f.set("General", "bBackgroundLoadLipFiles", "1");
        f.set("General", "bLoadBackgroundFaceGen", "1");
        f.set("General", "bBackgroundCellLoads", "1");
        f.set("General", "bLoadHelmetsInBackground", "1");
        f.set("General", "bUseHardDriveCache", "0");
        // Без фиксированного шага времени: физика идёт по реальному времени, кадры ограничены 60 снаружи.
        f.set("General", "iFPSClamp", "0");
        if (skipIntro) f.set("General", "SIntroSequence", "");
        // Сглаживание выключено: на мобильном GPU даёт мало пользы и много нагрузки.
        f.set("Display", "iMultiSample", "0");
        // VSync включён внутри игры, сам лок 60 к/с обеспечивает DXVK + 60 Гц режим экрана.
        f.set("Display", "iPresentInterval", "1");
        f.set("Display", "bFull Screen", "1");
        f.set("Water", "bUseWaterDisplacements", "0");
        f.set("Water", "bUseWaterHiRes", p.quality == DeviceProfile.Quality.HIGH ? "1" : "0");
        // Без этого 'свободные' файлы модов (meshes/textures) не перекрывают BSA — моды 'не работают'.
        f.set("Archive", "bInvalidateOlderFiles", "1");
        f.set("Archive", "SInvalidationFile", "");
        // Стабильный размер мира: больше 5 — классическая причина вылетов и битых сейвов.
        f.set("General", "uGridsToLoad", "5");
        f.set("General", "uExterior Cell Buffer", "36");

        IniFile pr = IniFile.load(prefs);
        // Разрешение игры — стандартное 16:9, которое есть в списке видеорежимов Wine.
        // Разрешение экрана телефона (например 2400x1080) игра отвергает: «Failed to initialize
        // renderer». Экран сессии всё равно 720p по высоте, на весь экран картинку растягивает gamescope.
        int[] mode = gameMode(p);
        pr.set("Display", "iSize W", String.valueOf(mode[0]));
        pr.set("Display", "iSize H", String.valueOf(mode[1]));
        pr.set("Display", "bFull Screen", "1");
        pr.set("Display", "iPresentInterval", "1");
        pr.set("Display", "iMultiSample", "0");
        IniFile iniAgain = IniFile.load(ini);
        gfx.apply(iniAgain, pr);
        // Самое важное для мыши: пока игра считает, что подключён геймпад, она уходит в режим
        // контроллера — курсор в меню пропадает, а мышь игнорируется. Движок всегда показывает
        // игре виртуальный Xbox-контроллер, поэтому джойстик выключаем в обоих ini.
        String joystick = gamepad ? "1" : "0";
        iniAgain.set("Controls", "bUse Joystick", joystick);
        pr.set("Controls", "bUse Joystick", joystick);
        if (!gamepad) pr.set("Controls", "bGamePadRumble", "0");
        iniAgain.save(ini);
        pr.set("Controls", "bBackground Mouse", "0");
        pr.set("Controls", "fMouseSensitivity", "0.0025");
        if (autosave) {
            // Автосохранения — страховка от вылетов, которых полностью не избежать даже на ПК.
            pr.set("GamePlay", "bSaveOnTravel", "1");
            pr.set("GamePlay", "bSaveOnWait", "1");
            pr.set("GamePlay", "bSaveOnRest", "1");
        }
        pr.save(prefs);
        // Копия для скрипта запуска: он разложит ini всем пользователям Wine сразу после того,
        // как Proton создаст префикс (до первого старта игры).
        // pfx = <rootfs>/root/.local/share/Steam/steamapps/compatdata/<id>/pfx
        File share = winePrefix.getParentFile().getParentFile().getParentFile().getParentFile().getParentFile();
        File stage = new File(share, "fallout-droid/ini/" + g.folder);
        if (stage.mkdirs() || stage.isDirectory()) {
            Files2.copy(ini, new File(stage, "Fallout.ini"));
            Files2.copy(prefs, new File(stage, "FalloutPrefs.ini"));
        }
        // Если Wine завёл пользователя с другим именем, кладём те же ini и ему: без них игра
        // открывает оригинальный лаунчер вместо себя.
        File users = new File(winePrefix, "drive_c/users");
        File[] list = users.listFiles();
        if (list != null) for (File u : list) {
            if (!u.isDirectory() || u.getName().equals("steamuser") || u.getName().equalsIgnoreCase("Public")) continue;
            File other = new File(u, "Documents/My Games/" + g.folder);
            if (!other.mkdirs() && !other.isDirectory()) continue;
            Files2.copy(ini, new File(other, "Fallout.ini"));
            Files2.copy(prefs, new File(other, "FalloutPrefs.ini"));
        }
    }
}
