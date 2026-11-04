package com.wastelanddroid.mods;

import android.content.Context;

import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.util.Files2;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Менеджер модов для Fallout 3 / New Vegas.
 *
 * Порядок загрузки в этих играх определяется датой изменения файлов .esm/.esp,
 * а список включённых плагинов — файлом %LOCALAPPDATA%\<Игра>\plugins.txt.
 * Менеджер поддерживает оба: пишет plugins.txt и выставляет даты по порядку.
 * Установка — из .zip (структура Data/... или meshes/textures/... — определяется автоматически),
 * с записью списка файлов и резервной копией перезаписанных, чтобы мод можно было удалить начисто.
 */
public final class ModManager {
    public static final class Plugin {
        public final String name;
        public boolean enabled;
        public final boolean master;
        public final boolean official;
        Plugin(String name, boolean enabled, boolean official) {
            this.name = name; this.enabled = enabled; this.official = official;
            this.master = name.toLowerCase(Locale.ROOT).endsWith(".esm");
        }
    }

    public static final class InstalledMod {
        public final String name;
        public final List<String> files = new ArrayList<>();
        InstalledMod(String n) { name = n; }
    }

    private final GameDef game;
    private final File gameDir, dataDir, stateDir;

    public ModManager(Context c, GameDef game, File gameDir) {
        this.game = game;
        this.gameDir = gameDir;
        File d = Files2.findCaseInsensitive(gameDir, "Data");
        this.dataDir = d != null ? d : new File(gameDir, "Data");
        this.stateDir = new File(new File(c.getFilesDir(), "mods"), game.id);
        stateDir.mkdirs();
    }

