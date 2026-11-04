package com.wastelanddroid;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.AdapterView;

import com.wastelanddroid.controls.ControlsEditorActivity;
import com.wastelanddroid.game.DeviceProfile;
import com.wastelanddroid.game.GameActivity;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.runtime.RuntimeManager;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.Ui;

import java.io.File;
import java.io.InputStream;

/** Лаунчер: выбор папки игры, импорт рантайма, настройки, редактор управления, запуск. */
public final class MainActivity extends Activity {
    private static final int REQ_GAME_DIR = 1;
    private static final int REQ_RUNTIME = 2;

    private SharedPreferences prefs;
    private TextView gameInfo, runtimeInfo;
    private Button play;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        prefs = Prefs.get(this);

        LinearLayout root = Ui.row(this);
        root.setBackgroundColor(Ui.BG);
        int pad = Ui.dp(this, 16);
        root.setPadding(pad, pad, pad, pad);
        root.setGravity(android.view.Gravity.TOP);

        // Левая колонка: игра и рантайм
        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.VERTICAL);
        TextView title = Ui.label(this, "WASTELAND DROID");
        title.setTextSize(28);
        title.setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD);
        left.addView(title);
        left.addView(Ui.button(this, "Выбрать папку с игрой", v -> pickGameDir()));
        gameInfo = Ui.label(this, "");
        left.addView(gameInfo);
        left.addView(Ui.button(this, "Импорт рантайма (rootfs.tar.gz)", v -> pickRuntime()));
        runtimeInfo = Ui.label(this, "");
        left.addView(runtimeInfo);
        ScrollView leftScroll = new ScrollView(this);
        leftScroll.addView(left);
        root.addView(leftScroll, new LinearLayout.LayoutParams(0, -1, 1.2f));

        // Правая колонка: настройки и запуск
        LinearLayout right = new LinearLayout(this);
        right.setOrientation(LinearLayout.VERTICAL);
        right.addView(Ui.label(this, "Качество (лок 60 к/с всегда включён)"));
        Spinner quality = new Spinner(this);
        String[] qVals = {"auto", "low", "medium", "high"};
        quality.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"Авто (" + DeviceProfile.autoQuality(this).name().toLowerCase() + ")", "Низкое (720p)", "Среднее (900p)", "Высокое (1080p)"}));
        quality.setSelection(java.util.Arrays.asList(qVals).indexOf(prefs.getString(Prefs.QUALITY, "auto")));
        quality.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> a, View v, int pos, long id) { prefs.edit().putString(Prefs.QUALITY, qVals[pos]).apply(); }
            @Override public void onNothingSelected(AdapterView<?> a) {}
        });
        right.addView(quality);
        right.addView(Ui.slider(this, "Масштаб разрешения, %", 50, 100, prefs.getInt(Prefs.RES_SCALE, 100),
                v -> prefs.edit().putInt(Prefs.RES_SCALE, v).apply()));
        right.addView(check("Патч памяти 4 ГБ (LAA)", Prefs.LAA, true));
        right.addView(check("Запуск через FOSE, если есть", Prefs.USE_FOSE, true));
        right.addView(check("Автосохранения (переход/сон/ожидание)", Prefs.AUTOSAVE, true));
        right.addView(check("Пропуск вступительных роликов", Prefs.SKIP_INTRO, true));
        right.addView(check("Сторож зависаний", Prefs.WATCHDOG, true));
        right.addView(check("Игра только на больших ядрах CPU", Prefs.PIN_BIG_CORES, true));
        right.addView(check("Счётчик FPS (DXVK HUD)", Prefs.SHOW_HUD, false));
        right.addView(Ui.button(this, "Настроить управление", v -> startActivity(new Intent(this, ControlsEditorActivity.class))));
        play = Ui.button(this, "▶  ИГРАТЬ", v -> startActivity(new Intent(this, GameActivity.class)));
        play.setTextSize(22);
        right.addView(play);
        ScrollView rightScroll = new ScrollView(this);
        rightScroll.addView(right);
        root.addView(rightScroll, new LinearLayout.LayoutParams(0, -1, 1f));

        setContentView(root);
        ensureStoragePermission();
    }

    private CheckBox check(String text, String key, boolean def) {
        CheckBox c = new CheckBox(this);
        c.setText(text);
        c.setTextColor(Ui.FG);
        c.setChecked(prefs.getBoolean(key, def));
        c.setOnCheckedChangeListener((v, on) -> prefs.edit().putBoolean(key, on).apply());
        return c;
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void ensureStoragePermission() {
        // Wine работает с обычными путями файловой системы, поэтому нужен «доступ ко всем файлам».
        if (Environment.isExternalStorageManager()) return;
        new AlertDialog.Builder(this)
                .setTitle("Нужен доступ к файлам")
                .setMessage("Игра читает файлы напрямую из выбранной папки. Разрешите «Доступ ко всем файлам».")
                .setPositiveButton("Открыть настройки", (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                    }
                })
                .show();
    }

    private void pickGameDir() {
        startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_GAME_DIR);
    }

    private void pickRuntime() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i, REQ_RUNTIME);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (req == REQ_GAME_DIR) {
            File dir = GameFiles.treeUriToFile(uri);
            prefs.edit().putString(Prefs.GAME_DIR, dir.getPath()).apply();
            refresh();
        } else if (req == REQ_RUNTIME) {
            runtimeInfo.setText("Установка рантайма…");
            new Thread(() -> {
                String msg;
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    new RuntimeManager(this).install(in);
                    msg = "Рантайм установлен";
                } catch (Exception e) {
                    msg = "Ошибка установки: " + e.getMessage();
                }
                String m = msg;
                runOnUiThread(() -> { Toast.makeText(this, m, Toast.LENGTH_LONG).show(); refresh(); });
            }).start();
        }
    }

    private void refresh() {
        String path = prefs.getString(Prefs.GAME_DIR, null);
        boolean gameOk = false;
        if (path == null) {
            gameInfo.setText("Папка не выбрана.\nУкажите папку, где лежат Fallout3.exe и Data.");
        } else {
            GameFiles.Report r = GameFiles.validate(new File(path));
            StringBuilder sb = new StringBuilder(path).append('\n');
            if (r.ok()) sb.append("✔ Файлы игры в порядке");
            if (!r.dlcs.isEmpty()) sb.append("\nDLC: ").append(String.join(", ", r.dlcs));
            for (String e : r.errors) sb.append("\n✖ ").append(e);
            for (String w : r.warnings) sb.append("\n⚠ ").append(w);
            gameInfo.setText(sb);
            gameOk = r.ok();
        }
        RuntimeManager rt = new RuntimeManager(this);
        String miss = rt.missingComponent();
        runtimeInfo.setText(miss == null ? "✔ Рантайм установлен" : "✖ Рантайм не установлен (нет " + miss + ")");
        play.setEnabled(gameOk && miss == null);
        play.setAlpha(play.isEnabled() ? 1f : 0.4f);
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
