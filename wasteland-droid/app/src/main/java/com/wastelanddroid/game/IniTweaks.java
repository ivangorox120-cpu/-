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

    /** Каталог «Мои документы/My Games/Fallout3» внутри префикса Wine. */
    public static File myGamesDir(GameDef g, File winePrefix) {
        File users = new File(winePrefix, "drive_c/users");
        File docs = new File(users, "steamuser/Documents"); // имя пользователя задаётся в LaunchConfig (USER=steamuser)
        return new File(docs, "My Games/" + g.folder);
    }

    public static void apply(GameDef g, File gameDir, File winePrefix, DeviceProfile p, boolean skipIntro, boolean autosave)
            throws IOException {
        File dir = myGamesDir(g, winePrefix);
        dir.mkdirs();
        File ini = new File(dir, "Fallout.ini");
        File prefs = new File(dir, "FalloutPrefs.ini");

        // При первом запуске игра сама копирует Fallout_default.ini — делаем это заранее, чтобы
        // наши правки не были перезаписаны.
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
        // Отражения воды — самый дорогой эффект для Adreno.
        f.set("Water", "bUseWaterReflections", p.quality == DeviceProfile.Quality.LOW ? "0" : "1");
        f.set("Water", "bUseWaterHiRes", p.quality == DeviceProfile.Quality.HIGH ? "1" : "0");
        f.set("Water", "bUseWaterDisplacements", "0");
        f.save(ini);

        IniFile pr = IniFile.load(prefs);
        pr.set("Display", "iSize W", String.valueOf(p.renderWidth));
        pr.set("Display", "iSize H", String.valueOf(p.renderHeight));
        pr.set("Display", "bFull Screen", "1");
        pr.set("Display", "iPresentInterval", "1");
        pr.set("Display", "iMultiSample", "0");
        pr.set("Display", "iMaxAnisotropy", p.quality == DeviceProfile.Quality.LOW ? "4" : "8");
        pr.set("Display", "iShadowMapResolution", p.quality == DeviceProfile.Quality.HIGH ? "1024" : "512");
        pr.set("Display", "bDoCanopyShadowPass", "0");
        pr.set("Display", "fDefaultFOV", "75.0000");
        pr.set("Water", "bUseWaterReflections", p.quality == DeviceProfile.Quality.LOW ? "0" : "1");
        pr.set("Grass", "fGrassStartFadeDistance", p.quality == DeviceProfile.Quality.LOW ? "3000" : "5000");
        pr.set("LOD", "fLODFadeOutMultObjects", p.quality == DeviceProfile.Quality.LOW ? "8.0000" : "12.0000");
        pr.set("Controls", "bBackground Mouse", "0");
        pr.set("Controls", "fMouseSensitivity", "0.0025");
        if (autosave) {
            // Автосохранения — страховка от вылетов, которых полностью не избежать даже на ПК.
            pr.set("GamePlay", "bSaveOnTravel", "1");
            pr.set("GamePlay", "bSaveOnWait", "1");
            pr.set("GamePlay", "bSaveOnRest", "1");
        }
        pr.save(prefs);
    }
}
