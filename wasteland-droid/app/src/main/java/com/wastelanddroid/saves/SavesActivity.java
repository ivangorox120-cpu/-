package com.wastelanddroid.saves;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.runtime.RuntimeManager;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;

import java.io.File;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Сохранения: импорт с телефона (файлы .fos или .zip), экспорт, удаление, восстановление из копий. */
public final class SavesActivity extends Activity {
    public static final String EXTRA_GAME = "game";
    private static final int REQ_IMPORT = 1;

    private GameDef game;
    private SaveStore store;
    private RuntimeManager rt;
    private LinearLayout list, backups;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        game = GameDef.byId(getIntent().getStringExtra(EXTRA_GAME));
        rt = new RuntimeManager(this);
        store = new SaveStore(game, rt.prefix);

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());
        LinearLayout page = Ui.column(this);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 12), pad, Ui.dp(this, 12));

        LinearLayout header = Ui.row(this);
        TextView title = Ui.label(this, "СОХРАНЕНИЯ | " + game.title.toUpperCase());
        title.setTextSize(20);
        title.setTypeface(Ui.mono(true));
        header.addView(title, Ui.weight());
        header.addView(Ui.button(this, com.wastelanddroid.R.drawable.ic_download, "Добавить сохранения", v -> pickImport()));
        header.addView(Ui.ghostButton(this, com.wastelanddroid.R.drawable.ic_upload, "Экспорт всех", v -> exportAll()));
        page.addView(header);
        Anim.enterFromTop(header, 0);

        LinearLayout cols = Ui.row(this);
        cols.setGravity(Gravity.TOP);
        LinearLayout left = Ui.card(this, "В игре (новые сверху)");
        list = Ui.column(this);
        left.addView(list);
        left.addView(Ui.hint(this, "Добавляйте файлы .fos (вместе с .fose/.nvse, если есть) или .zip с ними. "
                + "Сохранения с ПК подходят как есть."));
        cols.addView(scroll(left), new LinearLayout.LayoutParams(0, -1, 1.5f));
        cols.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 14), 1));
        LinearLayout right = Ui.card(this, "Автокопии перед запуском");
        backups = Ui.column(this);
        right.addView(backups);
        cols.addView(scroll(right), new LinearLayout.LayoutParams(0, -1, 1f));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1f);
        lp.topMargin = Ui.dp(this, 10);
        page.addView(cols, lp);
        Anim.enter(left, 120);
        Anim.enter(right, 220);

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        render();
    }

    private ScrollView scroll(View v) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.addView(v);
        return s;
    }

    private void render() {
        list.removeAllViews();
        List<SaveStore.Save> saves = store.list();
        if (saves.isEmpty()) list.addView(Ui.hint(this, "Сохранений пока нет."));
        SimpleDateFormat df = new SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.getDefault());
        int i = 0;
        for (SaveStore.Save s : saves) {
            LinearLayout row = Ui.row(this);
            row.setBackground(Ui.rounded(i % 2 == 0 ? Color.argb(20, 138, 255, 128) : Color.TRANSPARENT, 0, 8, this));
            TextView t = Ui.label(this, s.title() + "\n" + df.format(new Date(s.file.lastModified()))
                    + " | " + (s.size() / 1024) + " КБ" + (s.companions.isEmpty() ? "" : " | +" + s.companions.size()));
            t.setTextSize(13);
            row.addView(t, Ui.weight());
            row.addView(Ui.styledButton(this, "Удалить", v -> new AlertDialog.Builder(this)
                    .setTitle("Удалить '" + s.title() + "'?")
                    .setPositiveButton("Удалить", (d, w) -> { store.delete(s); render(); })
                    .setNegativeButton("Отмена", null).show(), Color.argb(60, 255, 100, 90), Ui.RED, Ui.RED));
            list.addView(row);
            if (i < 12) Anim.enter(row, 60L * i);
            i++;
        }

        backups.removeAllViews();
        List<File> bks = SaveStore.backups(rt.backups, game);
        if (bks.isEmpty()) backups.addView(Ui.hint(this, "Копии создаются автоматически перед каждым запуском игры (последние 5)."));
        for (File bk : bks) {
            LinearLayout row = Ui.row(this);
            String[] files = bk.list();
            row.addView(Ui.label(this, prettyStamp(bk.getName()) + "\n" + (files == null ? 0 : files.length) + " файлов"), Ui.weight());
            row.addView(Ui.ghostButton(this, "Вернуть", v -> new AlertDialog.Builder(this)
                    .setTitle("Восстановить копию?")
                    .setMessage("Файлы из копии будут добавлены к текущим (одноимённые — заменены).")
                    .setPositiveButton("Восстановить", (d, w) -> {
                        try { store.restoreBackup(bk); toast("Восстановлено"); }
                        catch (Exception e) { toast("Ошибка: " + e.getMessage()); }
                        render();
                    })
                    .setNegativeButton("Отмена", null).show()));
            backups.addView(row);
        }
    }

    private static String prettyStamp(String s) {
        // yyyyMMdd-HHmmss → dd.MM.yyyy HH:mm
        if (s.length() < 15) return s;
        return s.substring(6, 8) + "." + s.substring(4, 6) + "." + s.substring(0, 4) + " " + s.substring(9, 11) + ":" + s.substring(11, 13);
    }

    private void pickImport() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(i, REQ_IMPORT);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_IMPORT || res != RESULT_OK || data == null) return;
        java.util.List<Uri> uris = new java.util.ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) for (int k = 0; k < clip.getItemCount(); k++) uris.add(clip.getItemAt(k).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        new Thread(() -> {
            int ok = 0;
            StringBuilder errors = new StringBuilder();
            for (Uri u : uris) {
                String name = displayName(u);
                try (InputStream in = getContentResolver().openInputStream(u)) {
                    ok += store.importStream(name, in);
                } catch (Exception e) {
                    errors.append('\n').append(e.getMessage());
                }
            }
            int fOk = ok;
            runOnUiThread(() -> {
                toast("Добавлено сохранений: " + fOk + errors);
                render();
            });
        }).start();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) { }
        String p = uri.getLastPathSegment();
        return p != null ? p : "save.fos";
    }

    private void exportAll() {
        try {
            File out = store.exportAll();
            toast("Скопировано в " + out.getPath());
        } catch (Exception e) {
            toast("Ошибка экспорта: " + e.getMessage());
        }
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
