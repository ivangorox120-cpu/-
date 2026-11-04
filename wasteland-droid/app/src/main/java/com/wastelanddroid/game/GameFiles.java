package com.wastelanddroid.game;

import android.net.Uri;
import android.os.Environment;
import android.provider.DocumentsContract;

import com.wastelanddroid.util.Files2;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Проверка выбранной папки с игрой. Файлы игры пользователь предоставляет сам (своя копия). */
public final class GameFiles {

    public static final class Report {
        public final List<String> errors = new ArrayList<>();
        public final List<String> warnings = new ArrayList<>();
        public final List<String> dlcs = new ArrayList<>();
        public boolean ok() { return errors.isEmpty(); }
    }

    private GameFiles() {}

    /** Превращает tree-URI из системного выбора папки в путь файловой системы (нужен Wine). */
    public static File treeUriToFile(Uri uri) {
        String docId = DocumentsContract.getTreeDocumentId(uri);
        int colon = docId.indexOf(':');
        String volume = colon >= 0 ? docId.substring(0, colon) : docId;
        String rel = colon >= 0 ? docId.substring(colon + 1) : "";
        File root = "primary".equalsIgnoreCase(volume)
                ? Environment.getExternalStorageDirectory()
                : new File("/storage/" + volume); // SD-карта / USB
        return rel.isEmpty() ? root : new File(root, rel);
    }

    public static Report validate(GameDef g, File dir) {
        Report r = new Report();
        if (dir == null || !dir.isDirectory() || !dir.canRead()) {
            r.errors.add("Папка недоступна. Выдайте разрешение 'Доступ ко всем файлам'.");
            return r;
        }
        if (Files2.findCaseInsensitive(dir, g.exe) == null) r.errors.add("Не найден: " + g.exe);
        for (String f : g.requiredFiles) {
            if (Files2.findCaseInsensitive(dir, f) == null) r.errors.add("Не найден: " + f);
        }
        for (String dlc : g.dlcs) {
            File esm = Files2.findCaseInsensitive(dir, "Data/" + dlc + ".esm");
            if (esm == null) continue;
            if (Files2.findCaseInsensitive(dir, "Data/" + dlc + " - Main.bsa") == null) {
                r.warnings.add("DLC " + dlc + ": найден .esm, но нет '" + dlc + " - Main.bsa' — возможен вылет при загрузке.");
            }
            r.dlcs.add(dlc);
        }
        File exe = Files2.findCaseInsensitive(dir, g.exe);
        if (exe != null) {
            ExePatcher.Info info = ExePatcher.inspect(exe);
            if (info.error != null) r.errors.add(info.error);
            if (info.usesGfwl && Files2.findCaseInsensitive(dir, "xlive.dll") == null) {
                r.warnings.add("Exe использует Games for Windows Live (xlive.dll). Это частая причина вылетов "
                        + "и чёрного экрана. Рекомендуется версия GOG/Steam без GFWL.");
            }
            if (info.steamDrm) {
                r.warnings.add("Exe защищён SteamStub: патч 4 ГБ (LAA) не будет применён. "
                        + "Игра будет ограничена 2 ГБ ОЗУ — выше риск вылетов в долгих сессиях.");
            }
        }
        if (Files2.findCaseInsensitive(dir, g.scriptExtender) != null) {
            r.warnings.add("Найден " + g.scriptExtenderName + ": запуск через " + g.scriptExtender + " (можно отключить в настройках).");
        }
        if (Files2.findCaseInsensitive(dir, "d3d9.dll") != null) {
            r.warnings.add("В папке игры есть свой d3d9.dll (ENB/ReShade/DXVK) — он заменит DXVK лаунчера. "
                    + "Если будет чёрный экран, переименуйте его.");
        }
        if (!dir.canWrite()) r.warnings.add("Папка только для чтения: патч LAA и правка ini в папке игры невозможны.");
        return r;
    }
}
