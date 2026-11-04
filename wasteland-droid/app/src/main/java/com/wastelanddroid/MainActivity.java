package com.wastelanddroid;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AlphaAnimation;
import android.view.animation.Animation;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.controls.ControlsEditorActivity;
import com.wastelanddroid.game.DeviceProfile;
import com.wastelanddroid.game.GameActivity;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.runtime.RuntimeManager;
import com.wastelanddroid.util.Links;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;

import java.io.File;
import java.io.InputStream;
import java.util.Arrays;

/** Лаунчер: выбор папки игры, импорт рантайма, настройки, редактор управления, запуск. */
public final class MainActivity extends Activity {
    private static final int REQ_GAME_DIR = 1;
    private static final int REQ_RUNTIME = 2;

    private SharedPreferences prefs;
    private LinearLayout gameStatus, runtimeStatus;
    private TextView gamePath;
    private Button play;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        prefs = Prefs.get(this);

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());

        LinearLayout root = Ui.row(this);
        root.setGravity(Gravity.TOP);
        int pad = Ui.dp(this, 20);
        root.setPadding(pad, Ui.dp(this, 14), pad, Ui.dp(this, 14));
        frame.addView(root, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));

        root.addView(scroll(buildLeft()), new LinearLayout.LayoutParams(0, -1, 1.15f));
        View gap = new View(this);
        root.addView(gap, new LinearLayout.LayoutParams(Ui.dp(this, 16), 1));
        root.addView(scroll(buildRight()), new LinearLayout.LayoutParams(0, -1, 1f));

        setContentView(frame);
        ensureStoragePermission();
    }

    private ScrollView scroll(View content) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.setOverScrollMode(View.OVER_SCROLL_NEVER);
        s.addView(content);
        return s;
    }

    // ───────────────────────── левая колонка ─────────────────────────

    private View buildLeft() {
        LinearLayout col = Ui.column(this);

        // Шапка: логотип + название + версия
        LinearLayout header = Ui.row(this);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_launcher);
        logo.setBackground(Ui.rounded(Color.TRANSPARENT, Ui.FG_DIM, 14, this));
        logo.setClipToOutline(true);
        int ls = Ui.dp(this, 58);
        header.addView(logo, new LinearLayout.LayoutParams(ls, ls));
        LinearLayout titles = Ui.column(this);
        titles.setPadding(Ui.dp(this, 14), 0, 0, 0);
        TextView title = new TextView(this);
        title.setText("WASTELAND DROID");
        title.setTextColor(Ui.FG);
        title.setTextSize(26);
        title.setTypeface(Ui.mono(true));
        title.setLetterSpacing(0.06f);
        title.setShadowLayer(Ui.dp(this, 10), 0, 0, Color.argb(160, 138, 255, 128));
        titles.addView(title);
        TextView sub = Ui.hint(this, "Fallout 3 · ARM64 · стабильные 60 FPS · v" + versionName());
        titles.addView(sub);
        header.addView(titles);
        col.addView(header);

        // Игра
        LinearLayout game = Ui.card(this, "▌ Файлы игры");
        gamePath = Ui.label(this, "");
        gamePath.setTextColor(Ui.AMBER);
        game.addView(gamePath);
        gameStatus = Ui.column(this);
        game.addView(gameStatus);
        LinearLayout gameBtns = Ui.row(this);
        gameBtns.addView(Ui.button(this, "📁  Выбрать папку", v -> pickGameDir()));
        game.addView(gameBtns);
        col.addView(game, Ui.matchWrap(this, 14));

        // Рантайм
        LinearLayout rt = Ui.card(this, "▌ Рантайм Box64 · Wine · DXVK · Turnip");
        runtimeStatus = Ui.column(this);
        rt.addView(runtimeStatus);
        rt.addView(Ui.ghostButton(this, "⬇  Импорт rootfs.tar.gz", v -> pickRuntime()));
        col.addView(rt, Ui.matchWrap(this, 12));

        // Telegram
        col.addView(buildTelegramCard(), Ui.matchWrap(this, 12));
        return col;
    }

    private View buildTelegramCard() {
        LinearLayout card = Ui.row(this);
        card.setBackground(Ui.rounded(Color.argb(40, 42, 171, 238), Ui.TG, 14, this));
        int p = Ui.dp(this, 14);
        card.setPadding(p, p, p, p);

        TextView plane = new TextView(this);
        plane.setText("✈");
        plane.setTextSize(26);
        plane.setTextColor(Color.WHITE);
        plane.setGravity(Gravity.CENTER);
        plane.setBackground(Ui.rounded(Ui.TG, 0, 26, this));
        int s = Ui.dp(this, 52);
        card.addView(plane, new LinearLayout.LayoutParams(s, s));

        LinearLayout texts = Ui.column(this);
        texts.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 8), 0);
        TextView t1 = Ui.label(this, "Наш Telegram-канал");
        t1.setTextColor(Color.WHITE);
        t1.setTypeface(Ui.mono(true));
        texts.addView(t1);
        TextView t2 = Ui.hint(this, "@" + Links.TELEGRAM_CHANNEL + " — обновления, новые сборки и помощь");
        t2.setTextColor(Color.rgb(160, 210, 240));
        texts.addView(t2);
        card.addView(texts, Ui.weight());

        card.addView(Ui.styledButton(this, "Открыть", v -> Links.openTelegram(this), Ui.TG, Color.WHITE, 0));
        card.setOnClickListener(v -> Links.openTelegram(this));
        return card;
    }

    // ───────────────────────── правая колонка ─────────────────────────

    private View buildRight() {
        LinearLayout col = Ui.column(this);

        LinearLayout gfx = Ui.card(this, "▌ Графика");
        String[] qVals = {"auto", "low", "medium", "high"};
        String[] qNames = {"Авто — " + qualityName(DeviceProfile.autoQuality(this)), "Низкое · 720p", "Среднее · 900p", "Высокое · 1080p"};
        Spinner quality = new Spinner(this, Spinner.MODE_DROPDOWN);
        quality.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, qNames) {
            @Override public View getView(int pos, View cv, ViewGroup parent) { return style(super.getView(pos, cv, parent)); }
            @Override public View getDropDownView(int pos, View cv, ViewGroup parent) {
                View v = style(super.getDropDownView(pos, cv, parent));
                v.setBackgroundColor(Ui.BG2);
                return v;
            }
            private View style(View v) {
                TextView t = (TextView) v;
                t.setTextColor(Ui.FG);
                t.setTypeface(Ui.mono(true));
                t.setTextSize(14);
                return t;
            }
        });
        quality.setPopupBackgroundDrawable(Ui.rounded(Ui.BG2, Ui.LINE, 10, this));
        quality.setBackground(Ui.rounded(Color.argb(30, 138, 255, 128), Ui.FG_DIM, 10, this));
        quality.setSelection(Math.max(0, Arrays.asList(qVals).indexOf(prefs.getString(Prefs.QUALITY, "auto"))));
        quality.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> a, View v, int pos, long id) { prefs.edit().putString(Prefs.QUALITY, qVals[pos]).apply(); }
            @Override public void onNothingSelected(AdapterView<?> a) {}
        });
        gfx.addView(quality, new LinearLayout.LayoutParams(-1, Ui.dp(this, 44)));
        gfx.addView(Ui.slider(this, "Масштаб разрешения, %", 50, 100, prefs.getInt(Prefs.RES_SCALE, 100),
                v -> prefs.edit().putInt(Prefs.RES_SCALE, v).apply()));
        TextView lock = Ui.hint(this, "🔒 Лок 60 FPS включён всегда: выше 60 ломается физика игры.");
        gfx.addView(lock);
        gfx.addView(check("Счётчик FPS (DXVK HUD)", Prefs.SHOW_HUD, false));
        col.addView(gfx);

        LinearLayout stab = Ui.card(this, "▌ Стабильность");
        stab.addView(check("Патч памяти 4 ГБ (LAA)", Prefs.LAA, true));
        stab.addView(check("Запуск через FOSE, если есть", Prefs.USE_FOSE, true));
        stab.addView(check("Автосохранения", Prefs.AUTOSAVE, true));
        stab.addView(check("Пропуск вступительных роликов", Prefs.SKIP_INTRO, true));
        stab.addView(check("Сторож зависаний", Prefs.WATCHDOG, true));
        stab.addView(check("Только «большие» ядра CPU", Prefs.PIN_BIG_CORES, true));
        col.addView(stab, Ui.matchWrap(this, 12));

        Button controls = Ui.ghostButton(this, "🎮  Настроить управление", v -> startActivity(new Intent(this, ControlsEditorActivity.class)));
        col.addView(controls, Ui.matchWrap(this, 12));

        play = Ui.button(this, "▶  ИГРАТЬ", v -> startActivity(new Intent(this, GameActivity.class)));
        play.setTextSize(22);
        play.setLetterSpacing(0.2f);
        play.setMinHeight(Ui.dp(this, 64));
        LinearLayout.LayoutParams lp = Ui.matchWrap(this, 10);
        play.setLayoutParams(lp);
        col.addView(play);
        return col;
    }

    private CheckBox check(String text, String key, boolean def) {
        CheckBox c = Ui.check(this, text, prefs.getBoolean(key, def));
        c.setOnCheckedChangeListener((v, on) -> prefs.edit().putBoolean(key, on).apply());
        return c;
    }

    private static String qualityName(DeviceProfile.Quality q) {
        switch (q) {
            case HIGH: return "высокое";
            case MEDIUM: return "среднее";
            default: return "низкое";
        }
    }

    private String versionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    // ───────────────────────── логика ─────────────────────────

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
            runtimeStatus.removeAllViews();
            TextView busy = status("◌", "Установка рантайма…", Ui.AMBER);
            Animation blink = new AlphaAnimation(1f, 0.3f);
            blink.setDuration(600);
            blink.setRepeatMode(Animation.REVERSE);
            blink.setRepeatCount(Animation.INFINITE);
            busy.startAnimation(blink);
            runtimeStatus.addView(busy);
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

    private TextView status(String icon, String text, int color) {
        TextView t = Ui.label(this, icon + "  " + text);
        t.setTextColor(color);
        t.setTextSize(13);
        return t;
    }

    private void refresh() {
        String path = prefs.getString(Prefs.GAME_DIR, null);
        boolean gameOk = false;
        gameStatus.removeAllViews();
        if (path == null) {
            gamePath.setText("Папка не выбрана");
            gameStatus.addView(status("›", "Укажите папку, где лежат Fallout3.exe и Data", Ui.FG_DIM));
        } else {
            gamePath.setText(path);
            GameFiles.Report r = GameFiles.validate(new File(path));
            if (r.ok()) gameStatus.addView(status("✔", "Файлы игры в порядке", Ui.FG));
            if (!r.dlcs.isEmpty()) gameStatus.addView(status("◆", "DLC: " + String.join(", ", r.dlcs), Ui.FG));
            for (String e : r.errors) gameStatus.addView(status("✖", e, Ui.RED));
            for (String w : r.warnings) gameStatus.addView(status("⚠", w, Ui.AMBER));
            gameOk = r.ok();
        }
        runtimeStatus.removeAllViews();
        String miss = new RuntimeManager(this).missingComponent();
        runtimeStatus.addView(miss == null
                ? status("✔", "Рантайм установлен", Ui.FG)
                : status("✖", "Не установлен (нет " + miss + ")", Ui.RED));
        play.setEnabled(gameOk && miss == null);
        play.setText(play.isEnabled() ? "▶  ИГРАТЬ" : "▶  ИГРАТЬ  ·  не готово");
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
