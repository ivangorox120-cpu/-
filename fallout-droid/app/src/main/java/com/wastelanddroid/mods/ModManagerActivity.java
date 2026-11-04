package com.wastelanddroid.mods;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;

import java.io.File;
import java.io.InputStream;
import java.util.List;

/** Экран менеджера модов: порядок загрузки плагинов, включение/выключение, установка из zip. */
public final class ModManagerActivity extends Activity {
    public static final String EXTRA_GAME = "game";
    private static final int REQ_ZIP = 1;

    private GameDef game;
    private ModManager mm;
    private List<ModManager.Plugin> plugins;
    private LinearLayout pluginList, modList;
    private TextView counter;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        game = GameDef.byId(getIntent().getStringExtra(EXTRA_GAME));
        String dir = game.gameDir(this);
        if (dir == null) { Toast.makeText(this, "Сначала выберите папку игры", Toast.LENGTH_LONG).show(); finish(); return; }
        mm = new ModManager(this, game, new File(dir));
        plugins = mm.loadPlugins();

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());
        LinearLayout page = Ui.column(this);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 12), pad, Ui.dp(this, 12));

        LinearLayout header = Ui.row(this);
        TextView title = Ui.label(this, "МОДЫ | " + game.title.toUpperCase());
        title.setTextSize(20);
        title.setTypeface(Ui.mono(true));
        header.addView(title, Ui.weight());
        header.addView(Ui.ghostButton(this, com.droiddeck.launcher.R.drawable.ic_download, "Установить .zip", v -> pickZip()));
        header.addView(Ui.button(this, "Сохранить", v -> save(true)));
        page.addView(header);

        LinearLayout cols = Ui.row(this);
        cols.setGravity(Gravity.TOP);

        LinearLayout left = Ui.card(this, "Порядок загрузки (сверху вниз)");
        counter = Ui.hint(this, "");
        left.addView(counter);
        pluginList = Ui.column(this);
        left.addView(pluginList);
        cols.addView(scroll(left), new LinearLayout.LayoutParams(0, -1, 1.5f));
        cols.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 14), 1));

        LinearLayout right = Ui.card(this, "Установленные архивы");
        modList = Ui.column(this);
        right.addView(modList);
        right.addView(Ui.hint(this, "Поддерживаются .zip. Архивы .7z/.rar сначала перепакуйте в .zip. "
                + "Установщики FOMOD с выбором опций ставятся целиком — лишнее удалите вручную."));
        right.addView(Ui.hint(this, "Мастер-файлы (.esm) всегда загружаются раньше плагинов (.esp); "
                + "основная игра и официальные DLC закреплены вверху."));
        cols.addView(scroll(right), new LinearLayout.LayoutParams(0, -1, 1f));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1f);
        lp.topMargin = Ui.dp(this, 10);
        page.addView(cols, lp);
        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        renderPlugins();
        renderMods();
    }

    private ScrollView scroll(View v) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.addView(v);
        return s;
    }

    private void renderPlugins() {
        pluginList.removeAllViews();
        int enabled = mm.enabledCount(plugins);
        counter.setText("Включено: " + enabled + " / 255" + (enabled > 255 ? "  — превышен лимит движка!" : ""));
        counter.setTextColor(enabled > 255 ? Ui.RED : Ui.FG_DIM);
        for (int i = 0; i < plugins.size(); i++) {
            final int idx = i;
            ModManager.Plugin p = plugins.get(i);
            LinearLayout row = Ui.row(this);
            row.setBackground(Ui.rounded(i % 2 == 0 ? Color.argb(20, 138, 255, 128) : Color.TRANSPARENT, 0, 8, this));
            TextView num = Ui.hint(this, String.format("%02X", i));
            num.setMinWidth(Ui.dp(this, 30));
            row.addView(num);
            CheckBox cb = Ui.check(this, p.name, p.enabled);
            cb.setEnabled(!(p.official && i == 0));
            cb.setTextColor(p.master ? Ui.AMBER : Ui.FG);
            cb.setOnCheckedChangeListener((v, on) -> { p.enabled = on; renderCounterOnly(); });
            row.addView(cb, Ui.weight());
            if (!p.official) {
                row.addView(small(com.droiddeck.launcher.R.drawable.ic_arrow_up, v -> move(idx, -1)));
                row.addView(small(com.droiddeck.launcher.R.drawable.ic_arrow_down, v -> move(idx, +1)));
            }
            pluginList.addView(row);
        }
    }

    private void renderCounterOnly() {
        int enabled = mm.enabledCount(plugins);
        counter.setText("Включено: " + enabled + " / 255" + (enabled > 255 ? "  — превышен лимит движка!" : ""));
    }

    private android.widget.Button small(int icon, View.OnClickListener l) {
        android.widget.Button b = Ui.ghostButton(this, "", l);
        b.setCompoundDrawablesRelative(Ui.icon(this, icon, Ui.FG, 16), null, null, null);
        b.setMinWidth(Ui.dp(this, 40));
        b.setMinimumWidth(Ui.dp(this, 40));
        b.setMinHeight(Ui.dp(this, 36));
        b.setPadding(Ui.dp(this, 8), 0, Ui.dp(this, 8), 0);
        return b;
    }

    private void move(int i, int d) {
        int j = i + d;
        if (j < 0 || j >= plugins.size()) return;
        ModManager.Plugin a = plugins.get(i), b = plugins.get(j);
        if (b.official || a.master != b.master) return; // нельзя смешивать .esm и .esp
        plugins.set(i, b);
        plugins.set(j, a);
        renderPlugins();
    }

    private void renderMods() {
        modList.removeAllViews();
        List<ModManager.InstalledMod> mods = mm.installedMods();
        if (mods.isEmpty()) modList.addView(Ui.hint(this, "Пока ничего не установлено."));
        for (ModManager.InstalledMod m : mods) {
            LinearLayout row = Ui.row(this);
            TextView t = Ui.label(this, m.name + "\n" + m.files.size() + " файлов");
            row.addView(t, Ui.weight());
            row.addView(Ui.styledButton(this, "Удалить", v -> new AlertDialog.Builder(this)
                    .setTitle("Удалить '" + m.name + "'?")
                    .setMessage("Файлы мода будут удалены, перезаписанные им файлы — восстановлены.")
                    .setPositiveButton("Удалить", (d, w) -> {
                        try { mm.uninstall(m); } catch (Exception e) { toast("Ошибка: " + e.getMessage()); }
                        plugins = mm.loadPlugins();
                        renderPlugins();
                        renderMods();
                    })
                    .setNegativeButton("Отмена", null).show(), Ui.RED, Color.WHITE, 0));
            modList.addView(row);
        }
    }

    private void pickZip() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/octet-stream"});
        startActivityForResult(i, REQ_ZIP);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_ZIP || res != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        String name = displayName(uri);
        toast("Установка '" + name + "'...");
        new Thread(() -> {
            String msg;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                ModManager.InstalledMod m = mm.install(name, in, getCacheDir());
                msg = "Установлено: " + m.name + " (" + m.files.size() + " файлов)";
            } catch (Exception e) {
                msg = "Ошибка установки: " + e.getMessage();
            }
            String fm = msg;
            runOnUiThread(() -> {
                toast(fm);
                save(false); // запоминаем текущий порядок, новые плагины добавятся в конец
                plugins = mm.loadPlugins();
                renderPlugins();
                renderMods();
            });
        }).start();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                return n.replaceAll("(?i)\\.zip$", "");
            }
        } catch (Exception ignored) { }
        return "mod-" + System.currentTimeMillis();
    }

    private void save(boolean toast) {
        try {
            mm.saveOrder(plugins);
            if (toast) toast("Порядок загрузки сохранён");
        } catch (Exception e) {
            toast("Ошибка сохранения: " + e.getMessage());
        }
        renderPlugins();
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }

    @Override
    protected void onPause() { super.onPause(); if (mm != null) try { mm.saveOrder(plugins); } catch (Exception ignored) { } }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
