package com.wastelanddroid;

import com.droiddeck.launcher.R;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.droiddeck.launcher.runtime.LinuxRuntimeInstaller;
import com.wastelanddroid.engine.FalloutEngine;
import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;
import com.wastelanddroid.util.WastelandBackdrop;

import java.io.File;

/**
 * Первый запуск: по шагам выдаёт разрешения, снимает ограничения Android, сам ставит Linux-среду
 * и Proton и спрашивает папки игр. Слева — список шагов с отметками, справа — текущий шаг.
 */
public final class OnboardingActivity extends Activity {
    private static final int REQ_GAME_DIR = 21;
    private static final int REQ_NOTIFY = 22;

    private static final String[] TITLES = {"Добро пожаловать", "Разрешения", "Фоновая работа", "Linux-среда", "Proton", "Графика", "Игры"};

    private LinearLayout steps;
    private LinearLayout body;
    private LinearLayout footerBox;
    private com.droiddeck.launcher.FdDriverSetup drivers;
    private final android.os.Handler poll = new android.os.Handler(android.os.Looper.getMainLooper());
    private int step;
    private boolean working;
    private String workStage;
    private int workPercent = -1;
    private String error;
    private GameDef pendingGame = GameDef.FO3;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());
        WastelandBackdrop bg = new WastelandBackdrop(this);
        frame.addView(bg, new FrameLayout.LayoutParams(-1, -1));
        View shade = new View(this);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{Color.argb(240, 8, 10, 9), Color.argb(215, 8, 10, 9), Color.argb(170, 8, 10, 9)}));
        frame.addView(shade, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout page = Ui.row(this);
        page.setGravity(Gravity.TOP);
        int pad = Ui.dp(this, 24);
        page.setPadding(pad, Ui.dp(this, 18), pad, Ui.dp(this, 18));

        LinearLayout left = Ui.column(this);
        TextView brand = new TextView(this);
        brand.setText("FALLOUT DROID");
        brand.setTextColor(Ui.FG);
        brand.setTypeface(Ui.mono(true));
        brand.setTextSize(20);
        brand.setLetterSpacing(0.08f);
        left.addView(brand);
        TextView sub = Ui.hint(this, "ПОДГОТОВКА К ПЕРВОМУ ЗАПУСКУ");
        sub.setTextColor(Ui.AMBER);
        sub.setLetterSpacing(0.15f);
        sub.setPadding(0, 0, 0, Ui.dp(this, 16));
        left.addView(sub);
        steps = Ui.column(this);
        left.addView(steps);
        page.addView(left, new LinearLayout.LayoutParams(Ui.dp(this, 240), -1));

        LinearLayout card = Ui.column(this);
        card.setBackground(Ui.rounded(Ui.CARD, Ui.LINE, 18, this));
        int bp = Ui.dp(this, 24);
        card.setPadding(bp, bp, bp, Ui.dp(this, 16));
        body = Ui.column(this);
        ScrollView sc = new ScrollView(this);
        sc.setVerticalScrollBarEnabled(false);
        sc.addView(body);
        card.addView(sc, new LinearLayout.LayoutParams(-1, 0, 1f));
        footerBox = Ui.row(this);
        footerBox.setGravity(Gravity.CENTER_VERTICAL);
        card.addView(footerBox, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(0, -1, 1f);
        blp.leftMargin = Ui.dp(this, 22);
        page.addView(card, blp);

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        step = b != null ? b.getInt("step", 0) : 0;
        if (b == null && Prefs.get(this).getBoolean(MainActivity.ONBOARDED, false)) {
            // повторный вход (из настроек или с главного экрана) — сразу к первому незавершённому шагу
            step = TITLES.length - 1;
            for (int i = 1; i < TITLES.length; i++) if (!done(i)) { step = i; break; }
        }
        Anim.enterFromTop(left, 0);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("step", step);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render(false);
        autoAdvance();
    }

    // ───────────── состояние шагов ─────────────

    private boolean filesGranted() {
        try { return Environment.isExternalStorageManager(); } catch (RuntimeException e) { return false; }
    }

    private boolean notifyGranted() {
        return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean batteryFree() {
        PowerManager pm = getSystemService(PowerManager.class);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    private boolean done(int i) {
        switch (i) {
            case 0: return step > 0;
            case 1: return filesGranted();
            case 2: return !FalloutEngine.childLimitBlocks(this);
            case 3: return FalloutEngine.runtimeInstalled(this);
            case 4: return FalloutEngine.runtimeInstalled(this) && FalloutEngine.anyProton(this);
            case 5: return driverReady();
            default: return anyGameReady();
        }
    }

    private boolean anyGameReady() {
        for (GameDef d : GameDef.values()) {
            String p = d.gameDir(this);
            if (p != null && GameFiles.validate(d, new File(p)).ok()) return true;
        }
        return false;
    }

    // ───────────── отрисовка ─────────────

    private void render(boolean animate) {
        steps.removeAllViews();
        for (int i = 0; i < TITLES.length; i++) {
            boolean ok = done(i) && i != step;
            boolean cur = i == step;
            LinearLayout row = Ui.row(this);
            row.setPadding(0, Ui.dp(this, 7), 0, Ui.dp(this, 7));
            TextView num = new TextView(this);
            num.setGravity(Gravity.CENTER);
            num.setTypeface(Ui.mono(true));
            num.setTextSize(12);
            if (ok) {
                num.setBackground(oval(Ui.FG, 0));
                num.setCompoundDrawablesRelative(Ui.icon(this, R.drawable.ic_check, Ui.ON_ACCENT, 14), null, null, null);
                num.setPadding(Ui.dp(this, 6), 0, 0, 0);
            } else {
                num.setText(String.valueOf(i + 1));
                num.setTextColor(cur ? Ui.ON_ACCENT : Ui.TEXT_DIM);
                num.setBackground(oval(cur ? Ui.FG : Color.TRANSPARENT, cur ? 0 : Ui.LINE));
            }
            int s = Ui.dp(this, 26);
            row.addView(num, new LinearLayout.LayoutParams(s, s));
            TextView t = Ui.label(this, TITLES[i]);
            t.setTextColor(cur ? Ui.FG : ok ? Ui.TEXT : Ui.TEXT_DIM);
            t.setTypeface(Ui.mono(cur));
            t.setPadding(Ui.dp(this, 12), 0, 0, 0);
            row.addView(t);
            steps.addView(row);
        }

        body.removeAllViews();
        footerBox.removeAllViews();
        switch (step) {
            case 0: welcome(); break;
            case 1: permissions(); break;
            case 2: background(); break;
            case 3: runtime(); break;
            case 4: proton(); break;
            case 5: graphics(); break;
            default: games();
        }
        if (animate) {
            body.setAlpha(0f);
            body.setTranslationX(Ui.dp(this, 20));
            body.animate().alpha(1f).translationX(0).setDuration(260).setInterpolator(Anim.EMPHASIZED).start();
        }
    }

    private GradientDrawable oval(int fill, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(fill);
        if (stroke != 0) d.setStroke(Ui.dp(this, 1), stroke);
        return d;
    }

    private void heading(String title, String text) {
        TextView t = new TextView(this);
        t.setText(title);
        t.setTextColor(Ui.FG);
        t.setTypeface(Ui.mono(true));
        t.setTextSize(24);
        body.addView(t);
        TextView d = Ui.label(this, text);
        d.setTextColor(Ui.TEXT_DIM);
        d.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 14));
        body.addView(d);
    }

    private void status(boolean ok, String text) {
        int color = ok ? Ui.FG : Ui.AMBER;
        TextView t = Ui.label(this, text);
        t.setTextColor(color);
        t.setPadding(0, Ui.dp(this, 6), 0, Ui.dp(this, 6));
        Ui.withIcon(t, ok ? R.drawable.ic_check : R.drawable.ic_warning, color);
        body.addView(t);
    }

    /** Нижняя панель: «Назад» и основная кнопка. */
    private void footer(String primary, int icon, boolean enabled, View.OnClickListener l) {
        footerBox.removeAllViews();
        footerBox.setPadding(0, Ui.dp(this, 12), 0, 0);
        if (step > 0) {
            android.widget.Button back = Ui.ghostButton(this, "Назад", v -> go(step - 1));
            back.setMinHeight(Ui.dp(this, 48));
            footerBox.addView(back, new LinearLayout.LayoutParams(-2, Ui.dp(this, 52)));
        }
        footerBox.addView(new View(this), Ui.weight());
        Button b = Ui.button(this, icon, primary, l);
        b.setEnabled(enabled);
        b.setMinHeight(Ui.dp(this, 48));
        b.setMinWidth(Ui.dp(this, 220));
        footerBox.addView(b, new LinearLayout.LayoutParams(-2, Ui.dp(this, 52)));
    }

    private void go(int s) {
        error = null;
        step = Math.max(0, Math.min(TITLES.length - 1, s));
        render(true);
        autoAdvance();
    }

    /** Шаги, где делать нечего, проходятся сами; установка запускается без лишних нажатий. */
    private void autoAdvance() {
        if (working) return;
        if (step == 3 && !FalloutEngine.runtimeInstalled(this) && error == null) installRuntime();
        else if (step == 4 && FalloutEngine.runtimeInstalled(this) && !FalloutEngine.anyProton(this) && error == null) installProton();
        else if (step == 5 && !driverReady() && error == null) installDriver(false);
    }

    // ───────────── шаги ─────────────

    private void welcome() {
        heading("Пустошь ждёт", "Fallout 3 и New Vegas с ПК — прямо на телефоне. Подготовка займёт несколько минут и "
                + "нужна только один раз: выдадим разрешения, установим Linux-среду с Proton и найдём ваши игры.");
        status(true, "Нужно: около 4 ГБ свободного места и Wi-Fi");
        status(true, "Файлы игр — ваша копия с ПК (папка с exe и Data)");
        footer("Начать", R.drawable.ic_play, true, v -> go(1));
    }

    private void permissions() {
        heading("Разрешения", "Игра читает файлы прямо из папки на телефоне, а уведомление держит её в работе, пока вы в меню Android.");
        boolean files = filesGranted();
        status(files, files ? "Доступ ко всем файлам выдан" : "Нужен доступ ко всем файлам");
        if (!files) body.addView(Ui.button(this, R.drawable.ic_folder, "Выдать доступ к файлам", v -> {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
        }));
        boolean notify = notifyGranted();
        status(notify, notify ? "Уведомления разрешены" : "Разрешите уведомления");
        if (!notify) body.addView(Ui.ghostButton(this, R.drawable.ic_info, "Разрешить уведомления", v -> requestNotify()));
        footer(files ? "Далее" : "Сначала выдайте доступ", R.drawable.ic_play, files, v -> go(2));
    }

    private void requestNotify() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                return;
            } catch (Exception ignored) { }
        }
        try {
            startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
        } catch (Exception ignored) { }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] p, int[] r) {
        super.onRequestPermissionsResult(req, p, r);
        if (req == REQ_NOTIFY && !notifyGranted()) requestNotifyViaSettings();
        render(false);
    }

    private void requestNotifyViaSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
        } catch (Exception ignored) { }
    }

    @SuppressWarnings("BatteryLife")
    private void background() {
        heading("Фоновая работа", "Игра — это несколько процессов. Android может их завершать, и тогда игру выбивает на рабочий стол.");
        boolean child = !FalloutEngine.childLimitBlocks(this);
        if (!FalloutEngine.childLimitApplies(this)) status(true, "На этой версии Android ограничения дочерних процессов нет");
        else status(child, child ? "Ограничение дочерних процессов отключено" : "Отключите ограничение дочерних процессов");
        if (!child) {
            if (FalloutEngine.hasDeveloperToggle()) {
                body.addView(Ui.hint(this, "1. Настройки > О телефоне > 7 раз нажмите \"Номер сборки\".\n"
                        + "2. Настройки > Для разработчиков > \"Отключить ограничения дочерних процессов\".\n"
                        + "3. Вернитесь сюда — шаг отметится сам. На некоторых прошивках настройка сбрасывается после перезагрузки."));
                body.addView(Ui.button(this, R.drawable.ic_settings, "Открыть параметры разработчика", v -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS));
                        Toast.makeText(this, "Сначала включите режим разработчика: 7 нажатий на \"Номер сборки\"", Toast.LENGTH_LONG).show();
                    }
                }));
            } else {
                body.addView(Ui.hint(this, "Переключателя на этой версии нет. Выполните с компьютера по ADB:\n" + FalloutEngine.adbCommand()));
            }
        }
        boolean battery = batteryFree();
        status(battery, battery ? "Оптимизация батареи не мешает" : "Рекомендуется: разрешить работу без ограничений батареи");
        if (!battery) body.addView(Ui.ghostButton(this, R.drawable.ic_lock, "Снять ограничение батареи", v -> {
            try {
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
            } catch (Exception e) {
                try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) { }
            }
        }));
        footer(child ? "Далее" : "Пропустить", R.drawable.ic_play, true, v -> go(3));
    }

    private ProgressBar progress(int percent) {
        ProgressBar p = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        p.setIndeterminate(percent < 0);
        p.setMax(100);
        if (percent >= 0) p.setProgress(percent);
        p.setProgressTintList(ColorStateList.valueOf(Ui.FG));
        p.setIndeterminateTintList(ColorStateList.valueOf(Ui.FG));
        p.setProgressBackgroundTintList(ColorStateList.valueOf(Ui.LINE));
        LinearLayout.LayoutParams lp = Ui.matchWrap(this, 10);
        p.setLayoutParams(lp);
        return p;
    }

    private void errorBox() {
        if (error == null) return;
        TextView t = Ui.label(this, error);
        t.setTextColor(Ui.RED);
        t.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
        Ui.withIcon(t, R.drawable.ic_cross, Ui.RED);
        body.addView(t);
    }

    private void runtime() {
        heading("Linux-среда", "Ubuntu для ARM64 с эмулятором x86 FEX, драйвером Turnip и звуком PulseAudio. "
                + "Загрузка около 300 МБ, на диске около 3 ГБ.");
        boolean ok = FalloutEngine.runtimeInstalled(this);
        if (working) {
            status(false, workStage == null ? "Подготовка..." : workStage);
            body.addView(progress(workPercent));
            body.addView(Ui.hint(this, "Не закрывайте приложение. Можно свернуть — установка продолжится."));
        } else if (ok) {
            status(true, "Linux-среда установлена");
        } else {
            errorBox();
            body.addView(Ui.button(this, R.drawable.ic_download, error == null ? "Установить" : "Повторить", v -> { error = null; installRuntime(); }));
        }
        footer(ok ? "Далее" : "Установка...", R.drawable.ic_play, ok && !working, v -> go(4));
    }

    private void proton() {
        heading("Proton", "Слой совместимости с Windows: Wine, DXVK (DirectX 9 через Vulkan) и всё нужное для игр. "
                + "Работает без Steam и без аккаунта, около 300 МБ.");
        boolean rt = FalloutEngine.runtimeInstalled(this);
        boolean ok = rt && FalloutEngine.anyProton(this);
        if (!rt) {
            status(false, "Сначала установите Linux-среду");
        } else if (working) {
            status(false, workStage == null ? "Загрузка Proton..." : workStage);
            body.addView(progress(workPercent));
        } else if (ok) {
            String arm = FalloutEngine.armProtonInstalled(this);
            status(true, arm != null ? FalloutEngine.protonLabel(arm) + " установлен" : "Proton установлен");
        } else {
            errorBox();
            body.addView(Ui.button(this, R.drawable.ic_download, error == null ? "Установить Proton" : "Повторить", v -> { error = null; installProton(); }));
        }
        footer(ok ? "Далее" : "Установка...", R.drawable.ic_play, ok && !working, v -> go(5));
    }

    private com.droiddeck.launcher.FdDriverSetup drivers() {
        if (drivers == null) drivers = new com.droiddeck.launcher.FdDriverSetup(this);
        return drivers;
    }

    private boolean driverReady() {
        try {
            return !drivers().applies() || com.droiddeck.launcher.FdDriverSetup.chosen(this)
                    || (step != 5 && Prefs.get(this).getBoolean("driver_skipped", false));
        } catch (Throwable t) {
            return true;
        }
    }

    private void graphics() {
        heading("Графический драйвер", "Драйвер Vulkan под ваш GPU: через него картинка игры попадает на экран. "
                + "Встроенный драйвер подходит не всем новым Adreno, поэтому подбираем рекомендованный и скачиваем (около 30 МБ).");
        boolean ok = driverReady();
        if (working) {
            String st = drivers().status();
            status(false, st == null || st.isEmpty() ? "Подбор драйвера..." : st);
            body.addView(progress(drivers().percent()));
        } else if (ok) {
            String name = null;
            try { drivers().ready(); name = drivers().activeName(); } catch (Throwable ignored) { }
            status(true, name != null ? "Драйвер: " + name : "Драйвер подобран");
        } else {
            errorBox();
            body.addView(Ui.button(this, R.drawable.ic_download, error == null ? "Подобрать драйвер" : "Повторить", v -> { error = null; installDriver(true); }));
            body.addView(Ui.hint(this, "Без интернета можно пропустить — тогда используется встроенный драйвер."));
        }
        footer(ok ? "Далее" : "Пропустить", R.drawable.ic_play, !working, v -> {
            Prefs.get(this).edit().putBoolean("driver_skipped", !driverReady()).apply();
            go(6);
        });
    }

    private void installDriver(boolean force) {
        if (working) return;
        working = true;
        try {
            drivers().start(force);
        } catch (Throwable t) {
            working = false;
            error = "Не удалось подобрать драйвер: " + t.getMessage();
            render(false);
            return;
        }
        render(false);
        final long started = System.currentTimeMillis();
        poll.postDelayed(new Runnable() {
            @Override public void run() {
                if (isDestroyed()) return;
                boolean busy = drivers().busy();
                boolean ok = driverReady();
                if (busy && System.currentTimeMillis() - started < 10 * 60_000) {
                    if (step == 5) render(false);
                    poll.postDelayed(this, 500);
                    return;
                }
                if (!busy && !ok && System.currentTimeMillis() - started < 3000) { poll.postDelayed(this, 500); return; }
                working = false;
                if (ok) { if (step == 5) go(6); return; }
                String st = drivers().status();
                error = st == null || st.isEmpty() ? "Драйвер не скачался. Проверьте интернет." : st;
                render(false);
            }
        }, 600);
    }

    private void games() {
        heading("Ваши игры", "Укажите папку каждой игры — ту, где лежат exe-файл и папка Data. Можно указать одну игру, вторую добавите позже.");
        for (GameDef d : GameDef.values()) {
            String p = d.gameDir(this);
            GameFiles.Report r = p == null ? null : GameFiles.validate(d, new File(p));
            LinearLayout row = Ui.row(this);
            row.setBackground(Ui.rounded(Ui.tint(14), Ui.LINE, 12, this));
            row.setPadding(Ui.dp(this, 14), Ui.dp(this, 10), Ui.dp(this, 10), Ui.dp(this, 10));
            LinearLayout col = Ui.column(this);
            TextView name = Ui.label(this, d.title);
            name.setTypeface(Ui.mono(true));
            col.addView(name);
            String st = p == null ? "Папка не выбрана" : r.ok() ? "Готово" + (r.dlcs.isEmpty() ? "" : " | DLC: " + r.dlcs.size()) : r.errors.get(0);
            TextView s = Ui.hint(this, st);
            s.setTextColor(p == null ? Ui.TEXT_DIM : r.ok() ? Ui.FG : Ui.RED);
            col.addView(s);
            row.addView(col, Ui.weight());
            row.addView(Ui.ghostButton(this, R.drawable.ic_folder, p == null ? "Выбрать" : "Сменить", v -> {
                pendingGame = d;
                startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_GAME_DIR);
            }));
            LinearLayout.LayoutParams lp = Ui.matchWrap(this, 8);
            body.addView(row, lp);
        }
        boolean ready = anyGameReady() && FalloutEngine.ready(this);
        footer(ready ? "В пустошь!" : "Готово", R.drawable.ic_play, true, v -> finishOnboarding());
    }

    private void finishOnboarding() {
        Prefs.get(this).edit().putBoolean(MainActivity.ONBOARDED, true).apply();
        finish();
    }

    // ───────────── установка ─────────────

    private void installRuntime() {
        if (working) return;
        working = true;
        workStage = "Получение сведений о версии...";
        workPercent = -1;
        render(false);
        new Thread(() -> {
            String err = null;
            try {
                LinuxRuntimeInstaller.Release release = FalloutEngine.fetchRuntime();
                if (release == null) {
                    err = "Сервер недоступен. Проверьте интернет и нажмите \"Повторить\".";
                } else {
                    boolean ok = FalloutEngine.installRuntime(this, release, (stage, percent) -> runOnUiThread(() -> {
                        workStage = stage + (percent >= 0 ? " | " + percent + "%" : "");
                        workPercent = percent;
                        if (!isDestroyed() && step == 3) render(false);
                    }));
                    if (!ok) err = "Установка не завершилась. Нужно около 4 ГБ свободного места и стабильный интернет.";
                }
            } catch (Exception e) {
                err = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            String fe = err;
            runOnUiThread(() -> {
                working = false;
                error = fe;
                if (isDestroyed()) return;
                if (fe == null && step == 3) go(4); else render(false);
            });
        }, "fd-runtime-install").start();
    }

    private void installProton() {
        if (working) return;
        working = true;
        workStage = "Загрузка Proton...";
        workPercent = -1;
        render(false);
        new Thread(() -> {
            String err;
            try {
                err = FalloutEngine.installArmProton(this, (stage, percent) -> runOnUiThread(() -> {
                    workStage = stage;
                    workPercent = percent;
                    if (!isDestroyed() && step == 4) render(false);
                }));
            } catch (Exception e) {
                err = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            String fe = err;
            runOnUiThread(() -> {
                working = false;
                error = fe;
                if (isDestroyed()) return;
                if (fe == null && step == 4) go(5); else render(false);
            });
        }, "fd-proton-install").start();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_GAME_DIR && res == RESULT_OK && data != null && data.getData() != null) {
            File dir = GameFiles.treeUriToFile(data.getData());
            Prefs.get(this).edit().putString(pendingGame.dirKey(), dir.getPath()).apply();
        }
        render(false);
    }

    @Override
    public void onBackPressed() {
        if (step > 0 && !working) go(step - 1);
        else if (Prefs.get(this).getBoolean(MainActivity.ONBOARDED, false) || FalloutEngine.ready(this)) finishOnboarding();
        else moveTaskToBack(true);
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
