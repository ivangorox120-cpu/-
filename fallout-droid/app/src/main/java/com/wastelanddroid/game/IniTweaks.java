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

    public static void apply(GameDef g, File gameDir, File winePrefix, DeviceProfile p, GraphicsSettings gfx,
                             boolean skipIntro, boolean autosave)
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
        pr.set("Display", "iSize W", String.valueOf(p.renderWidth));
        pr.set("Display", "iSize H", String.valueOf(p.renderHeight));
        pr.set("Display", "bFull Screen", "1");
        pr.set("Display", "iPresentInterval", "1");
        pr.set("Display", "iMultiSample", "0");
        IniFile iniAgain = IniFile.load(ini);
        gfx.apply(iniAgain, pr);
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
