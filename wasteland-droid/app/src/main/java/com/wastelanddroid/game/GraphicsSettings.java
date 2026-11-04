package com.wastelanddroid.game;

import android.content.Context;
import android.content.SharedPreferences;

import com.wastelanddroid.util.IniFile;
import com.wastelanddroid.util.Prefs;

/**
 * Настройки графики — замена оригинального лаунчера игры (FalloutLauncher.exe).
 * Оригинальный лаунчер нужен только для создания ini и выбора качества; здесь то же
 * самое делается напрямую, а игра запускается сразу через exe.
 *
 * Значения — стандартные ключи FalloutPrefs.ini/Fallout.ini, общие для Fallout 3 и New Vegas.
 * Намеренно не регулируется uGridsToLoad: значения выше 5 — известная причина вылетов и порчи сейвов.
 */
public final class GraphicsSettings {
    public int textureQuality;   // 0 высокое, 1 среднее, 2 низкое (iTexMipMapSkip)
    public int anisotropy;       // 1..16
    public int shadows;          // 0 выкл, 1 низкие, 2 средние, 3 высокие
    public int viewDistance;     // 1..10 (множитель LOD)
    public int grassDensity;     // 0 выкл, 1..3
    public boolean waterReflections;
    public boolean hdr;
    public boolean bloom;
    public boolean decals;
    public boolean treeShadows;
    public int fov;              // 60..100
    public int fade;             // дальность прорисовки актёров/предметов 1..10

    private static final String P = "gfx_";

    public static GraphicsSettings preset(DeviceProfile.Quality q) {
        GraphicsSettings g = new GraphicsSettings();
        g.fov = 75;
        switch (q) {
            case HIGH:
                g.textureQuality = 0; g.anisotropy = 8; g.shadows = 2; g.viewDistance = 8; g.grassDensity = 3;
                g.waterReflections = true; g.hdr = true; g.bloom = false; g.decals = true; g.treeShadows = false; g.fade = 8;
                break;
            case MEDIUM:
                g.textureQuality = 0; g.anisotropy = 4; g.shadows = 1; g.viewDistance = 6; g.grassDensity = 2;
                g.waterReflections = true; g.hdr = true; g.bloom = false; g.decals = true; g.treeShadows = false; g.fade = 6;
                break;
            default: // SD870-класс: главное — ровные 60 к/с
                g.textureQuality = 1; g.anisotropy = 4; g.shadows = 0; g.viewDistance = 4; g.grassDensity = 1;
                g.waterReflections = false; g.hdr = false; g.bloom = true; g.decals = true; g.treeShadows = false; g.fade = 4;
                break;
        }
        return g;
    }

    public static GraphicsSettings load(Context c, DeviceProfile.Quality fallback) {
        SharedPreferences p = Prefs.get(c);
        GraphicsSettings g = preset(fallback);
        if (!p.getBoolean(P + "custom", false)) return g;
        g.textureQuality = p.getInt(P + "tex", g.textureQuality);
        g.anisotropy = p.getInt(P + "aniso", g.anisotropy);
        g.shadows = p.getInt(P + "shadows", g.shadows);
        g.viewDistance = p.getInt(P + "view", g.viewDistance);
        g.grassDensity = p.getInt(P + "grass", g.grassDensity);
        g.waterReflections = p.getBoolean(P + "water", g.waterReflections);
        g.hdr = p.getBoolean(P + "hdr", g.hdr);
        g.bloom = p.getBoolean(P + "bloom", g.bloom);
        g.decals = p.getBoolean(P + "decals", g.decals);
        g.treeShadows = p.getBoolean(P + "treeshadows", g.treeShadows);
        g.fov = p.getInt(P + "fov", g.fov);
        g.fade = p.getInt(P + "fade", g.fade);
        return g;
    }

    public void save(Context c) {
        Prefs.get(c).edit()
                .putBoolean(P + "custom", true)
                .putInt(P + "tex", textureQuality).putInt(P + "aniso", anisotropy).putInt(P + "shadows", shadows)
                .putInt(P + "view", viewDistance).putInt(P + "grass", grassDensity)
                .putBoolean(P + "water", waterReflections).putBoolean(P + "hdr", hdr).putBoolean(P + "bloom", bloom)
                .putBoolean(P + "decals", decals).putBoolean(P + "treeshadows", treeShadows)
                .putInt(P + "fov", fov).putInt(P + "fade", fade)
                .apply();
    }

