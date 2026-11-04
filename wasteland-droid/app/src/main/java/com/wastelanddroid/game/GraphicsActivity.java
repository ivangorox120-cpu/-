package com.wastelanddroid.game;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Toast;

import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;

/** Тонкая настройка графики (вместо лаунчера игры с ПК). Общие настройки для Fallout 3 и New Vegas. */
public final class GraphicsActivity extends Activity {
    private GraphicsSettings g;
    private DeviceProfile.Quality base;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        String qs = Prefs.get(this).getString(Prefs.QUALITY, "auto");
        base = "auto".equals(qs) ? DeviceProfile.autoQuality(this) : DeviceProfile.Quality.valueOf(qs.toUpperCase());
        g = GraphicsSettings.load(this, base);
        build();
    }

    private void build() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());
        LinearLayout page = Ui.column(this);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 12), pad, Ui.dp(this, 12));

        LinearLayout header = Ui.row(this);
        android.widget.TextView title = Ui.label(this, "НАСТРОЙКИ ГРАФИКИ");
        title.setTextSize(20);
        title.setTypeface(Ui.mono(true));
        header.addView(title, Ui.weight());
        header.addView(Ui.ghostButton(this, "Низкие", v -> preset(DeviceProfile.Quality.LOW)));
        header.addView(Ui.ghostButton(this, "Средние", v -> preset(DeviceProfile.Quality.MEDIUM)));
        header.addView(Ui.ghostButton(this, "Высокие", v -> preset(DeviceProfile.Quality.HIGH)));
        header.addView(Ui.button(this, "Сохранить", v -> { g.save(this); Toast.makeText(this, "Сохранено", Toast.LENGTH_SHORT).show(); finish(); }));
        page.addView(header);

        LinearLayout cols = Ui.row(this);
        cols.setGravity(Gravity.TOP);

        LinearLayout left = Ui.column(this);
        LinearLayout tex = Ui.card(this, "Текстуры и фильтрация");
        tex.addView(Ui.slider(this, "Качество текстур (0 — высокое, 2 — низкое)", 0, 2, g.textureQuality, v -> g.textureQuality = v));
        tex.addView(Ui.slider(this, "Анизотропная фильтрация", 1, 16, g.anisotropy, v -> g.anisotropy = v));
        tex.addView(Ui.slider(this, "Поле зрения (FOV)", 60, 100, g.fov, v -> g.fov = v));
        left.addView(tex);
        LinearLayout light = Ui.card(this, "Свет и тени");
        light.addView(Ui.slider(this, "Тени (0 — выкл, 3 — высокие)", 0, 3, g.shadows, v -> g.shadows = v));
        light.addView(check("Тени от деревьев (дорого)", g.treeShadows, v -> g.treeShadows = v));
        light.addView(check("HDR (иначе — Bloom)", g.hdr, v -> g.hdr = v));
        light.addView(check("Bloom", g.bloom, v -> g.bloom = v));
        left.addView(light, Ui.matchWrap(this, 10));
        cols.addView(scroll(left), new LinearLayout.LayoutParams(0, -1, 1f));
        cols.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 14), 1));

        LinearLayout right = Ui.column(this);
        LinearLayout dist = Ui.card(this, "Дальность");
        dist.addView(Ui.slider(this, "Дальность ландшафта и объектов", 1, 10, g.viewDistance, v -> g.viewDistance = v));
        dist.addView(Ui.slider(this, "Прорисовка персонажей и предметов", 1, 10, g.fade, v -> g.fade = v));
        dist.addView(Ui.slider(this, "Трава (0 — выкл)", 0, 3, g.grassDensity, v -> g.grassDensity = v));
        right.addView(dist);
        LinearLayout fx = Ui.card(this, "Эффекты");
        fx.addView(check("Отражения в воде (самое дорогое)", g.waterReflections, v -> g.waterReflections = v));
        fx.addView(check("Следы от пуль и крови (декали)", g.decals, v -> g.decals = v));
        fx.addView(Ui.hint(this, "Размер мира (uGridsToLoad) зафиксирован на 5: большие значения вызывают вылеты."));
        right.addView(fx, Ui.matchWrap(this, 10));
        cols.addView(scroll(right), new LinearLayout.LayoutParams(0, -1, 1f));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1f);
        lp.topMargin = Ui.dp(this, 10);
        page.addView(cols, lp);
        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
    }

    private interface BoolCb { void on(boolean v); }

    private CheckBox check(String text, boolean val, BoolCb cb) {
        CheckBox c = Ui.check(this, text, val);
        c.setOnCheckedChangeListener((v, on) -> cb.on(on));
        return c;
    }

    private ScrollView scroll(View v) {
        ScrollView s = new ScrollView(this);
        s.setVerticalScrollBarEnabled(false);
        s.addView(v);
        return s;
    }

    private void preset(DeviceProfile.Quality q) {
        g = GraphicsSettings.preset(q);
        build();
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
