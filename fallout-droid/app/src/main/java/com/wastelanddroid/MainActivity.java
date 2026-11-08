package com.wastelanddroid;

import com.droiddeck.launcher.R;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.engine.FalloutEngine;
import com.wastelanddroid.game.DeviceProfile;
import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.CoverView;
import com.wastelanddroid.util.Links;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;
import com.wastelanddroid.util.WastelandBackdrop;

import java.io.File;

/**
 * Главный экран: две большие обложки — Fallout 3 и New Vegas, под каждой «Играть» и шестерёнка
 * настроек. Всё остальное живёт в разделах настроек ({@link SettingsActivity}).
 */
public final class MainActivity extends Activity {
    public static final String EXTRA_AUTOSTART = "autostart";
    public static final String ONBOARDED = "onboarded_v2";
    private static final int REQ_GAME_DIR = 1;

    private SharedPreferences prefs;
    private TextView headerTitle;
    private WastelandBackdrop backdrop;
    private TextView engineChip;
    private final java.util.List<android.animation.Animator> loops = new java.util.ArrayList<>();
    private final java.util.Map<GameDef, GameCard> cards = new java.util.EnumMap<>(GameDef.class);
    private GameDef pendingGame = GameDef.FO3;
    private boolean launching;
    private String appliedAccent;

    /** Карточка игры: обложка во всю высоту, строка статуса, «Играть» и шестерёнка. */
    private final class GameCard {
        final GameDef def;
        final CoverView cover = new CoverView(MainActivity.this);
        final TextView status = new TextView(MainActivity.this);
        final Button play;
        final ImageView gear = new ImageView(MainActivity.this);
        android.animation.Animator pulse;
        boolean ready;

        GameCard(GameDef d) {
            def = d;
            play = Ui.button(MainActivity.this, R.drawable.ic_play, "ИГРАТЬ", v -> onPlay(def));
            play.setTextSize(19);
            play.setLetterSpacing(0.18f);
        }

