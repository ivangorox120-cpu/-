package com.wastelanddroid;

import com.droiddeck.launcher.R;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import com.wastelanddroid.controls.ControlsEditorActivity;
import com.wastelanddroid.engine.ContainerActivity;
import com.wastelanddroid.engine.FalloutEngine;
import com.wastelanddroid.game.DeviceProfile;
import com.wastelanddroid.game.GameDef;
import com.wastelanddroid.game.GameFiles;
import com.wastelanddroid.game.GraphicsActivity;
import com.wastelanddroid.mods.ModManagerActivity;
import com.wastelanddroid.saves.SavesActivity;
import com.wastelanddroid.util.Anim;
import com.wastelanddroid.util.Links;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.ScanlineView;
import com.wastelanddroid.util.Ui;
import com.wastelanddroid.util.WastelandBackdrop;

import java.io.File;
import java.io.InputStream;
import java.util.Arrays;

/** Все настройки по разделам: слева список разделов, справа содержимое выбранного. */
public final class SettingsActivity extends Activity {
    public static final String EXTRA_GAME = "game";
    public static final String EXTRA_SECTION = "section";
    private static final int REQ_GAME_DIR = 11;
    private static final int REQ_COVER = 12;
    private static final int REQ_SPLASH = 13;

    private static final String[] SECTIONS = {"Игры", "Графика", "Управление", "Запуск", "Звук", "Движок", "Оформление", "Логи", "О приложении"};
    private static final int[] ICONS = {R.drawable.ic_play, R.drawable.ic_display, R.drawable.ic_touch, R.drawable.ic_lock,
            R.drawable.ic_radiation, R.drawable.ic_settings, R.drawable.ic_image, R.drawable.ic_upload, R.drawable.ic_info};

    private SharedPreferences prefs;
    private LinearLayout rail;
    private LinearLayout content;
    private ScrollView contentScroll;
    private int section;
    private GameDef game = GameDef.FO3;

    public static File coverFile(Context c, GameDef d) { return new File(new File(c.getFilesDir(), "covers"), d.id); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        prefs = Prefs.get(this);
        String g = getIntent().getStringExtra(EXTRA_GAME);
        if (g != null) game = GameDef.byId(g);
        section = b != null ? b.getInt("section", 0) : getIntent().getIntExtra(EXTRA_SECTION, 0);
        if (b != null && b.getString("game") != null) game = GameDef.byId(b.getString("game"));
        build();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("section", section);
        out.putString("game", game.id);
    }

