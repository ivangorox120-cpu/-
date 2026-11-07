package com.wastelanddroid.engine;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.droiddeck.launcher.R;
import com.droiddeck.launcher.core.FexPreset;
import com.droiddeck.launcher.gpu.TurnipDriver;
import com.droiddeck.launcher.session.SessionPrefs;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;

import java.util.ArrayList;
import java.util.List;

/**
 * Настройка контейнера в оформлении Fallout Droid: графический драйвер, режим эмуляции x86 (FEX),
 * звук и совместимость. Это те же параметры, что у движка, но без его интерфейса.
 */
public final class ContainerActivity extends Activity {
    private LinearLayout page;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);

        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());
        page = Ui.column(this);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 12), pad, Ui.dp(this, 12));

        LinearLayout header = Ui.row(this);
        TextView title = Ui.label(this, "КОНТЕЙНЕР");
        title.setTextSize(22);
        title.setTypeface(Ui.mono(true));
        header.addView(title, Ui.weight());
        header.addView(Ui.button(this, R.drawable.ic_check, "Готово", v -> finish()));
        page.addView(header);
        page.addView(Ui.hint(this, "Настройки окружения, в котором работает игра. Меняются до запуска."));

        LinearLayout cols = Ui.row(this);
        cols.setGravity(Gravity.TOP);
        cols.addView(scroll(buildLeft()), new LinearLayout.LayoutParams(0, -1, 1f));
        cols.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 14), 1));
        cols.addView(scroll(buildRight()), new LinearLayout.LayoutParams(0, -1, 1f));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1f);
        lp.topMargin = Ui.dp(this, 10);
        page.addView(cols, lp);

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        Anim.enterFromTop(header, 0);
    }

    private ScrollView scroll(View v) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.addView(v);
        return s;
    }

    // ───────────── графика и эмуляция ─────────────

    private View buildLeft() {
        LinearLayout col = Ui.column(this);

        LinearLayout gpu = Ui.card(this, "Графический драйвер");
        List<String> ids = new ArrayList<>();
        List<String> names = new ArrayList<>();
        ids.add(TurnipDriver.AUTO);
        names.add("Авто (по вашему Adreno)");
        for (String id : TurnipDriver.BUNDLED) {
            ids.add(id);
            names.add(pretty(id));
        }
        ids.add("system");
        names.add("Системный драйвер Android");
        gpu.addView(choice(names, ids, SessionPrefs.INSTANCE.androidDriver(this),
                v -> SessionPrefs.INSTANCE.setAndroidDriver(this, "system".equals(v) ? "system" : v)));
        gpu.addView(Ui.hint(this, "Turnip — открытый драйвер Vulkan для Adreno, с ним игра идёт быстрее. "
                + "Если экран чёрный или игра не стартует, попробуйте системный драйвер."));
        col.addView(gpu);

        LinearLayout fex = Ui.card(this, "Эмуляция x86 (FEX)");
        List<String> fexIds = new ArrayList<>();
        List<String> fexNames = new ArrayList<>();
        for (FexPreset.Preset p : FexPreset.INSTANCE.getAll()) {
            fexIds.add(p.getId());
            fexNames.add(getString(p.getLabel()));
        }
        fex.addView(choice(fexNames, fexIds, SessionPrefs.INSTANCE.fexPreset(this), v -> SessionPrefs.INSTANCE.setFexPreset(this, v)));
        fex.addView(Ui.hint(this, "Так код игры переводится с x86 на ARM. «Стабильность» — медленнее, но реже вылеты; "
                + "«Производительность» — быстрее. Для Fallout обычно подходит средний вариант."));
        CheckBox ssbs = Ui.check(this, "Принудительный SSBS (обход ошибок памяти)", SessionPrefs.INSTANCE.forceSsbs(this));
        ssbs.setOnCheckedChangeListener((v, on) -> SessionPrefs.INSTANCE.setForceSsbs(this, on));
        fex.addView(ssbs);
        col.addView(fex, Ui.matchWrap(this, 12));
        return col;
    }

    // ───────────── звук и обслуживание ─────────────

    private View buildRight() {
        LinearLayout col = Ui.column(this);

        LinearLayout audio = Ui.card(this, "Звук");
        CheckBox direct = Ui.check(this, "Прямой звук (меньше задержка)", SessionPrefs.INSTANCE.directAudio(this));
        direct.setOnCheckedChangeListener((v, on) -> SessionPrefs.INSTANCE.setDirectAudio(this, on));
        audio.addView(direct);
        audio.addView(Ui.hint(this, "Выключите, если звука нет: тогда звук идёт обычным PulseAudio."));
        col.addView(audio);

        LinearLayout env = Ui.card(this, "Окружение Windows");
        env.addView(Ui.hint(this, "Proton, DXVK и Wine входят в контейнер и обновляются вместе с ним. "
                + "Версия Proton выбирается в «Подготовке к игре»."));
        col.addView(env, Ui.matchWrap(this, 12));

        LinearLayout care = Ui.card(this, "Обслуживание");
        care.addView(Ui.ghostButton(this, R.drawable.ic_upload, "Логи последнего запуска", v -> shareLogs()));
        care.addView(Ui.hint(this, "Пригодится, если игра не запускается: в архиве видно, на чём всё остановилось."));
        col.addView(care, Ui.matchWrap(this, 12));
        return col;
    }

    private static String pretty(String id) {
        return id.replace("turnip", "Turnip ").replace("-a6xx", " (Adreno 6xx)")
                .replace("-sdk36", " (новые Adreno)").replace("-quest1", " (Quest)").replace("-quest2", " (Quest 2)");
    }

    /** Список-переключатель в нашем стиле: выбранный пункт залит, остальные контурные. */
    private View choice(List<String> names, List<String> values, String current, java.util.function.Consumer<String> onPick) {
        LinearLayout box = Ui.column(this);
        for (int i = 0; i < names.size(); i++) {
            String value = values.get(i);
            boolean on = value.equals(current);
            android.widget.Button bt = on ? Ui.button(this, names.get(i), null) : Ui.ghostButton(this, names.get(i), null);
            bt.setTextSize(12);
            bt.setOnClickListener(v -> {
                onPick.accept(value);
                Toast.makeText(this, "Применится при следующем запуске", Toast.LENGTH_SHORT).show();
                recreate();
            });
            box.addView(bt, Ui.matchWrap(this, 2));
        }
        return box;
    }

    private void shareLogs() {
        Toast.makeText(this, "Собираю логи...", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            java.io.File zip = FalloutEngine.lastSessionLogs(this);
            runOnUiThread(() -> {
                if (zip == null) { Toast.makeText(this, "Логов пока нет", Toast.LENGTH_LONG).show(); return; }
                startActivity(android.content.Intent.createChooser(FalloutEngine.shareLogsIntent(this, zip), "Отправить логи"));
            });
        }, "fd-logs").start();
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
