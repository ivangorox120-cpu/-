package com.wastelanddroid.saves;

import android.os.Environment;

import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.game.IniTweaks;
import com.wastelanddroid.util.Files2;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Сохранения игры внутри префикса Wine: My Games/<Игра>/Saves.
 * Файлы сохранений — *.fos (и у Fallout 3, и у New Vegas); рядом могут лежать
 * 'ко-сейвы' расширителей скриптов (*.fose, *.nvse) — переносятся вместе с ними.
 */
public final class SaveStore {
    public static final class Save {
        public final File file;
        public final List<File> companions = new ArrayList<>();
        Save(File f) { file = f; }
        public String title() { return file.getName().replaceAll("(?i)\\.fos$", ""); }
        public long size() { long s = file.length(); for (File c : companions) s += c.length(); return s; }
    }

    private final GameDef game;
    public final File dir;

    public SaveStore(GameDef g, File winePrefix) {
        game = g;
        dir = new File(IniTweaks.myGamesDir(g, winePrefix), "Saves");
        dir.mkdirs();
    }

    private static boolean isSave(String n) { return n.toLowerCase(Locale.ROOT).endsWith(".fos"); }

    private static boolean isCompanion(String n) {
        String l = n.toLowerCase(Locale.ROOT);
        return l.endsWith(".fose") || l.endsWith(".nvse") || l.endsWith(".obse") || l.endsWith(".bak");
    }

    public static boolean acceptsFile(String n) { return isSave(n) || isCompanion(n); }

    public List<Save> list() {
        List<Save> out = new ArrayList<>();
        File[] fs = dir.listFiles();
        if (fs == null) return out;
        for (File f : fs) {
            if (!f.isFile() || !isSave(f.getName())) continue;
            Save s = new Save(f);
            String base = f.getName().substring(0, f.getName().length() - 4);
            for (File o : fs) {
                if (o != f && isCompanion(o.getName()) && o.getName().regionMatches(true, 0, base, 0, base.length())) s.companions.add(o);
            }
            out.add(s);
        }
        out.sort((a, b) -> Long.compare(b.file.lastModified(), a.file.lastModified()));
        return out;
    }

    /** Импорт одного файла (.fos/.fose/.nvse) или .zip с ними. @return число импортированных сейвов. */
    public int importStream(String name, InputStream in) throws IOException {
        String l = name.toLowerCase(Locale.ROOT);
        if (l.endsWith(".zip")) return importZip(in);
        if (!acceptsFile(name)) throw new IOException("'" + name + "' — не файл сохранения (.fos)");
        File dst = new File(dir, new File(name).getName());
        writeAtomic(in, dst);
        return isSave(name) ? 1 : 0;
    }

    private int importZip(InputStream in) throws IOException {
        int n = 0;
        try (ZipInputStream z = new ZipInputStream(in)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                if (e.isDirectory()) continue;
                String fname = new File(e.getName().replace('\\', '/')).getName(); // только имя — без путей
                if (!acceptsFile(fname)) continue;
                writeAtomic(z, new File(dir, fname));
                if (isSave(fname)) n++;
            }
        }
        if (n == 0) throw new IOException("В архиве нет файлов .fos");
        return n;
    }

    private static void writeAtomic(InputStream in, File dst) throws IOException {
        File tmp = new File(dst.getPath() + ".part");
        try (OutputStream out = new FileOutputStream(tmp)) { Files2.copy(in, out); }
        if (dst.exists() && !dst.delete()) throw new IOException("Не удалось заменить " + dst.getName());
        if (!tmp.renameTo(dst)) throw new IOException("Не удалось сохранить " + dst.getName());
    }

    /** Экспорт всех сохранений в Download/FalloutDroid/<Игра>/. */
    public File exportAll() throws IOException {
        File out = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "FalloutDroid/" + game.folder);
        out.mkdirs();
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) if (f.isFile() && acceptsFile(f.getName())) Files2.copy(f, new File(out, f.getName()));
        return out;
    }

    public void delete(Save s) {
        //noinspection ResultOfMethodCallIgnored
        s.file.delete();
        for (File c : s.companions) //noinspection ResultOfMethodCallIgnored
            c.delete();
    }

    /** Резервные копии, сделанные перед запусками (новые сверху). */
    public static List<File> backups(File backupRoot, GameDef g) {
        File[] fs = new File(backupRoot, g.id).listFiles(File::isDirectory);
        if (fs == null) return new ArrayList<>();
        List<File> l = new ArrayList<>(Arrays.asList(fs));
        l.sort((a, b) -> b.getName().compareTo(a.getName()));
        return l;
    }

    public void restoreBackup(File backup) throws IOException {
        Files2.copyTree(backup, dir);
    }
}