    private void build() {
        FrameLayout frame = new FrameLayout(this);
        frame.setBackground(Ui.screenBackground());

        LinearLayout page = Ui.row(this);
        page.setGravity(Gravity.TOP);
        int pad = Ui.dp(this, 20);
        page.setPadding(pad, Ui.dp(this, 14), pad, Ui.dp(this, 14));

        // Левая колонка: назад + разделы
        LinearLayout left = Ui.column(this);
        LinearLayout top = Ui.row(this);
        ImageView back = new ImageView(this);
        back.setImageDrawable(Ui.icon(this, R.drawable.ic_arrow_up, Ui.FG, 20));
        back.setRotation(-90);
        back.setScaleType(ImageView.ScaleType.CENTER);
        back.setBackground(Ui.rounded(Ui.tint(22), Ui.FG_DIM, 19, this));
        back.setOnClickListener(v -> finish());
        back.setContentDescription("Назад");
        Anim.pressable(back);
        int bs = Ui.dp(this, 38);
        top.addView(back, new LinearLayout.LayoutParams(bs, bs));
        TextView title = new TextView(this);
        title.setText("НАСТРОЙКИ");
        title.setTextColor(Ui.FG);
        title.setTypeface(Ui.mono(true));
        title.setTextSize(19);
        title.setLetterSpacing(0.12f);
        title.setPadding(Ui.dp(this, 12), 0, 0, 0);
        top.addView(title);
        left.addView(top);

        rail = Ui.column(this);
        ScrollView railScroll = new ScrollView(this);
        railScroll.setVerticalScrollBarEnabled(false);
        railScroll.addView(rail);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(-1, 0, 1f);
        rlp.topMargin = Ui.dp(this, 12);
        left.addView(railScroll, rlp);
        page.addView(left, new LinearLayout.LayoutParams(Ui.dp(this, 210), -1));

        View divider = new View(this);
        divider.setBackgroundColor(Ui.LINE);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(Ui.dp(this, 1), -1);
        dlp.setMargins(Ui.dp(this, 14), 0, Ui.dp(this, 18), 0);
        page.addView(divider, dlp);

        content = Ui.column(this);
        contentScroll = new ScrollView(this);
        contentScroll.setVerticalScrollBarEnabled(false);
        contentScroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        contentScroll.addView(content);
        page.addView(contentScroll, new LinearLayout.LayoutParams(0, -1, 1f));

        frame.addView(page, new FrameLayout.LayoutParams(-1, -1));
        frame.addView(new ScanlineView(this), new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        renderRail();
        renderSection(false);
        Anim.enterFromTop(top, 0);
    }

    private void renderRail() {
        rail.removeAllViews();
        for (int i = 0; i < SECTIONS.length; i++) {
            final int idx = i;
            boolean on = i == section;
            TextView t = new TextView(this);
            t.setText(SECTIONS[i]);
            t.setTypeface(Ui.mono(on));
            t.setTextSize(14);
            t.setTextColor(on ? Ui.ON_ACCENT : Ui.TEXT);
            t.setGravity(Gravity.CENTER_VERTICAL);
            t.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 10), 0);
            t.setBackground(on ? Ui.rounded(Ui.FG, 0, 10, this)
                    : new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(Ui.tint(60)), null, Ui.rounded(Color.WHITE, 0, 10, this)));
            t.setCompoundDrawablesRelative(Ui.icon(this, ICONS[i], on ? Ui.ON_ACCENT : Ui.FG_DIM, 18), null, null, null);
            t.setCompoundDrawablePadding(Ui.dp(this, 10));
            t.setOnClickListener(v -> { if (section != idx) { section = idx; renderRail(); renderSection(true); } });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, Ui.dp(this, 42));
            lp.bottomMargin = Ui.dp(this, 4);
            rail.addView(t, lp);
        }
    }

    private void renderSection(boolean animate) {
        content.removeAllViews();
        TextView h = new TextView(this);
        h.setText(SECTIONS[section].toUpperCase());
        h.setTextColor(Ui.AMBER);
        h.setTypeface(Ui.mono(true));
        h.setTextSize(13);
        h.setLetterSpacing(0.22f);
        h.setPadding(Ui.dp(this, 2), Ui.dp(this, 8), 0, Ui.dp(this, 10));
        content.addView(h);
        switch (section) {
            case 0: games(); break;
            case 1: graphics(); break;
            case 2: controls(); break;
            case 3: launch(); break;
            case 4: audio(); break;
            case 5: engine(); break;
            case 6: look(); break;
            case 7: logs(); break;
            default: about();
        }
        contentScroll.scrollTo(0, 0);
        if (animate) {
            content.setAlpha(0f);
            content.setTranslationX(Ui.dp(this, 16));
            content.animate().alpha(1f).translationX(0).setDuration(220).setInterpolator(Anim.EMPHASIZED).start();
        }
    }

    // ───────────────────────── строительные блоки ─────────────────────────

    /** Группа настроек: карточка без заголовка-вкладки, строки разделены линиями. */
    private LinearLayout group(String caption) {
        if (caption != null) {
            TextView t = Ui.hint(this, caption.toUpperCase());
            t.setLetterSpacing(0.15f);
            t.setPadding(Ui.dp(this, 4), Ui.dp(this, 10), 0, Ui.dp(this, 6));
            content.addView(t);
        }
        LinearLayout g = Ui.column(this);
        g.setBackground(Ui.rounded(Ui.CARD, Ui.LINE, 14, this));
        g.setPadding(Ui.dp(this, 16), Ui.dp(this, 6), Ui.dp(this, 16), Ui.dp(this, 6));
        content.addView(g, new LinearLayout.LayoutParams(-1, -2));
        return g;
    }

    private void separator(LinearLayout g) {
        if (g.getChildCount() == 0) return;
        View v = new View(this);
        v.setBackgroundColor(Ui.LINE);
        g.addView(v, new LinearLayout.LayoutParams(-1, Ui.dp(this, 1)));
    }

    private LinearLayout textBlock(String title, String sub) {
        LinearLayout col = Ui.column(this);
        TextView t = Ui.label(this, title);
        t.setTextSize(14);
        t.setPadding(0, 0, 0, 0);
        col.addView(t);
        if (sub != null) {
            TextView s = Ui.hint(this, sub);
            s.setPadding(0, Ui.dp(this, 2), 0, 0);
            col.addView(s);
        }
        return col;
    }

    /** Строка с переключателем справа. */
    private Switch toggle(LinearLayout g, String title, String sub, String key, boolean def, Ui.IntCallback onChange) {
        separator(g);
        LinearLayout row = Ui.row(this);
        row.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 10));
        row.addView(textBlock(title, sub), Ui.weight());
        Switch sw = new Switch(this);
        sw.setChecked(prefs.getBoolean(key, def));
        int[][] states = {{android.R.attr.state_checked}, {}};
        sw.setThumbTintList(new ColorStateList(states, new int[]{Ui.FG, Ui.TEXT_DIM}));
        sw.setTrackTintList(new ColorStateList(states, new int[]{Ui.tint(120), Ui.LINE}));
        sw.setOnCheckedChangeListener((v, on) -> {
            prefs.edit().putBoolean(key, on).apply();
            if (onChange != null) onChange.on(on ? 1 : 0);
        });
        row.addView(sw);
        row.setOnClickListener(v -> sw.toggle());
        g.addView(row);
        return sw;
    }

    /** Строка-действие: иконка, текст, стрелка. */
    private View action(LinearLayout g, int icon, String title, String sub, View.OnClickListener l) {
        separator(g);
        LinearLayout row = Ui.row(this);
        row.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 10));
        ImageView ic = new ImageView(this);
        ic.setImageDrawable(Ui.icon(this, icon, Ui.FG, 20));
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(Ui.dp(this, 22), Ui.dp(this, 22));
        ilp.rightMargin = Ui.dp(this, 14);
        row.addView(ic, ilp);
        row.addView(textBlock(title, sub), Ui.weight());
        ImageView arrow = new ImageView(this);
        arrow.setImageDrawable(Ui.icon(this, R.drawable.ic_arrow_up, Ui.FG_DIM, 16));
        arrow.setRotation(90);
        row.addView(arrow);
        row.setBackground(new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(Ui.tint(50)), null, Ui.rounded(Color.WHITE, 0, 8, this)));
        row.setOnClickListener(l);
        g.addView(row);
        return row;
    }

    private void info(LinearLayout g, int icon, String text, int color) {
        separator(g);
        TextView t = Ui.label(this, text);
        t.setTextColor(color);
        t.setTextSize(13);
        t.setPadding(0, Ui.dp(this, 10), 0, Ui.dp(this, 10));
        Ui.withIcon(t, icon, color);
        g.addView(t);
    }

    private void choice(LinearLayout g, String title, String[] names, String[] vals, String key, String def) {
        separator(g);
        LinearLayout row = Ui.row(this);
        row.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
        row.addView(textBlock(title, null), Ui.weight());
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
        sp.setBackground(Ui.rounded(Ui.tint(22), Ui.FG_DIM, 10, this));
        sp.setSelection(Math.max(0, Arrays.asList(vals).indexOf(prefs.getString(key, def))));
        sp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> a, View v, int pos, long id) { prefs.edit().putString(key, vals[pos]).apply(); }
            @Override public void onNothingSelected(AdapterView<?> a) {}
        });
        row.addView(sp, new LinearLayout.LayoutParams(Ui.dp(this, 280), Ui.dp(this, 42)));
        g.addView(row);
    }

    private void open(Intent i) {
        startActivity(i);
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    // ───────────────────────── разделы ─────────────────────────

    private void games() {
        LinearLayout tabs = Ui.row(this);
        for (GameDef d : GameDef.values()) {
            boolean on = d == game;
            TextView t = new TextView(this);
            t.setText(d.title);
            t.setTypeface(Ui.mono(true));
            t.setTextSize(13);
            t.setGravity(Gravity.CENTER);
            t.setTextColor(on ? Ui.ON_ACCENT : Ui.FG);
            t.setBackground(on ? Ui.rounded(Ui.FG, 0, 20, this) : Ui.rounded(Ui.tint(18), Ui.FG_DIM, 20, this));
            t.setPadding(Ui.dp(this, 18), 0, Ui.dp(this, 18), 0);
            t.setOnClickListener(v -> { game = d; renderSection(true); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, Ui.dp(this, 38));
            lp.rightMargin = Ui.dp(this, 8);
            tabs.addView(t, lp);
        }
        content.addView(tabs);

        String path = game.gameDir(this);
        LinearLayout files = group("Файлы игры");
        if (path == null) {
            info(files, R.drawable.ic_info, "Папка не выбрана. Укажите папку, где лежат " + game.exe + " и Data.", Ui.TEXT_DIM);
        } else {
            GameFiles.Report r = GameFiles.validate(game, new File(path));
            info(files, R.drawable.ic_folder, path, Ui.TEXT);
            if (r.ok()) info(files, R.drawable.ic_check, "Файлы в порядке" + (r.dlcs.isEmpty() ? "" : " | DLC: " + String.join(", ", r.dlcs)), Ui.FG);
            for (String e : r.errors) info(files, R.drawable.ic_cross, e, Ui.RED);
            for (String w : r.warnings) info(files, R.drawable.ic_warning, w, Ui.AMBER);
        }
        action(files, R.drawable.ic_folder, path == null ? "Выбрать папку игры" : "Сменить папку игры", null,
                v -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_GAME_DIR));

        LinearLayout lib = group("Контент");
        action(lib, R.drawable.ic_mods, "Менеджер модов", "Порядок загрузки плагинов, включение и выключение", v -> {
            if (game.gameDir(this) == null) { Toast.makeText(this, "Сначала выберите папку игры", Toast.LENGTH_SHORT).show(); return; }
            open(new Intent(this, ModManagerActivity.class).putExtra(ModManagerActivity.EXTRA_GAME, game.id));
        });
        action(lib, R.drawable.ic_save, "Сохранения", "Импорт с ПК, экспорт и резервные копии",
                v -> open(new Intent(this, SavesActivity.class).putExtra(SavesActivity.EXTRA_GAME, game.id)));

        LinearLayout cover = group("Обложка на главном экране");
        action(cover, R.drawable.ic_image, "Выбрать свою обложку", "Любая картинка из галереи", v -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("image/*");
            startActivityForResult(i, REQ_COVER);
        });
        if (coverFile(this, game).exists()) action(cover, R.drawable.ic_restore, "Вернуть стандартную обложку", null, v -> {
            //noinspection ResultOfMethodCallIgnored
            coverFile(this, game).delete();
            renderSection(false);
        });

        LinearLayout fix = group("Если игра не запускается");
        action(fix, R.drawable.ic_restore, "Пересоздать префикс Wine", "Сохранения сначала копируются в резервную папку", v -> resetPrefix());
    }

    private void graphics() {
        LinearLayout g = group(null);
        String[] qVals = {"auto", "low", "medium", "high"};
        String[] qNames = {"Авто — " + qualityName(DeviceProfile.autoQuality(this)), "Низкое | 720p", "Среднее | 900p", "Высокое | 1080p"};
        choice(g, "Качество", qNames, qVals, Prefs.QUALITY, "auto");
        separator(g);
        View slider = Ui.slider(this, "Масштаб разрешения, %", 50, 100, prefs.getInt(Prefs.RES_SCALE, 100),
                v -> prefs.edit().putInt(Prefs.RES_SCALE, v).apply());
        slider.setPadding(0, Ui.dp(this, 8), 0, Ui.dp(this, 8));
        g.addView(slider);
        toggle(g, "На весь экран", "Растягивать картинку под экран телефона, без чёрных полос по бокам", "stretch_screen", true, null);
        toggle(g, "Счётчик FPS", "Показывает частоту кадров поверх игры", Prefs.SHOW_HUD, false, null);
        info(g, R.drawable.ic_lock, "Ограничение 60 FPS включено всегда: выше 60 ломается физика движка.", Ui.TEXT_DIM);
        LinearLayout more = group(null);
        action(more, R.drawable.ic_display, "Тонкая настройка графики", "Тени, дальность прорисовки, трава, вода",
                v -> open(new Intent(this, GraphicsActivity.class)));
    }

    private void controls() {
        LinearLayout g = group(null);
        choice(g, "Экранные кнопки", new String[]{"Авто — скрывать при геймпаде", "Всегда показывать", "Выключены"},
                new String[]{"auto", "on", "off"}, Prefs.OVERLAY_MODE, "auto");
        action(g, R.drawable.ic_touch, "Редактор экранных кнопок", "Размер, прозрачность, форма, расположение и действия",
                v -> open(new Intent(this, ControlsEditorActivity.class)));
        toggle(g, "Удерживать мышь в игре", "gamescope всегда держит относительный режим мыши. "
                + "Без этого игры на DirectInput, прячущие курсор, не получают движение вовсе",
                com.wastelanddroid.engine.FalloutInput.GRAB_CURSOR, true, null);
        choice(g, "Мышь в DirectInput", new String[]{"Как в Wine по умолчанию", "enable", "force", "disable"},
                new String[]{"", "enable", "force", "disable"},
                com.wastelanddroid.engine.FalloutInput.MOUSE_WARP, "");
        choice(g, "Как мышь попадает в игру",
                new String[]{"Касание ведёт курсор", "Касание ведёт и нажимает", "Через композитор", "Только сдвиги мыши", "Отдельным устройством"},
                new String[]{com.wastelanddroid.engine.FalloutInput.MOUSE_TOUCH,
                        com.wastelanddroid.engine.FalloutInput.MOUSE_TOUCH_CLICK,
                        com.wastelanddroid.engine.FalloutInput.MOUSE_COMPOSITOR,
                        com.wastelanddroid.engine.FalloutInput.MOUSE_RELATIVE,
                        com.wastelanddroid.engine.FalloutInput.MOUSE_DEVICE},
                com.wastelanddroid.engine.FalloutInput.MOUSE_MODE, com.wastelanddroid.engine.FalloutInput.MOUSE_COMPOSITOR);
        info(g, R.drawable.ic_info, "Если мышь в игре не слушается, попробуйте другие способы по очереди: "
                + "включите «Отладка ввода» в разделе Логи и смотрите, меняется ли что-то в игре.", Ui.TEXT_DIM);
        info(g, R.drawable.ic_gamepad, "Геймпад по Bluetooth или USB игра видит как Xbox 360 — он работает сразу.", Ui.TEXT_DIM);
        info(g, R.drawable.ic_info, "Обзор мышью — свайп по правой половине экрана. Чувствительность настраивается в редакторе.", Ui.TEXT_DIM);
    }

    private void launch() {
        LinearLayout g = group("Запуск");
        toggle(g, "Сразу запускать последнюю игру", "После заставки, если всё готово", Prefs.AUTOSTART, false, null);
        toggle(g, "Пропуск вступительных роликов", null, Prefs.SKIP_INTRO, true, null);
        toggle(g, "Запуск через FOSE / NVSE", "Если загрузчик лежит в папке игры", Prefs.USE_FOSE, true, null);
        toggle(g, "Ключи реестра игры", "Без них игра считает, что не установлена", Prefs.FIX_REGISTRY, true, null);
        toggle(g, "Режим геймпада в игре", "Включайте только с физическим геймпадом: в этом режиме "
                + "Fallout прячет курсор и не слушает мышь", Prefs.GAMEPAD, false, null);
        LinearLayout s = group("Стабильность");
        toggle(s, "Патч памяти 4 ГБ (LAA)", "Главное средство от вылетов в долгих сессиях", Prefs.LAA, true, null);
        toggle(s, "Автосохранения", "При переходах, ожидании и отдыхе", Prefs.AUTOSAVE, true, null);
        toggle(s, "Сторож зависаний", null, Prefs.WATCHDOG, true, null);
        toggle(s, "Только производительные ядра CPU", null, Prefs.PIN_BIG_CORES, true, null);
    }

    private void audio() {
        LinearLayout g = group(null);
        toggle(g, "Прямой звук", "Меньше задержка. Выключите, если звука нет — тогда работает PulseAudio",
                Prefs.DIRECT_AUDIO, true, on -> FalloutEngine.setDirectAudio(this, on == 1));
    }

    private void engine() {
        LinearLayout st = group("Состояние");
        boolean rt = FalloutEngine.runtimeInstalled(this);
        if (FalloutEngine.childLimitBlocks(this))
            info(st, R.drawable.ic_warning, "Android ограничивает дочерние процессы — игру будет выбивать", Ui.AMBER);
        info(st, rt ? R.drawable.ic_check : R.drawable.ic_cross, rt ? "Linux-среда установлена" : "Linux-среда не установлена", rt ? Ui.FG : Ui.RED);
        if (rt) {
            com.droiddeck.launcher.session.ComponentsManager.Proton p = FalloutEngine.preferredProton(this);
            info(st, p != null ? R.drawable.ic_check : R.drawable.ic_warning,
                    p != null ? FalloutEngine.protonLabel(p.getName()) : "Proton не установлен", p != null ? Ui.FG : Ui.AMBER);
        }
        action(st, R.drawable.ic_download, "Мастер подготовки", "Разрешения, Linux-среда и Proton",
                v -> open(new Intent(this, OnboardingActivity.class)));
        LinearLayout c = group("Контейнер");
        action(c, R.drawable.ic_settings, "Настройка контейнера", "Графический драйвер, эмуляция x86 (FEX), звук",
                v -> open(new Intent(this, ContainerActivity.class)));
    }

    private void look() {
        LinearLayout g = group("Акцентный цвет");
        LinearLayout row = Ui.row(this);
        row.setPadding(0, Ui.dp(this, 12), 0, Ui.dp(this, 12));
        String cur = Ui.accent(this);
        for (int i = 0; i < Ui.ACCENTS.length; i++) {
            String id = Ui.ACCENTS[i];
            boolean on = id.equals(cur);
            LinearLayout sw = Ui.column(this);
            sw.setGravity(Gravity.CENTER);
            View dot = new View(this);
            android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
            d.setShape(android.graphics.drawable.GradientDrawable.OVAL);
            d.setColor(Ui.ACCENT_COLORS[i]);
            d.setStroke(Ui.dp(this, on ? 3 : 1), on ? Color.WHITE : Ui.LINE);
            dot.setBackground(d);
            int s = Ui.dp(this, 44);
            sw.addView(dot, new LinearLayout.LayoutParams(s, s));
            TextView name = Ui.label(this, Ui.ACCENT_NAMES[i]);
            name.setTextColor(on ? Ui.ACCENT_COLORS[i] : Ui.TEXT_DIM);
            name.setGravity(Gravity.CENTER);
            sw.addView(name);
            sw.setOnClickListener(v -> setAccent(id));
            Anim.pressable(sw);
            row.addView(sw, Ui.weight());
        }
        g.addView(row);
        info(g, R.drawable.ic_info, "Меняет цвет всего интерфейса и экранных кнопок.", Ui.TEXT_DIM);

        LinearLayout bg = group("Заставка");
        action(bg, R.drawable.ic_image, "Свой фон заставки и меню", null, v -> {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("image/*");
            startActivityForResult(i, REQ_SPLASH);
        });
        action(bg, R.drawable.ic_restore, "Стандартный фон", null, v -> {
            //noinspection ResultOfMethodCallIgnored
            WastelandBackdrop.customFile(this).delete();
            Toast.makeText(this, "Стандартный фон заставки", Toast.LENGTH_SHORT).show();
        });
    }

    private void setAccent(String id) {
        prefs.edit().putString(Ui.ACCENT_KEY, id).apply();
        Ui.applyAccent(this);
        try {
            com.droiddeck.launcher.input.ControllerPrefs.INSTANCE.setTint(this, Ui.FG);
        } catch (Throwable ignored) { }
        recreate();
    }

    private void logs() {
        LinearLayout g = group(null);
        toggle(g, "Подробные логи игры", "Proton, Wine и DXVK пишут подробности — нужно для отчётов об ошибках",
                Prefs.GAME_LOGS, true, on -> FalloutEngine.setGameDebugLogs(this, on == 1));
        toggle(g, "Отладка ввода", "Строка поверх игры: доходят ли касания и что уходит игре",
                com.wastelanddroid.engine.FalloutInput.DEBUG, false, null);
        action(g, R.drawable.ic_upload, "Отправить логи последнего запуска", "Архив с логами — в Telegram или куда удобно",
                v -> shareLastLogs(this));
        action(g, R.drawable.ic_warning, "Отчёт о вылетах приложения", null, v -> {
            String crash = com.wastelanddroid.util.CrashLog.takeUnseen(this);
            if (crash == null) { Toast.makeText(this, "Новых вылетов нет", Toast.LENGTH_SHORT).show(); return; }
            startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, "Fallout Droid: отчёт о вылете").putExtra(Intent.EXTRA_TEXT, crash), "Отправить отчёт"));
        });
    }

    /** Упаковывает папку последней сессии и открывает «Поделиться». */
    public static void shareLastLogs(Activity a) {
        Toast.makeText(a, "Собираю логи...", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            File zip = FalloutEngine.lastSessionLogs(a);
            a.runOnUiThread(() -> {
                if (zip == null) { Toast.makeText(a, "Логов пока нет — сначала запустите игру", Toast.LENGTH_LONG).show(); return; }
                a.startActivity(Intent.createChooser(FalloutEngine.shareLogsIntent(a, zip), "Отправить логи"));
            });
        }, "fd-logs").start();
    }

    private void about() {
        LinearLayout g = group(null);
        String ver;
        try { ver = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { ver = "?"; }
        info(g, R.drawable.ic_radiation, "Fallout Droid " + ver + " | by Rommy", Ui.FG);
        action(g, R.drawable.ic_telegram, "Telegram-канал @" + Links.TELEGRAM_CHANNEL, "Новости, обновления и помощь", v -> Links.openTelegram(this));
        action(g, R.drawable.ic_info, "Лицензии открытого ПО", null, v -> new AlertDialog.Builder(this)
                .setTitle("Лицензии")
                .setMessage("Fallout Droid распространяется под лицензией GPL-3.0.\n\n"
                        + "Движок запуска основан на проекте DroidDeck (GPL-3.0), "
                        + "github.com/Droid-Deck/DroidDeck. Компоненты движка: FEX (MIT), Proton/Wine (LGPL), "
                        + "DXVK (zlib), Mesa Turnip (MIT), PulseAudio (LGPL) и др. — см. assets/licenses.\n\n"
                        + "Иконки: Game Icon Pack (CC0). Шрифт: Fallout Regular, Ash Fargouh.\n\n"
                        + "Fallout является товарным знаком Bethesda Softworks. Проект не связан с Bethesda.")
                .setPositiveButton("OK", null).show());
    }

    // ───────────────────────── действия ─────────────────────────

    private void resetPrefix() {
        new AlertDialog.Builder(this)
                .setTitle("Пересоздать префикс Wine?")
                .setMessage("Настройки Wine для " + game.title + " будут созданы заново при следующем запуске. "
                        + "Сохранения сначала копируются в резервную папку.")
                .setPositiveButton("Пересоздать", (d0, w) -> {
                    String sc = prefs.getString("scope_" + game.id, null);
                    if (sc != null) {
                        com.wastelanddroid.runtime.RuntimeManager rt = new com.wastelanddroid.runtime.RuntimeManager(this);
                        com.wastelanddroid.game.ProtonPrefix.recreate(game, FalloutEngine.prefixDir(this, sc), rt.backups);
                    }
                    Toast.makeText(this, "Готово — нажмите \"Играть\"", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private static String qualityName(DeviceProfile.Quality q) {
        switch (q) {
            case HIGH: return "высокое";
            case MEDIUM: return "среднее";
            default: return "низкое";
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (req == REQ_GAME_DIR) {
            File dir = GameFiles.treeUriToFile(uri);
            prefs.edit().putString(game.dirKey(), dir.getPath()).apply();
        } else if (req == REQ_COVER || req == REQ_SPLASH) {
            File dst = req == REQ_COVER ? coverFile(this, game) : WastelandBackdrop.customFile(this);
            //noinspection ResultOfMethodCallIgnored
            dst.getParentFile().mkdirs();
            try (InputStream in = getContentResolver().openInputStream(uri);
                 java.io.OutputStream out = new java.io.FileOutputStream(dst)) {
                com.wastelanddroid.util.Files2.copy(in, out);
                Toast.makeText(this, req == REQ_COVER ? "Обложка обновлена" : "Фон обновлён", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Не удалось загрузить картинку: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
        renderSection(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (content != null && content.getChildCount() > 0) renderSection(false);
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
