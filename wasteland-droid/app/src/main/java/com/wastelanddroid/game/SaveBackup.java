package com.wastelanddroid.game;

import com.wastelanddroid.util.Files2;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/** Ротация резервных копий сохранений перед каждым запуском (защита от порчи сейвов при вылете). */
public final class SaveBackup {
    private static final int KEEP = 5;

    private SaveBackup() {}

    public static void backup(File winePrefix, File backupRoot) throws IOException {
        File saves = new File(IniTweaks.myGamesDir(winePrefix), "Saves");
        String[] list = saves.list();
        if (list == null || list.length == 0) return;
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        Files2.copyTree(saves, new File(backupRoot, stamp));
        File[] all = backupRoot.listFiles(File::isDirectory);
        if (all == null || all.length <= KEEP) return;
        Arrays.sort(all, (a, b) -> a.getName().compareTo(b.getName()));
        for (int i = 0; i < all.length - KEEP; i++) Files2.deleteTree(all[i]);
    }
}
