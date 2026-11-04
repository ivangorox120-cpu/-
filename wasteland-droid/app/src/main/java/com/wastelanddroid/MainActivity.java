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
import com.wastelanddroid.controls.GamepadEditor;
import com.wastelanddroid.game.DeviceProfile;
import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.game.GraphicsActivity;
import com.wastelanddroid.mods.ModManagerActivity;
import com.wastelanddroid.game.GameActivity;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.runtime.RuntimeManager;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.CoverView;
import com.wastelanddroid.util.WastelandBackdrop;
import com.wastelanddroid.saves.SavesActivity;
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
    private static final int REQ_COVER = 3;
    private static final int REQ_SPLASH = 4;

    private SharedPreferences prefs;
    private TextView headerTitle;
    /** Бесконечные анимации работают только пока экран виден — иначе тратили бы батарею во время игры. */
    private final java.util.List<android.animation.Animator> loops = new java.util.ArrayList<>();
    private LinearLayout runtimeStatus;
    private GameDef pendingGame = GameDef.FO3;
    private final java.util.Map<GameDef, GameCard> cards = new java.util.EnumMap<>(GameDef.class);

    /** Карточка игры: обложка, статус, кнопки. */
    private final class GameCard {
        final GameDef def;
        final CoverView cover = new CoverView(MainActivity.this);
        final LinearLayout status = Ui.column(MainActivity.this);
        final TextView path = Ui.hint(MainActivity.this, "");
        final Button play;
        android.animation.Animator pulse;

        GameCard(GameDef d) {
            def = d;
            play = Ui.button(MainActivity.this, "▶  ИГРАТЬ", v -> launch(def));
            play.setTextSize(18);
            play.setLetterSpacing(0.15f);
        }

        View build() {
            LinearLayout card = Ui.column(MainActivity.this);
            card.setBackground(Ui.rounded(Ui.CARD, Ui.LINE, 16, MainActivity.this));
            int p = Ui.dp(MainActivity.this, 10);
            card.setPadding(p, p, p, p);
            card.addView(cover, new LinearLayout.LayoutParams(-1, Ui.dp(MainActivity.this, 190)));
            path.setSingleLine(true);
            path.setEllipsize(android.text.TextUtils.TruncateAt.START);
            card.addView(path, Ui.matchWrap(MainActivity.this, 6));
            card.addView(status);
            LinearLayout btns = Ui.row(MainActivity.this);
            Button folder = Ui.ghostButton(MainActivity.this, "📁 Папка", v -> { pendingGame = def; pickGameDir(); });
            Button art = Ui.ghostButton(MainActivity.this, "🖼 Обложка", v -> { pendingGame = def; pickCover(); });
            Button mods = Ui.ghostButton(MainActivity.this, "🧩 Моды", v -> {
                if (def.gameDir(MainActivity.this) == null) { Toast.makeText(MainActivity.this, "Сначала выберите папку игры", Toast.LENGTH_SHORT).show(); return; }
                open(new Intent(MainActivity.this, ModManagerActivity.class).putExtra(ModManagerActivity.EXTRA_GAME, def.id));
            });
            Button saves = Ui.ghostButton(MainActivity.this, "💾 Сейвы", v ->
                    open(new Intent(MainActivity.this, SavesActivity.class).putExtra(SavesActivity.EXTRA_GAME, def.id)));
            btns.addView(folder, Ui.weight());
            btns.addView(art, Ui.weight());
            card.addView(btns);
            LinearLayout btns2 = Ui.row(MainActivity.this);
            btns2.addView(mods, Ui.weight());
            btns2.addView(saves, Ui.weight());
            card.addView(btns2);
            card.addView(play, Ui.matchWrap(MainActivity.this, 2));
            play.setMinHeight(Ui.dp(MainActivity.this, 54));
            cover.setOnLongClickListener(v -> { new File(coverFile(def).getPath()).delete(); refresh(); return true; });
            return card;
        }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        prefs = Prefs.get(this);

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());

        LinearLayout page = Ui.column(this);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 12), pad, Ui.dp(this, 12));
        page.addView(buildHeader());

        LinearLayout body = Ui.row(this);
        body.setGravity(Gravity.TOP);
        body.addView(scroll(buildGames()), new LinearLayout.LayoutParams(0, -1, 1.35f));
        body.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 16), 1));
        body.addView(scroll(buildRight()), new LinearLayout.LayoutParams(0, -1, 1f));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-1, 0, 1f);
        blp.topMargin = Ui.dp(this, 10);
        page.addView(body, blp);

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        Anim.enterFromTop(page.getChildAt(0), 0);
        ensureStoragePermission();
    }

    /** Переход на другой экран с плавным затуханием. */
    private void open(Intent i) {
        startActivity(i);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    private ScrollView scroll(View content) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.setOverScrollMode(View.OVER_SCROLL_NEVER);
        s.addView(content);
        return s;
    }

    // ───────────────────────── шапка ─────────────────────────

    private View buildHeader() {
        LinearLayout header = Ui.row(this);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_launcher);
        logo.setBackground(Ui.rounded(Color.TRANSPARENT, Ui.FG_DIM, 12, this));
        logo.setClipToOutline(true);
        int ls = Ui.dp(this, 46);
        header.addView(logo, new LinearLayout.LayoutParams(ls, ls));

        LinearLayout titles = Ui.column(this);
        titles.setPadding(Ui.dp(this, 12), 0, 0, 0);
        TextView title = new TextView(this);
        title.setText("FALLOUT DROID");
        title.setTextColor(Ui.FG);
        title.setTextSize(22);
        title.setTypeface(Ui.mono(true));
        title.setLetterSpacing(0.06f);
        title.setShadowLayer(Ui.dp(this, 10), 0, 0, Color.argb(160, 138, 255, 128));
        titles.addView(title);
        headerTitle = title;
        TextView by = Ui.hint(this, "by Rommy  ·  Fallout 3 · New Vegas · 60 FPS · v" + versionName());
        by.setTextColor(Ui.AMBER);
        titles.addView(by);
        header.addView(titles, Ui.weight());

        // Telegram-«пилюля»
        LinearLayout tg = Ui.row(this);
        tg.setBackground(Ui.rounded(Color.argb(50, 42, 171, 238), Ui.TG, 22, this));
        int p = Ui.dp(this, 6);
        tg.setPadding(p, p, Ui.dp(this, 14), p);
        TextView plane = new TextView(this);
        plane.setText("✈");
        plane.setTextSize(16);
        plane.setTextColor(Color.WHITE);
        plane.setGravity(Gravity.CENTER);
        plane.setBackground(Ui.rounded(Ui.TG, 0, 16, this));
        int s = Ui.dp(this, 32);
        tg.addView(plane, new LinearLayout.LayoutParams(s, s));
        LinearLayout tgText = Ui.column(this);
        tgText.setPadding(Ui.dp(this, 8), 0, 0, 0);
        TextView t1 = Ui.label(this, "@" + Links.TELEGRAM_CHANNEL);
        t1.setTextColor(Color.WHITE);
        t1.setTypeface(Ui.mono(true));
        t1.setPadding(0, 0, 0, 0);
        tgText.addView(t1);
        TextView t2 = Ui.hint(this, "Наш Telegram-канал");
        t2.setTextColor(Color.rgb(160, 210, 240));
        t2.setPadding(0, 0, 0, 0);
        tgText.addView(t2);
        tg.addView(tgText);
        tg.setOnClickListener(v -> Links.openTelegram(this));
        tg.setForeground(new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(Color.argb(80, 255, 255, 255)), null,
                Ui.rounded(Color.WHITE, 0, 22, this)));
        header.addView(tg);
        return header;
    }

    // ───────────────────────── игры ─────────────────────────

    private View buildGames() {
        LinearLayout col = Ui.column(this);
        LinearLayout row = Ui.row(this);
        row.setGravity(Gravity.TOP);
        boolean first = true;
        for (GameDef d : GameDef.values()) {
            GameCard c = new GameCard(d);
            cards.put(d, c);
            if (!first) row.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 12), 1));
            row.addView(c.build(), Ui.weight());
            first = false;
        }
        col.addView(row);
        Anim.stagger(row, 150, 140);
        col.addView(Ui.hint(this, "Совет: удерживайте обложку, чтобы вернуть стандартную."), Ui.matchWrap(this, 4));

        LinearLayout rt = Ui.card(this, "▌ Рантайм Box64 · Wine · DXVK · Turnip");
        runtimeStatus = Ui.column(this);
        rt.addView(runtimeStatus);
        rt.addView(Ui.ghostButton(this, "⬇  Импорт rootfs.tar.gz", v -> pickRuntime()));
        col.addView(rt, Ui.matchWrap(this, 10));
        return col;
    }

    private void launch(GameDef d) {
        prefs.edit().putString(Prefs.LAST_GAME, d.id).apply();
        open(new Intent(this, GameActivity.class).putExtra(GameActivity.EXTRA_GAME, d.id));
    }

    private File coverFile(GameDef d) { return new File(new File(getFilesDir(), "covers"), d.id); }

    // ───────────────────────── правая колонка ─────────────────────────

    private View buildRight() {
        LinearLayout col = Ui.column(this);

        LinearLayout gfx = Ui.card(this, "▌ Графика");
        String[] qVals = {"auto", "low", "medium", "high"};
        String[] qNames = {"Авто — " + qualityName(DeviceProfile.autoQuality(this)), "Низкое · 720p", "Среднее · 900p", "Высокое · 1080p"};
        gfx.addView(spinner(qNames, qVals, Prefs.QUALITY, "auto"), new LinearLayout.LayoutParams(-1, Ui.dp(this, 44)));
        gfx.addView(Ui.slider(this, "Масштаб разрешения, %", 50, 100, prefs.getInt(Prefs.RES_SCALE, 100),
                v -> prefs.edit().putInt(Prefs.RES_SCALE, v).apply()));
        gfx.addView(Ui.hint(this, "🔒 Лок 60 FPS включён всегда: выше 60 ломается физика движка."));
        gfx.addView(check("Счётчик FPS (DXVK HUD)", Prefs.SHOW_HUD, false));
        gfx.addView(Ui.ghostButton(this, "⚙  Тонкая настройка графики", v -> open(new Intent(this, GraphicsActivity.class))), Ui.matchWrap(this, 4));
        col.addView(gfx);

        LinearLayout ctl = Ui.card(this, "▌ Управление");
        ctl.addView(Ui.hint(this, "Экранные кнопки"));
        ctl.addView(spinner(new String[]{"Авто — скрывать при геймпаде", "Всегда показывать", "Полностью выключены"},
                new String[]{"auto", "on", "off"}, Prefs.OVERLAY_MODE, "auto"), new LinearLayout.LayoutParams(-1, Ui.dp(this, 44)));
        LinearLayout ctlBtns = Ui.row(this);
        ctlBtns.addView(Ui.ghostButton(this, "✋ Кнопки", v -> open(new Intent(this, ControlsEditorActivity.class))), Ui.weight());
        ctlBtns.addView(Ui.ghostButton(this, "🎮 Геймпад", v -> GamepadEditor.show(this)), Ui.weight());
        ctl.addView(ctlBtns, Ui.matchWrap(this, 4));
        col.addView(ctl, Ui.matchWrap(this, 12));

        LinearLayout stab = Ui.card(this, "▌ Стабильность");
        stab.addView(check("Сразу запускать последнюю игру", Prefs.AUTOSTART, true));
        stab.addView(check("Патч памяти 4 ГБ (LAA)", Prefs.LAA, true));
        stab.addView(check("Запуск через FOSE / NVSE, если есть", Prefs.USE_FOSE, true));
        stab.addView(check("Автосохранения", Prefs.AUTOSAVE, true));
        stab.addView(check("Пропуск вступительных роликов", Prefs.SKIP_INTRO, true));
        stab.addView(check("Сторож зависаний", Prefs.WATCHDOG, true));
        stab.addView(check("Только «большие» ядра CPU", Prefs.PIN_BIG_CORES, true));
        col.addView(stab, Ui.matchWrap(this, 12));

        LinearLayout look = Ui.card(this, "▌ Оформление");
        LinearLayout lb = Ui.row(this);
        lb.addView(Ui.ghostButton(this, "🖼 Фон заставки", v -> pickSplash()), Ui.weight());
        lb.addView(Ui.ghostButton(this, "Сбросить", v -> {
            //noinspection ResultOfMethodCallIgnored
            WastelandBackdrop.customFile(this).delete();
            Toast.makeText(this, "Стандартный фон заставки", Toast.LENGTH_SHORT).show();
        }), Ui.weight());
        look.addView(lb);
        col.addView(look, Ui.matchWrap(this, 12));
        Anim.stagger(col, 250, 110);
        return col;
    }

    private Spinner spinner(String[] names, String[] vals, String key, String def) {
        Spinner sp = new Spinner(this, Spinner.MODE_DROPDOWN);
        sp.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, names) {
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
                t.setTextSize(13);
                return t;
            }
        });
        sp.setPopupBackgroundDrawable(Ui.rounded(Ui.BG2, Ui.LINE, 10, this));
        sp.setBackground(Ui.rounded(Color.argb(30, 138, 255, 128), Ui.FG_DIM, 10, this));
        sp.setSelection(Math.max(0, Arrays.asList(vals).indexOf(prefs.getString(key, def))));
        sp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> a, View v, int pos, long id) { prefs.edit().putString(key, vals[pos]).apply(); }
            @Override public void onNothingSelected(AdapterView<?> a) {}
        });
        return sp;
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
        if (headerTitle != null) loops.add(Anim.flicker(headerTitle));
    }

    @Override
    protected void onPause() {
        for (android.animation.Animator a : loops) a.cancel();
        loops.clear();
        for (GameCard c : cards.values()) { c.pulse = null; c.play.setScaleX(1f); c.play.setScaleY(1f); }
        if (headerTitle != null) headerTitle.setAlpha(1f);
        super.onPause();
    }

    private void ensureStoragePermission() {
        // Wine работает с обычными путями файловой системы, поэтому нужен «доступ ко всем файлам».
        boolean granted;
        try {
            granted = Environment.isExternalStorageManager();
        } catch (RuntimeException e) {
            granted = false; // нестандартные прошивки/хранилища: просто предложим выдать доступ
        }
        if (granted) return;
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

    private void pickCover() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("image/*");
        startActivityForResult(i, REQ_COVER);
    }

    private void pickSplash() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("image/*");
        startActivityForResult(i, REQ_SPLASH);
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
            prefs.edit().putString(pendingGame.dirKey(), dir.getPath()).apply();
            refresh();
        } else if (req == REQ_SPLASH) {
            try (InputStream in = getContentResolver().openInputStream(uri);
                 java.io.OutputStream out = new java.io.FileOutputStream(WastelandBackdrop.customFile(this))) {
                com.wastelanddroid.util.Files2.copy(in, out);
                Toast.makeText(this, "Фон заставки обновлён", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Не удалось загрузить фон: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        } else if (req == REQ_COVER) {
            File dst = coverFile(pendingGame);
            dst.getParentFile().mkdirs();
            try (InputStream in = getContentResolver().openInputStream(uri);
                 java.io.OutputStream out = new java.io.FileOutputStream(dst)) {
                com.wastelanddroid.util.Files2.copy(in, out);
            } catch (Exception e) {
                Toast.makeText(this, "Не удалось загрузить обложку: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
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
        String miss = new RuntimeManager(this).missingComponent();
        runtimeStatus.removeAllViews();
        runtimeStatus.addView(miss == null
                ? status("✔", "Рантайм установлен", Ui.FG)
                : status("✖", "Не установлен (нет " + miss + ")", Ui.RED));

        for (GameCard c : cards.values()) {
            GameDef d = c.def;
            c.cover.set(d.title, d.accent, d.dark, coverFile(d));
            c.status.removeAllViews();
            String path = d.gameDir(this);
            boolean ok = false;
            if (path == null) {
                c.path.setText("Папка не выбрана");
                c.status.addView(status("›", "Укажите папку с " + d.exe + " и Data", Ui.FG_DIM));
            } else {
                c.path.setText(path);
                GameFiles.Report r = GameFiles.validate(d, new File(path));
                if (r.ok()) c.status.addView(status("✔", "Файлы в порядке", Ui.FG));
                if (!r.dlcs.isEmpty()) c.status.addView(status("◆", "DLC: " + r.dlcs.size(), Ui.FG));
                for (String e : r.errors) c.status.addView(status("✖", e, Ui.RED));
                for (String w : r.warnings) c.status.addView(status("⚠", w, Ui.AMBER));
                ok = r.ok();
            }
            c.cover.setSelectedCard(ok && miss == null);
            c.play.setEnabled(ok && miss == null);
            c.play.setText(c.play.isEnabled() ? "▶  ИГРАТЬ" : "не готово");
            if (c.pulse != null) { c.pulse.cancel(); loops.remove(c.pulse); c.pulse = null; c.play.setScaleX(1f); c.play.setScaleY(1f); }
            if (c.play.isEnabled()) { c.pulse = Anim.pulse(c.play); loops.add(c.pulse); }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
