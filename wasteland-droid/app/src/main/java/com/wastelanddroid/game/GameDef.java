package com.wastelanddroid.game;

import android.content.Context;
import android.content.SharedPreferences;

import com.wastelanddroid.util.Prefs;

/** Поддерживаемые игры (один движок — Gamebryo/Fallout, отличаются файлами и ключами). */
public enum GameDef {
    FO3("fo3", "Fallout 3", "Fallout3.exe", "Fallout3", "fose_loader.exe", "FOSE",
            new String[]{
                    "Data/Fallout3.esm",
                    "Data/Fallout - Meshes.bsa",
                    "Data/Fallout - Textures.bsa",
                    "Data/Fallout - Sound.bsa",
                    "Data/Fallout - Voices.bsa",
                    "Data/Fallout - MenuVoices.bsa",
                    "Data/Fallout - Misc.bsa",
            },
            new String[]{"Anchorage", "ThePitt", "BrokenSteel", "PointLookout", "Zeta"},
            0xFF5F7F4F, 0xFF1A2216),
    FNV("fnv", "Fallout: New Vegas", "FalloutNV.exe", "FalloutNV", "nvse_loader.exe", "NVSE",
            new String[]{
                    "Data/FalloutNV.esm",
                    "Data/Fallout - Meshes.bsa",
                    "Data/Fallout - Textures.bsa",
                    "Data/Fallout - Textures2.bsa",
                    "Data/Fallout - Sound.bsa",
                    "Data/Fallout - Voices1.bsa",
                    "Data/Fallout - Misc.bsa",
            },
            new String[]{"DeadMoney", "HonestHearts", "OldWorldBlues", "LonesomeRoad", "GunRunnersArsenal",
                    "CaravanPack", "ClassicPack", "MercenaryPack", "TribalPack"},
            0xFFB4552A, 0xFF2A120A);

    public final String id;
    public final String title;
    public final String exe;
    /** Имя папки в «Мои документы/My Games» и ветки реестра Bethesda Softworks. */
    public final String folder;
    public final String scriptExtender;
    public final String scriptExtenderName;
    public final String[] requiredFiles;
    public final String[] dlcs;
    /** Цвета обложки по умолчанию (если пользователь не выбрал свою). */
    public final int accent, dark;

    GameDef(String id, String title, String exe, String folder, String se, String seName,
            String[] req, String[] dlcs, int accent, int dark) {
        this.id = id; this.title = title; this.exe = exe; this.folder = folder;
        this.scriptExtender = se; this.scriptExtenderName = seName;
        this.requiredFiles = req; this.dlcs = dlcs; this.accent = accent; this.dark = dark;
    }

    public static GameDef byId(String id) {
        for (GameDef g : values()) if (g.id.equals(id)) return g;
        return FO3;
    }

    public String dirKey() { return Prefs.GAME_DIR + "_" + id; }

    public String gameDir(Context c) {
        SharedPreferences p = Prefs.get(c);
        String v = p.getString(dirKey(), null);
        // перенос настройки из версии с одной игрой
        if (v == null && this == FO3) v = p.getString(Prefs.GAME_DIR, null);
        return v;
    }
}