    public static void resetToPreset(Context c) {
        Prefs.get(c).edit().putBoolean(P + "custom", false).apply();
    }

    private static String f(float v) { return String.format(java.util.Locale.US, "%.4f", v); }

    /** Применение к ini (вызывается из IniTweaks). */
    public void apply(IniFile ini, IniFile prefs) {
        prefs.set("Display", "iTexMipMapSkip", String.valueOf(textureQuality));
        prefs.set("Display", "iMaxAnisotropy", String.valueOf(anisotropy));
        prefs.set("Display", "fDefaultFOV", f(fov));
        prefs.set("Display", "fDefaultWorldFOV", f(fov));
        prefs.set("Display", "fDefault1stPersonFOV", f(Math.min(fov, 85)));

        // Тени
        boolean sh = shadows > 0;
        prefs.set("Display", "bDrawShadows", sh ? "1" : "0");
        prefs.set("Display", "iActorShadowCountExt", String.valueOf(sh ? shadows * 2 : 0));
        prefs.set("Display", "iActorShadowCountInt", String.valueOf(sh ? shadows * 3 : 0));
        prefs.set("Display", "iShadowMapResolution", shadows >= 3 ? "1024" : "512");
        prefs.set("Display", "iShadowFilter", sh ? String.valueOf(Math.min(shadows, 2)) : "0");
        prefs.set("Display", "bDoCanopyShadowPass", treeShadows ? "1" : "0");
        prefs.set("Display", "bShadowsOnGrass", "0");

        // Освещение: HDR и Bloom взаимоисключающие, HDR приоритетнее
        prefs.set("BlurShaderHDR", "bDoHighDynamicRange", hdr ? "1" : "0");
        prefs.set("BlurShader", "bUseBlurShader", (!hdr && bloom) ? "1" : "0");

        // Декали
        prefs.set("Display", "bDecalsOnSkinnedGeometry", decals ? "1" : "0");
        prefs.set("Display", "iMaxDecalsPerFrame", decals ? "20" : "0");
        prefs.set("Display", "iMaxSkinDecalsPerFrame", decals ? "10" : "0");

        // Вода
        prefs.set("Water", "bUseWaterReflections", waterReflections ? "1" : "0");
        prefs.set("Water", "bUseWaterReflectionsMisc", waterReflections ? "1" : "0");
        prefs.set("Water", "bUseWaterReflectionsStatics", waterReflections ? "1" : "0");
        prefs.set("Water", "bUseWaterReflectionsTrees", "0");
        prefs.set("Water", "bUseWaterReflectionsActors", "0");
        ini.set("Water", "bUseWaterReflections", waterReflections ? "1" : "0");

        // Дальность
        float lod = 4f + viewDistance * 1.6f;
        prefs.set("LOD", "fLODFadeOutMultObjects", f(lod));
        prefs.set("LOD", "fLODFadeOutMultItems", f(1.5f + fade * 0.6f));
        prefs.set("LOD", "fLODFadeOutMultActors", f(3f + fade * 1.0f));
        prefs.set("Display", "fSpecularLODStartFade", f(400f + fade * 150f));
        prefs.set("Display", "fLightLODStartFade", f(400f + fade * 150f));
        prefs.set("TerrainManager", "fBlockLoadDistanceLow", f(15000f + viewDistance * 5000f));
        prefs.set("TerrainManager", "fBlockLoadDistance", f(50000f + viewDistance * 10000f));
        prefs.set("TerrainManager", "fTreeLoadDistance", f(10000f + viewDistance * 5000f));

        // Трава
        boolean grass = grassDensity > 0;
        prefs.set("Grass", "bGrassPointLighting", "0");
        prefs.set("Grass", "fGrassStartFadeDistance", f(grass ? 1500f + grassDensity * 1500f : 0f));
        prefs.set("Grass", "fGrassMaxStartFadeDistance", f(grass ? 7000f : 0f));
        prefs.set("Grass", "iMinGrassSize", String.valueOf(grass ? 100 - grassDensity * 20 : 120));
    }
}
