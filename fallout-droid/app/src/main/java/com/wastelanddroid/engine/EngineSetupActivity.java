package com.wastelanddroid.engine;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.droiddeck.launcher.R;
import com.droiddeck.launcher.runtime.LinuxRuntimeInstaller;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;

/**
 * Подготовка к игре — три шага в стиле Fallout Droid, без экранов движка:
 * 1) ограничение дочерних процессов Android; 2) Linux-среда; 3) Proton.
 */
public final class EngineSetupActivity extends Activity {
    private LinearLayout stepChild, stepRuntime, stepProton;
    private Button finish;
    private boolean runtimeWorking, protonWorking;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());

        LinearLayout page = Ui.column(this);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 12), pad, Ui.dp(this, 12));

        LinearLayout header = Ui.row(this);
        TextView title = Ui.label(this, "ПОДГОТОВКА К ИГРЕ");
        title.setTextSize(22);
        title.setTypeface(Ui.mono(true));
        header.addView(title, Ui.weight());
        finish = Ui.button(this, R.drawable.ic_play, "В меню", v -> finish());
        header.addView(finish);
        page.addView(header);
        page.addView(Ui.hint(this, "Нужно один раз: после этих шагов кнопка \"Играть\" сразу запускает игру."));

        LinearLayout cols = Ui.row(this);
        cols.setGravity(Gravity.TOP);
        stepChild = Ui.card(this, "Шаг 1 | Дочерние процессы");
        stepRuntime = Ui.card(this, "Шаг 2 | Linux-среда");
        stepProton = Ui.card(this, "Шаг 3 | Proton");
        for (LinearLayout c : new LinearLayout[]{stepChild, stepRuntime, stepProton}) {
            ScrollView s = new ScrollView(this);
            s.setVerticalScrollBarEnabled(false);
            s.addView(c);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -1, 1f);
            lp.setMargins(Ui.dp(this, 6), 0, Ui.dp(this, 6), 0);
            cols.addView(s, lp);
        }
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-1, 0, 1f);
        clp.topMargin = Ui.dp(this, 10);
        page.addView(cols, clp);

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        Anim.enterFromTop(header, 0);
        Anim.stagger(cols, 120, 120);
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
    }

    // ───────────── отрисовка шагов ─────────────

    private void render() {
        renderChild();
        if (!runtimeWorking) renderRuntime(null, -1);
        if (!protonWorking) renderProton(null, -1);
        boolean ready = FalloutEngine.ready(this);
        finish.setText(ready ? "Готово — в меню" : "В меню");
    }

    private TextView status(LinearLayout card, boolean ok, String text) {
        TextView t = Ui.label(this, text);
        t.setTextColor(ok ? Ui.FG : Ui.AMBER);
        Ui.withIcon(t, ok ? R.drawable.ic_check : R.drawable.ic_warning, ok ? Ui.FG : Ui.AMBER);
        card.addView(t);
        return t;
    }

    private void clear(LinearLayout card) {
        while (card.getChildCount() > 1) card.removeViewAt(1); // заголовок карточки остаётся
    }

    private void renderChild() {
        clear(stepChild);
        if (!FalloutEngine.childLimitApplies(this)) {
            status(stepChild, true, "На этой версии Android ограничения нет");
            return;
        }
        if (!FalloutEngine.childLimitBlocks(this)) {
            status(stepChild, true, "Ограничение отключено");
            return;
        }
        status(stepChild, false, "Android завершает фоновые процессы игры — её будет выбивать");
        if (FalloutEngine.hasDeveloperToggle()) {
            stepChild.addView(Ui.hint(this,
                    "1. Настройки > О телефоне > 7 раз нажмите \"Номер сборки\" — включится режим разработчика.\n"
                            + "2. Настройки > Для разработчиков > включите \"Отключить ограничения дочерних процессов\" "
                            + "(Disable child process restrictions).\n3. Вернитесь сюда."));
            stepChild.addView(Ui.button(this, R.drawable.ic_settings, "Открыть параметры разработчика", v -> openDeveloperOptions()));
        } else {
            stepChild.addView(Ui.hint(this, "На этой версии Android переключателя нет. Выполните с компьютера по ADB:\n"
                    + FalloutEngine.adbCommand()));
        }
        stepChild.addView(Ui.ghostButton(this, R.drawable.ic_restore, "Проверить снова", v -> render()));
    }

    private void openDeveloperOptions() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS));
            Toast.makeText(this, "Сначала включите режим разработчика: 7 нажатий на \"Номер сборки\"", Toast.LENGTH_LONG).show();
        }
    }

    private void renderRuntime(String stage, int percent) {
        clear(stepRuntime);
        if (runtimeWorking) {
            status(stepRuntime, false, stage == null ? "Подготовка..." : stage);
            stepRuntime.addView(progress(percent));
            stepRuntime.addView(Ui.hint(this, "Не закрывайте приложение. Загрузка около 300 МБ, на диске займёт около 3 ГБ."));
            return;
        }
        if (FalloutEngine.runtimeInstalled(this)) {
            status(stepRuntime, true, "Linux-среда установлена");
            return;
        }
        status(stepRuntime, false, "Не установлена");
        stepRuntime.addView(Ui.hint(this, "Ubuntu для ARM64 с FEX: на ней работают Proton и игра. "
                + "Загрузка около 300 МБ, на диске около 3 ГБ. Нужен Wi-Fi."));
        stepRuntime.addView(Ui.button(this, R.drawable.ic_download, "Установить Linux-среду", v -> installRuntime()));
    }

    private ProgressBar progress(int percent) {
        ProgressBar p = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        p.setIndeterminate(percent < 0);
        p.setMax(100);
        if (percent >= 0) p.setProgress(percent);
        p.setProgressTintList(ColorStateList.valueOf(Ui.FG));
        p.setIndeterminateTintList(ColorStateList.valueOf(Ui.FG));
        p.setProgressBackgroundTintList(ColorStateList.valueOf(Ui.LINE));
        p.setLayoutParams(Ui.matchWrap(this, 6));
        return p;
    }

    private void installRuntime() {
        if (runtimeWorking) return;
        runtimeWorking = true;
        renderRuntime("Получение сведений о версии...", -1);
        new Thread(() -> {
            String error = null;
            try {
                LinuxRuntimeInstaller.Release release = FalloutEngine.fetchRuntime();
                if (release == null) {
                    error = "Сервер с Linux-средой недоступен. Проверьте интернет и попробуйте снова.";
                } else {
                    boolean ok = FalloutEngine.installRuntime(this, release, (stage, percent) ->
                            runOnUiThread(() -> { if (!isDestroyed()) renderRuntime(stage + (percent >= 0 ? " | " + percent + "%" : ""), percent); }));
                    if (!ok) error = "Установка не завершилась. Проверьте свободное место (нужно около 4 ГБ) и интернет.";
                }
            } catch (Exception e) {
                error = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            String fe = error;
            runOnUiThread(() -> {
                runtimeWorking = false;
                if (isDestroyed()) return;
                render();
                if (fe != null) {
                    TextView t = Ui.label(this, fe);
                    t.setTextColor(Ui.RED);
                    stepRuntime.addView(t, 1);
                }
            });
        }, "fd-runtime-install").start();
    }

    private void renderProton(String stage, int percent) {
        clear(stepProton);
        if (protonWorking) {
            status(stepProton, false, stage == null ? "Подготовка..." : stage);
            stepProton.addView(progress(percent));
            return;
        }
        boolean runtime = FalloutEngine.runtimeInstalled(this);
        com.droiddeck.launcher.session.ComponentsManager.Proton exp = runtime ? FalloutEngine.protonExperimental(this) : null;
        String ge = runtime ? FalloutEngine.geInstalled(this) : null;
        if (exp != null) status(stepProton, true, "Proton Experimental установлен — будет использоваться он");
        else if (ge != null) status(stepProton, true, ge + " установлен");
        else status(stepProton, false, runtime ? "Proton не скачан (будет Proton движка)" : "Сначала установите Linux-среду");
        if (!runtime) return;

        if (exp == null) {
            stepProton.addView(Ui.hint(this, "Proton Experimental — сборка Valve, скачать её можно только через Steam: "
                    + "войдите один раз, откройте Библиотека > Инструменты > Proton Experimental > Установить, затем выйдите."));
            stepProton.addView(Ui.ghostButton(this, R.drawable.ic_gamepad, "Войти в Steam (для Proton Experimental)",
                    v -> FalloutEngine.openSteamForProton(this)));
        }
        if (ge == null) {
            stepProton.addView(Ui.hint(this, "Без Steam: GE-Proton для ARM64 — быстрый, ставится сразу."));
            stepProton.addView(Ui.button(this, R.drawable.ic_download, "Скачать GE-Proton", v -> installGe()));
        }
    }

    private void installGe() {
        if (protonWorking) return;
        protonWorking = true;
        renderProton("Загрузка GE-Proton...", -1);
        new Thread(() -> {
            String error;
            try {
                error = FalloutEngine.installGe(this, (stage, percent) ->
                        runOnUiThread(() -> { if (!isDestroyed()) renderProton(stage, percent); }));
            } catch (Exception e) {
                error = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            String fe = error;
            runOnUiThread(() -> {
                protonWorking = false;
                if (isDestroyed()) return;
                render();
                if (fe != null) {
                    TextView t = Ui.label(this, fe);
                    t.setTextColor(Ui.RED);
                    stepProton.addView(t, 1);
                }
            });
        }, "fd-proton-install").start();
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