    private boolean isOfficial(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.equals(game.exe.toLowerCase(Locale.ROOT).replace(".exe", ".esm"))) return true;
        for (String dlc : game.dlcs) if (n.equals(dlc.toLowerCase(Locale.ROOT) + ".esm")) return true;
        return false;
    }

    // ───────────── порядок загрузки ─────────────

    private File orderFile() { return new File(stateDir, "loadorder.json"); }

    public List<Plugin> loadPlugins() {
        List<String> onDisk = new ArrayList<>();
        String[] names = dataDir.list();
        if (names != null) for (String n : names) {
            String l = n.toLowerCase(Locale.ROOT);
            if (l.endsWith(".esm") || l.endsWith(".esp")) onDisk.add(n);
        }
        List<Plugin> result = new ArrayList<>();
        try {
            if (orderFile().exists()) {
                JSONArray a = new JSONArray(new String(Files.readAllBytes(orderFile().toPath()), StandardCharsets.UTF_8));
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    String n = o.getString("name");
                    String real = findIgnoreCase(onDisk, n);
                    if (real == null) continue;
                    onDisk.remove(real);
                    result.add(new Plugin(real, o.optBoolean("enabled", true), isOfficial(real)));
                }
            }
        } catch (Exception ignored) { /* испорченный файл порядка — строим заново */ }
        // Новые плагины: в порядке дат изменения (как это делает сама игра), включены.
        Collections.sort(onDisk, (x, y) -> Long.compare(new File(dataDir, x).lastModified(), new File(dataDir, y).lastModified()));
        for (String n : onDisk) result.add(new Plugin(n, true, isOfficial(n)));
        normalize(result);
        return result;
    }

    private static String findIgnoreCase(List<String> list, String n) {
        for (String s : list) if (s.equalsIgnoreCase(n)) return s;
        return null;
    }

    /** Мастер-файлы всегда выше плагинов; основной .esm игры — первым, официальные DLC — сразу за ним. */
    public void normalize(List<Plugin> list) {
        List<Plugin> official = new ArrayList<>(), masters = new ArrayList<>(), plugins = new ArrayList<>();
        String mainEsm = game.exe.toLowerCase(Locale.ROOT).replace(".exe", ".esm");
        Plugin main = null;
        for (Plugin p : list) {
            if (p.name.equalsIgnoreCase(mainEsm)) main = p;
            else if (p.official) official.add(p);
            else if (p.master) masters.add(p);
            else plugins.add(p);
        }
        // официальные DLC — в каноническом порядке
        official.sort((a, b) -> Integer.compare(dlcIndex(a.name), dlcIndex(b.name)));
        list.clear();
        if (main != null) { main.enabled = true; list.add(main); }
        list.addAll(official);
        list.addAll(masters);
        list.addAll(plugins);
    }

    private int dlcIndex(String n) {
        for (int i = 0; i < game.dlcs.length; i++) if ((game.dlcs[i] + ".esm").equalsIgnoreCase(n)) return i;
        return 99;
    }

    public void saveOrder(List<Plugin> list) throws IOException {
        normalize(list);
        try {
            JSONArray a = new JSONArray();
            for (Plugin p : list) a.put(new JSONObject().put("name", p.name).put("enabled", p.enabled));
            Files.write(orderFile().toPath(), a.toString(2).getBytes(StandardCharsets.UTF_8));
        } catch (org.json.JSONException e) {
            throw new IOException(e);
        }
    }

    /**
     * Применение перед запуском: plugins.txt в префиксе Wine и даты файлов по порядку.
     * @return число плагинов, дату которых не удалось выставить (только чтение).
     */
    public int apply(File winePrefix) throws IOException {
        List<Plugin> list = loadPlugins();
        StringBuilder sb = new StringBuilder();
        int max = 255; // лимит движка; выше — гарантированный вылет при загрузке
        int count = 0;
        for (Plugin p : list) if (p.enabled && count++ < max) sb.append(p.name).append("\r\n");
        File local = new File(winePrefix, "drive_c/users/steamuser/AppData/Local/" + game.folder);
        local.mkdirs();
        Files.write(new File(local, "plugins.txt").toPath(), sb.toString().getBytes(StandardCharsets.ISO_8859_1));

        long base = 1199145600000L; // 2008-01-01, раньше любых пользовательских файлов
        int failed = 0;
        for (int i = 0; i < list.size(); i++) {
            File f = new File(dataDir, list.get(i).name);
            if (!f.setLastModified(base + i * 60_000L)) failed++;
        }
        return failed;
    }

    public int enabledCount(List<Plugin> list) {
        int n = 0;
        for (Plugin p : list) if (p.enabled) n++;
        return n;
    }

    // ───────────── установка/удаление из архива ─────────────

    private static final String[] DATA_DIRS = {"meshes", "textures", "sound", "music", "menus", "shaders", "scripts",
            "strings", "video", "fonts", "lodsettings", "trees", "nvse", "fose", "config"};

    private static boolean looksLikeData(String first) {
        String l = first.toLowerCase(Locale.ROOT);
        if (l.endsWith(".esp") || l.endsWith(".esm") || l.endsWith(".bsa")) return true;
        for (String d : DATA_DIRS) if (l.equals(d)) return true;
        return false;
    }

    /** Определяет, какой префикс пути в архиве соответствует папке Data. */
    static String detectRoot(List<String> entries) {
        // 1) явная папка Data
        for (String e : entries) {
            String l = e.toLowerCase(Locale.ROOT);
            int i = l.indexOf("data/");
            if ((i == 0 || (i > 0 && l.charAt(i - 1) == '/'))) return e.substring(0, i + 5);
        }
        // 2) содержимое Data на верхнем уровне, возможно, внутри одной обёрточной папки
        for (String e : entries) {
            String[] parts = e.split("/");
            if (parts.length >= 1 && looksLikeData(parts[0])) return "";
            if (parts.length >= 2 && looksLikeData(parts[1])) return parts[0] + "/";
        }
        return "";
    }

    public InstalledMod install(String name, InputStream zipStream, File cacheDir) throws IOException {
        // Сначала во временный файл: нужно два прохода (определение корня и распаковка).
        File tmp = new File(cacheDir, "mod-import.zip");
        try (OutputStream out = new FileOutputStream(tmp)) { Files2.copy(zipStream, out); }
        try {
            List<String> entries = new ArrayList<>();
            try (ZipInputStream zin = new ZipInputStream(Files.newInputStream(tmp.toPath()))) {
                ZipEntry e;
                while ((e = zin.getNextEntry()) != null) if (!e.isDirectory()) entries.add(e.getName().replace('\\', '/'));
            }
            if (entries.isEmpty()) throw new IOException("Архив пуст");
            String root = detectRoot(entries);
            String safeName = name.replaceAll("[^\\p{L}\\p{N} ._-]", "_");
            InstalledMod mod = new InstalledMod(safeName);
            File backup = new File(stateDir, safeName + ".bak");
            String dataCanon = dataDir.getCanonicalPath() + File.separator;

            try (ZipInputStream zin = new ZipInputStream(Files.newInputStream(tmp.toPath()))) {
                ZipEntry e;
                while ((e = zin.getNextEntry()) != null) {
                    if (e.isDirectory()) continue;
                    String path = e.getName().replace('\\', '/');
                    if (!path.startsWith(root)) continue; // файлы вне Data (readme, fomod) пропускаем
                    String rel = path.substring(root.length());
                    if (rel.isEmpty() || rel.toLowerCase(Locale.ROOT).startsWith("fomod/")) continue;
                    File dst = new File(dataDir, rel);
                    // защита от 'zip slip' (../ в путях архива)
                    if (!dst.getCanonicalPath().startsWith(dataCanon)) continue;
                    if (dst.exists()) {
                        File bk = new File(backup, rel);
                        if (!bk.exists()) Files2.copy(dst, bk);
                    }
                    File parent = dst.getParentFile();
                    if (parent != null) parent.mkdirs();
                    try (OutputStream out = new FileOutputStream(dst)) { Files2.copy(zin, out); }
                    mod.files.add(rel);
                }
            }
            if (mod.files.isEmpty()) throw new IOException("В архиве не найдено файлов для папки Data");
            saveMod(mod);
            return mod;
        } finally {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    private void saveMod(InstalledMod m) throws IOException {
        try {
            JSONArray f = new JSONArray();
            for (String s : m.files) f.put(s);
            Files.write(new File(stateDir, m.name + ".mod.json").toPath(),
                    new JSONObject().put("name", m.name).put("files", f).toString().getBytes(StandardCharsets.UTF_8));
        } catch (org.json.JSONException e) {
            throw new IOException(e);
        }
    }

    public List<InstalledMod> installedMods() {
        List<InstalledMod> list = new ArrayList<>();
        File[] fs = stateDir.listFiles((d, n) -> n.endsWith(".mod.json"));
        if (fs == null) return list;
        for (File f : fs) {
            try {
                JSONObject o = new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
                InstalledMod m = new InstalledMod(o.getString("name"));
                JSONArray a = o.getJSONArray("files");
                for (int i = 0; i < a.length(); i++) m.files.add(a.getString(i));
                list.add(m);
            } catch (Exception ignored) { }
        }
        list.sort((a, b) -> a.name.compareToIgnoreCase(b.name));
        return list;
    }

    /** Удаляет файлы мода и возвращает перезаписанные им оригиналы. */
    public void uninstall(InstalledMod m) throws IOException {
        File backup = new File(stateDir, m.name + ".bak");
        for (String rel : m.files) {
            File dst = new File(dataDir, rel);
            File bk = new File(backup, rel);
            if (bk.exists()) Files2.copy(bk, dst);
            else //noinspection ResultOfMethodCallIgnored
                dst.delete();
        }
        Files2.deleteTree(backup);
        //noinspection ResultOfMethodCallIgnored
        new File(stateDir, m.name + ".mod.json").delete();
    }
}