        View build() {
            LinearLayout card = Ui.column(MainActivity.this);
            card.addView(cover, new LinearLayout.LayoutParams(-1, 0, 1f));
            cover.setTagline(def == GameDef.FO3 ? "Столичная пустошь | 2277" : "Мохаве | 2281");
            cover.setOnClickListener(v -> onPlay(def));

            status.setTypeface(Ui.mono(false));
            status.setTextSize(12);
            status.setSingleLine(true);
            status.setEllipsize(android.text.TextUtils.TruncateAt.END);
            status.setPadding(Ui.dp(MainActivity.this, 4), Ui.dp(MainActivity.this, 8), 0, Ui.dp(MainActivity.this, 6));
            card.addView(status);

            LinearLayout row = Ui.row(MainActivity.this);
            LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(0, Ui.dp(MainActivity.this, 56), 1f);
            plp.setMargins(0, 0, Ui.dp(MainActivity.this, 10), 0);
            play.setMinHeight(0);
            row.addView(play, plp);
            gear.setImageDrawable(Ui.icon(MainActivity.this, R.drawable.ic_settings, Ui.FG, 26));
            gear.setScaleType(ImageView.ScaleType.CENTER);
            gear.setBackground(new android.graphics.drawable.RippleDrawable(
                    android.content.res.ColorStateList.valueOf(Ui.tint(70)),
                    Ui.rounded(Ui.tint(22), Ui.FG_DIM, 12, MainActivity.this), null));
            gear.setContentDescription("Настройки " + def.title);
            gear.setOnClickListener(v -> openSettings(def));
            Anim.pressable(gear);
            int s = Ui.dp(MainActivity.this, 56);
            row.addView(gear, new LinearLayout.LayoutParams(s, s));
            card.addView(row);
            return card;
        }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        prefs = Prefs.get(this);
        appliedAccent = Ui.accent(this);

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());
        backdrop = new WastelandBackdrop(this);
        frame.addView(backdrop, new FrameLayout.LayoutParams(-1, -1));
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.argb(200, 8, 10, 9), Color.argb(120, 8, 10, 9), Color.argb(225, 8, 10, 9)}));
        frame.addView(shade, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout page = Ui.column(this);
        int pad = Ui.dp(this, 22);
        page.setPadding(pad, Ui.dp(this, 14), pad, Ui.dp(this, 16));
        View header = buildHeader();
        page.addView(header);

        LinearLayout row = Ui.row(this);
        row.setGravity(Gravity.TOP);
        boolean first = true;
        for (GameDef d : GameDef.values()) {
            GameCard c = new GameCard(d);
            cards.put(d, c);
            if (!first) row.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 20), 1));
            row.addView(c.build(), new LinearLayout.LayoutParams(0, -1, 1f));
            first = false;
        }
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-1, 0, 1f);
        rlp.topMargin = Ui.dp(this, 14);
        page.addView(row, rlp);

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        Anim.enterFromTop(header, 0);
        Anim.stagger(row, 140, 140);

        if (!prefs.getBoolean(ONBOARDED, false) && FalloutEngine.ready(this) && anyGameChosen()) {
            prefs.edit().putBoolean(ONBOARDED, true).apply(); // обновление со старой версии: всё уже готово
        }
        if (!prefs.getBoolean(ONBOARDED, false)) {
            frame.post(() -> open(new Intent(this, OnboardingActivity.class)));
            return;
        }
        String crash = com.wastelanddroid.util.CrashLog.takeUnseen(this);
        boolean notice = prefs.getBoolean(Prefs.CRASH_NOTICE, false);
        prefs.edit().putBoolean(Prefs.CRASH_NOTICE, false).apply();
        if (crash != null) frame.post(() -> showCrash(crash));
        else if (notice) frame.post(this::offerSessionLogs);
        String auto = crash == null ? getIntent().getStringExtra(EXTRA_AUTOSTART) : null;
        if (auto != null) frame.post(() -> startGame(GameDef.byId(auto)));
    }

    /** Adreno без скачанного рекомендованного драйвера: встроенный может не вывести картинку. */
    private boolean needsDriver() {
        if (prefs.getBoolean("driver_skipped", false)) return false;
        try {
            return new com.droiddeck.launcher.FdDriverSetup(this).applies()
                    && !com.droiddeck.launcher.FdDriverSetup.chosen(this);
        } catch (Throwable t) {
            return false;
        }
    }

    private boolean anyGameChosen() {
        for (GameDef d : GameDef.values()) if (d.gameDir(this) != null) return true;
        return false;
    }

    private void open(Intent i) {
        startActivity(i);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    private void openSettings(GameDef d) {
        Intent i = new Intent(this, SettingsActivity.class);
        if (d != null) i.putExtra(SettingsActivity.EXTRA_GAME, d.id);
        open(i);
    }

    // ───────────────────────── шапка ─────────────────────────

    private View buildHeader() {
        LinearLayout header = Ui.row(this);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.fd_logo);
        logo.setClipToOutline(true);
        logo.setBackground(Ui.rounded(Color.TRANSPARENT, 0, 12, this));
        int ls = Ui.dp(this, 44);
        header.addView(logo, new LinearLayout.LayoutParams(ls, ls));

        LinearLayout titles = Ui.column(this);
        titles.setPadding(Ui.dp(this, 12), 0, 0, 0);
        TextView title = new TextView(this);
        title.setText("FALLOUT DROID");
        title.setTextColor(Ui.FG);
        title.setTextSize(22);
        title.setTypeface(Ui.mono(true));
        title.setLetterSpacing(0.08f);
        title.setShadowLayer(Ui.dp(this, 12), 0, 0, Ui.tint(110));
        titles.addView(title);
        headerTitle = title;
        TextView by = Ui.hint(this, "BY ROMMY  |  v" + versionName());
        by.setTextColor(Ui.AMBER);
        by.setLetterSpacing(0.2f);
        by.setPadding(0, 0, 0, 0);
        titles.addView(by);
        header.addView(titles, Ui.weight());

        engineChip = new TextView(this);
        engineChip.setTypeface(Ui.mono(true));
        engineChip.setTextSize(12);
        engineChip.setTextColor(Ui.AMBER);
        engineChip.setGravity(Gravity.CENTER_VERTICAL);
        engineChip.setPadding(Ui.dp(this, 12), Ui.dp(this, 8), Ui.dp(this, 14), Ui.dp(this, 8));
        engineChip.setBackground(Ui.rounded(Color.argb(40, Color.red(Ui.AMBER), Color.green(Ui.AMBER), Color.blue(Ui.AMBER)), Ui.AMBER, 20, this));
        engineChip.setOnClickListener(v -> open(new Intent(this, OnboardingActivity.class)));
        LinearLayout.LayoutParams elp = new LinearLayout.LayoutParams(-2, -2);
        elp.setMargins(0, 0, Ui.dp(this, 10), 0);
        header.addView(engineChip, elp);

        LinearLayout tg = Ui.row(this);
        tg.setBackground(Ui.rounded(Color.argb(45, 42, 171, 238), Color.argb(160, 42, 171, 238), 22, this));
        int p = Ui.dp(this, 6);
        tg.setPadding(p, p, Ui.dp(this, 14), p);
        ImageView plane = new ImageView(this);
        plane.setImageDrawable(Ui.icon(this, R.drawable.ic_telegram, Color.WHITE, 16));
        plane.setScaleType(ImageView.ScaleType.CENTER);
        plane.setBackground(Ui.rounded(Ui.TG, 0, 15, this));
        int s = Ui.dp(this, 30);
        tg.addView(plane, new LinearLayout.LayoutParams(s, s));
        TextView t1 = Ui.label(this, "Telegram");
        t1.setTextColor(Color.WHITE);
        t1.setTypeface(Ui.mono(true));
        t1.setPadding(Ui.dp(this, 8), 0, 0, 0);
        tg.addView(t1);
        tg.setOnClickListener(v -> Links.openTelegram(this));
        Anim.pressable(tg);
        header.addView(tg);

        ImageView gear = new ImageView(this);
        gear.setImageDrawable(Ui.icon(this, R.drawable.ic_settings, Ui.FG, 22));
        gear.setScaleType(ImageView.ScaleType.CENTER);
        gear.setBackground(Ui.rounded(Ui.tint(22), Ui.FG_DIM, 21, this));
        gear.setContentDescription("Настройки");
        gear.setOnClickListener(v -> openSettings(null));
        Anim.pressable(gear);
        int gs = Ui.dp(this, 42);
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(gs, gs);
        glp.setMargins(Ui.dp(this, 10), 0, 0, 0);
        header.addView(gear, glp);
        return header;
    }

    // ───────────────────────── запуск ─────────────────────────

    private void onPlay(GameDef d) {
        GameCard c = cards.get(d);
        if (d.gameDir(this) == null) { pendingGame = d; pickGameDir(); return; }
        if (c != null && !c.ready) { openSettings(d); return; }
        prefs.edit().putString(Prefs.LAST_GAME, d.id).apply();
        startGame(d);
    }

    /** Подготовка игры (ini, реестр, моды, сейвы) и запуск через движок Proton. */
    private void startGame(GameDef d) {
        if (launching) return;
        String dir = d.gameDir(this);
        if (dir == null) { Toast.makeText(this, "Сначала выберите папку игры", Toast.LENGTH_SHORT).show(); return; }
        if (!FalloutEngine.ready(this)) {
            Toast.makeText(this, "Сначала завершите подготовку — это нужно один раз", Toast.LENGTH_LONG).show();
            open(new Intent(this, OnboardingActivity.class));
            return;
        }
        if (needsDriver()) {
            Toast.makeText(this, "Нужен графический драйвер под ваш GPU — без него не будет картинки", Toast.LENGTH_LONG).show();
            open(new Intent(this, OnboardingActivity.class));
            return;
        }
        launching = true;
        File exe = com.wastelanddroid.util.Files2.findCaseInsensitive(new File(dir), d.exe);
        File fse = com.wastelanddroid.util.Files2.findCaseInsensitive(new File(dir), d.scriptExtender);
        if (fse != null && prefs.getBoolean(Prefs.USE_FOSE, true)) exe = fse;
        File target = exe;
        Toast.makeText(this, "Подготовка " + d.title + "...", Toast.LENGTH_SHORT).show();
        prefs.edit().putBoolean(Prefs.LAUNCH_PENDING, true).commit();
        new Thread(() -> {
            FalloutEngine.Prepared r;
            try {
                if (prefs.getBoolean(Prefs.LAA, true)) com.wastelanddroid.game.ExePatcher.applyLargeAddressAware(
                        com.wastelanddroid.util.Files2.findCaseInsensitive(new File(dir), d.exe));
                com.wastelanddroid.mods.ModManager mm = new com.wastelanddroid.mods.ModManager(this, d, new File(dir));
                mm.saveOrder(mm.loadPlugins());
                r = FalloutEngine.prepare(this, target, d.folder, d.folder);
                if (r instanceof FalloutEngine.Prepared.Ok) prepareGamePrefix(d, new File(dir), ((FalloutEngine.Prepared.Ok) r).getScope());
            } catch (Throwable e) {
                com.wastelanddroid.util.CrashLog.write(this, "prepare", e);
                r = new FalloutEngine.Prepared.Error(e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            FalloutEngine.Prepared fr = r;
            runOnUiThread(() -> {
                launching = false;
                if (fr instanceof FalloutEngine.Prepared.Ok) {
                    try {
                        FalloutEngine.launch(this, (FalloutEngine.Prepared.Ok) fr);
                    } catch (Throwable e) {
                        com.wastelanddroid.util.CrashLog.write(this, "launch", e);
                        prefs.edit().putBoolean(Prefs.LAUNCH_PENDING, false).apply();
                        showCrash(android.util.Log.getStackTraceString(e));
                    }
                } else {
                    prefs.edit().putBoolean(Prefs.LAUNCH_PENDING, false).apply();
                    new AlertDialog.Builder(this).setTitle("Не удалось запустить")
                            .setMessage(((FalloutEngine.Prepared.Error) fr).getMessage())
                            .setPositiveButton("OK", null).show();
                }
            });
        }, "fd-prepare").start();
    }

    /**
     * Подготовка префикса Proton перед запуском.
     *
     * Главное — ini в «Мои документы\My Games»: если их нет, исполняемый файл игры не стартует
     * сам, а открывает оригинальный лаунчер Bethesda (именно это давало «бесконечную загрузку»).
     * Поэтому ini пишутся всегда, даже до того как Proton создал префикс: Proton при создании
     * лишь добавляет свои файлы и не трогает чужие. Ключи реестра дописываются, когда реестр уже есть.
     */
    private void prepareGamePrefix(GameDef d, File gameDir, String scope) {
        prefs.edit().putString("scope_" + d.id, scope).apply();
        String overlay = prefs.getString(Prefs.OVERLAY_MODE, "auto");
        com.wastelanddroid.controls.PcLayout.installIfEmpty(this);
        FalloutEngine.applyPcControls(this, overlay);
        FalloutEngine.setGameDebugLogs(this, prefs.getBoolean(Prefs.GAME_LOGS, true));
        File pfx = FalloutEngine.prefixDir(this, scope);
        File backups = new com.wastelanddroid.runtime.RuntimeManager(this).backups;
        if (com.wastelanddroid.game.ProtonPrefix.isBroken(pfx)) {
            com.wastelanddroid.game.ProtonPrefix.recreate(d, pfx, backups);
            runOnUiThread(() -> Toast.makeText(this, "Префикс Wine был повреждён — создаю заново", Toast.LENGTH_LONG).show());
        }
        boolean ready = FalloutEngine.prefixReady(this, scope);
        if (!ready) prefs.edit().putBoolean("first_run_" + d.id, true).apply();
        String guest = FalloutEngine.guestPath(this, gameDir);
        if (ready) try {
            if (guest != null && prefs.getBoolean(Prefs.FIX_REGISTRY, true)) {
                com.wastelanddroid.game.ProtonPrefix.writeRegistry(pfx, d, guest);
            }
        } catch (Exception e) {
            com.wastelanddroid.util.CrashLog.write(this, "registry", e);
        }
        try {
            String qs = prefs.getString(Prefs.QUALITY, "auto");
            DeviceProfile.Quality q = "auto".equals(qs) ? DeviceProfile.autoQuality(this) : DeviceProfile.Quality.valueOf(qs.toUpperCase());
            DeviceProfile profile = DeviceProfile.create(this, q, prefs.getInt(Prefs.RES_SCALE, 100));
            com.wastelanddroid.game.IniTweaks.apply(d, gameDir, pfx, profile,
                    com.wastelanddroid.game.GraphicsSettings.load(this, q),
                    prefs.getBoolean(Prefs.SKIP_INTRO, true), prefs.getBoolean(Prefs.AUTOSAVE, true),
                    prefs.getBoolean(Prefs.GAMEPAD, false));
        } catch (Exception e) {
            com.wastelanddroid.util.CrashLog.write(this, "ini", e);
        }
        if (ready) try {
            com.wastelanddroid.game.SaveBackup.backup(d, pfx, backups);
        } catch (Exception ignored) { }
    }

    /** Вылет без Java-отчёта (в нативной части движка): предлагаем отправить логи сессии. */
    private void offerSessionLogs() {
        new AlertDialog.Builder(this)
                .setTitle("Игра завершилась раньше времени")
                .setMessage("Автозапуск отключён. Отправьте логи последнего запуска — по ним видно причину. "
                        + "Логи всегда доступны в Настройки > Логи.")
                .setPositiveButton("Отправить логи", (d, w) -> SettingsActivity.shareLastLogs(this))
                .setNegativeButton("Закрыть", null)
                .show();
    }

    private void showCrash(String text) {
        new AlertDialog.Builder(this)
                .setTitle("Прошлый запуск завершился ошибкой")
                .setMessage("Автозапуск отключён до следующего успешного запуска.\n\n"
                        + (text.length() > 1500 ? text.substring(0, 1500) + "..." : text))
                .setPositiveButton("Отправить отчёт", (d, w) -> {
                    Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_SUBJECT, "Fallout Droid: отчёт о вылете")
                            .putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(send, "Отправить отчёт"));
                })
                .setNegativeButton("Закрыть", null)
                .show();
    }

    private String versionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    // ───────────────────────── жизненный цикл ─────────────────────────

    @Override
    protected void onResume() {
        super.onResume();
        if (!appliedAccent.equals(Ui.accent(this))) { recreate(); return; }
        if (!launching && prefs.getBoolean(Prefs.LAUNCH_PENDING, false)) {
            prefs.edit().putBoolean(Prefs.LAUNCH_PENDING, false).putBoolean(Prefs.AUTOSTART_BLOCKED, false).apply();
        }
        refresh();
        if (headerTitle != null) loops.add(Anim.flicker(headerTitle));
        if (backdrop != null) {
            android.animation.ObjectAnimator z = android.animation.ObjectAnimator.ofFloat(backdrop, "zoom", 1.0f, 1.08f);
            z.setDuration(20000);
            z.setRepeatMode(android.animation.ValueAnimator.REVERSE);
            z.setRepeatCount(android.animation.ValueAnimator.INFINITE);
            z.setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator());
            z.start();
            loops.add(z);
        }
    }

    @Override
    protected void onPause() {
        for (android.animation.Animator a : loops) a.cancel();
        loops.clear();
        for (GameCard c : cards.values()) { c.pulse = null; c.play.setScaleX(1f); c.play.setScaleY(1f); }
        if (headerTitle != null) headerTitle.setAlpha(1f);
        super.onPause();
    }

    private void pickGameDir() {
        Toast.makeText(this, "Выберите папку " + pendingGame.title + " — ту, где лежат " + pendingGame.exe + " и Data", Toast.LENGTH_LONG).show();
        startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_GAME_DIR);
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
        }
    }

    private void refresh() {
        boolean engineReady = FalloutEngine.ready(this);
        engineChip.setVisibility(engineReady ? View.GONE : View.VISIBLE);
        engineChip.setText("Завершить подготовку");
        Ui.withIcon(engineChip, R.drawable.ic_warning, Ui.AMBER);

        for (GameCard c : cards.values()) {
            GameDef d = c.def;
            c.cover.set(d.title, d.accent, d.dark, SettingsActivity.coverFile(this, d));
            String path = d.gameDir(this);
            int color;
            int icon;
            String text;
            boolean ok = false;
            if (path == null) {
                text = "Папка игры не выбрана";
                color = Ui.TEXT_DIM;
                icon = R.drawable.ic_folder;
            } else {
                GameFiles.Report r = GameFiles.validate(d, new File(path));
                ok = r.ok();
                if (!ok) {
                    text = r.errors.isEmpty() ? "Проверьте файлы игры" : r.errors.get(0);
                    color = Ui.RED;
                    icon = R.drawable.ic_cross;
                } else {
                    text = "Готово к игре" + (r.dlcs.isEmpty() ? "" : "  |  DLC: " + r.dlcs.size());
                    color = Ui.FG;
                    icon = R.drawable.ic_check;
                }
            }
            c.ready = ok;
            c.status.setText(text);
            c.status.setTextColor(color);
            Ui.withIcon(c.status, icon, color);
            c.cover.setSelectedCard(ok);
            c.play.setText(path == null ? "ВЫБРАТЬ ПАПКУ" : ok ? "ИГРАТЬ" : "ИСПРАВИТЬ");
            Ui.withIcon(c.play, path == null ? R.drawable.ic_folder : ok ? R.drawable.ic_play : R.drawable.ic_settings, Ui.ON_ACCENT);
            if (c.pulse != null) { c.pulse.cancel(); loops.remove(c.pulse); c.pulse = null; c.play.setScaleX(1f); c.play.setScaleY(1f); }
            if (ok && engineReady) { c.pulse = Anim.pulse(c.play); loops.add(c.pulse); }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
