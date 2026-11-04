package com.wastelanddroid.game;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.content.Intent;
import android.hardware.input.InputManager;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.wastelanddroid.controls.ControlLayout;
import com.wastelanddroid.controls.ControlsOverlay;
import com.wastelanddroid.controls.GamepadInput;
import com.wastelanddroid.controls.GamepadMapping;
import com.wastelanddroid.mods.ModManager;
import com.wastelanddroid.runtime.DisplayServer;
import com.wastelanddroid.runtime.DxvkConfig;
import com.wastelanddroid.runtime.GameProcess;
import com.wastelanddroid.runtime.InputBridge;
import com.wastelanddroid.runtime.LaunchConfig;
import com.wastelanddroid.runtime.NativeBridge;
import com.wastelanddroid.runtime.RuntimeManager;
import com.wastelanddroid.util.Files2;
import com.wastelanddroid.util.Links;
import com.wastelanddroid.util.Prefs;
import com.wastelanddroid.util.Ui;

import java.io.File;

/**
 * Экран игры. Работает в отдельном процессе (:game), чтобы падение рантайма
 * не уносило с собой лаунчер, а память лаунчера не отнимала память у игры.
 */
public final class GameActivity extends Activity implements SurfaceHolder.Callback, GameProcess.Listener,
        InputManager.InputDeviceListener {
    public static final String EXTRA_GAME = "game";
    private GameDef def;
    private GamepadInput gamepad;
    private String overlayMode;
    private SurfaceView surface;
    private ControlsOverlay overlay;
    private TextView status;
    private InputBridge input;
    private DisplayServer display;
    private final GameProcess game = new GameProcess();
    private DeviceProfile profile;
    private boolean started;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.immersive(this);
        Performance.apply(this);

        def = GameDef.byId(getIntent().getStringExtra(EXTRA_GAME));
        SharedPreferences p = Prefs.get(this);
        overlayMode = p.getString(Prefs.OVERLAY_MODE, "auto");
        DeviceProfile.Quality q;
        String qs = p.getString(Prefs.QUALITY, "auto");
        q = "auto".equals(qs) ? DeviceProfile.autoQuality(this) : DeviceProfile.Quality.valueOf(qs.toUpperCase());
        profile = DeviceProfile.create(this, q, p.getInt(Prefs.RES_SCALE, 100));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(this);
        // Рендер в пониженном разрешении, масштабирование — аппаратным композитором (бесплатно для GPU).
        surface.getHolder().setFixedSize(profile.renderWidth, profile.renderHeight);
        surface.getHolder().addCallback(this);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1));

        input = new InputBridge();
        overlay = new ControlsOverlay(this);
        overlay.setLayout(ControlLayout.load(this));
        overlay.setInput(input);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        gamepad = new GamepadInput(input, GamepadMapping.load(this));
        getSystemService(InputManager.class).registerInputDeviceListener(this, null);
        updateOverlayVisibility();

        status = Ui.label(this, "Подготовка...");
        status.setTextSize(16);
        status.setTypeface(Ui.mono(true));
        status.setBackground(Ui.rounded(Ui.CARD, Ui.LINE, 14, this));
        status.setPadding(Ui.dp(this, 22), Ui.dp(this, 14), Ui.dp(this, 22), Ui.dp(this, 14));
        root.addView(status, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        setContentView(root);
    }

    @Override
    public void surfaceCreated(SurfaceHolder h) {
        Performance.setSurfaceFrameRate(h.getSurface());
        if (started) {
            if (display != null) display.resize(h.getSurface(), profile.renderWidth, profile.renderHeight);
            return;
        }
        started = true;
        new Thread(() -> prepareAndLaunch(h), "game-prepare").start();
    }

    @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int hh) {
        if (display != null) display.resize(h.getSurface(), profile.renderWidth, profile.renderHeight);
    }

    @Override public void surfaceDestroyed(SurfaceHolder h) {}

    private void setStatus(String s) { runOnUiThread(() -> { status.setText(s); status.setVisibility(s == null ? TextView.GONE : TextView.VISIBLE); }); }

    private void fail(String msg) {
        runOnUiThread(() -> new AlertDialog.Builder(this)
                .setTitle("Не удалось запустить")
                .setMessage(msg)
                .setCancelable(false)
                .setPositiveButton("В меню", (d, w) -> backToLauncher())
                .setNeutralButton("Помощь в Telegram", (d, w) -> { Links.openTelegram(this); backToLauncher(); })
                .show());
    }

    private void prepareAndLaunch(SurfaceHolder h) {
        SharedPreferences p = Prefs.get(this);
        RuntimeManager rt = new RuntimeManager(this);
        String gamePath = def.gameDir(this);
        if (gamePath == null) { fail("Не выбрана папка с игрой."); return; }
        File gameDir = new File(gamePath);
        try {
            setStatus("Проверка файлов игры...");
            GameFiles.Report rep = GameFiles.validate(def, gameDir);
            if (!rep.ok()) { fail(String.join("\n", rep.errors)); return; }
            if (!rt.isInstalled()) { fail("Рантайм не установлен: нет " + rt.missingComponent() + "\nИмпортируйте пакет рантайма в лаунчере."); return; }

            File exe = Files2.findCaseInsensitive(gameDir, def.exe);
            if (p.getBoolean(Prefs.LAA, true) && gameDir.canWrite()) {
                setStatus("Патч памяти 4 ГБ...");
                ExePatcher.applyLargeAddressAware(exe);
            }
            setStatus("Резервная копия сохранений...");
            SaveBackup.backup(def, rt.prefix, rt.backups);
            setStatus("Настройка игры...");
            IniTweaks.apply(def, gameDir, rt.prefix, profile, GraphicsSettings.load(this, profile.quality), p.getBoolean(Prefs.SKIP_INTRO, true), p.getBoolean(Prefs.AUTOSAVE, true));
            setStatus("Порядок загрузки модов...");
            new ModManager(this, def, gameDir).apply(rt.prefix);
            File conf = DxvkConfig.write(new File(getFilesDir(), "conf"), p.getBoolean(Prefs.SHOW_HUD, false));
            File tmp = new File(getCacheDir(), "tmp");
            tmp.mkdirs();

            display = DisplayServer.create();
            if (display == null) {
                fail("В этой сборке нет дисплейного сервера (этап 2 дорожной карты, см. docs/ROADMAP.md). "
                        + "Подготовка игры выполнена: ini, реестр, DXVK и патчи применены.");
                return;
            }
            String disp = display.start(h.getSurface(), profile.renderWidth, profile.renderHeight);

            setStatus("Регистрация игры в реестре Wine...");
            File reg = Registry.writeRegFile(def, gameDir, new File(getFilesDir(), "conf"));
            LaunchConfig regCfg = LaunchConfig.wine(rt, gameDir, conf, tmp, disp, "regedit", "/S", LaunchConfig.toWinPath(reg));
            int regPid = NativeBridge.nativeSpawn(regCfg.argvArray(), regCfg.envArray(), gameDir.getPath(),
                    new File(rt.logs, "regedit.log").getPath(), false);
            if (regPid <= 0 || NativeBridge.nativeWait(regPid) != 0) { fail("Не удалось записать ключи реестра (см. logs/regedit.log)."); return; }

            File launchExe = exe;
            File fose = Files2.findCaseInsensitive(gameDir, def.scriptExtender);
            if (fose != null && p.getBoolean(Prefs.USE_FOSE, true)) launchExe = fose;

            setStatus("Запуск...");
            LaunchConfig cfg = LaunchConfig.game(rt, gameDir, launchExe, conf, profile.renderWidth, profile.renderHeight, tmp, disp);
            int pid = game.start(cfg, new File(rt.logs, def.id + ".log"), p.getBoolean(Prefs.PIN_BIG_CORES, true),
                    p.getBoolean(Prefs.WATCHDOG, true), this);
            if (pid <= 0) { fail("Не удалось запустить процесс рантайма."); return; }
            setStatus(null);
        } catch (Exception e) {
            fail(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    @Override
    public void onExited(int code) {
        if (code == 0) { backToLauncher(); return; }
        new AlertDialog.Builder(this)
                .setTitle("Игра завершилась с ошибкой (" + code + ")")
                .setMessage("Сохранения скопированы перед запуском. Журналы: Android/data/com.wastelanddroid/files/logs")
                .setPositiveButton("Перезапустить", (d, w) -> recreate())
                .setNegativeButton("В меню", (d, w) -> backToLauncher())
                .setNeutralButton("Сообщить в Telegram", (d, w) -> { Links.openTelegram(this); backToLauncher(); })
                .setCancelable(false)
                .show();
    }

    @Override
    public void onHangSuspected(long stalledMs) {
        new AlertDialog.Builder(this)
                .setTitle("Игра не отвечает")
                .setMessage("Нет активности " + stalledMs / 1000 + " с. Подождать ещё или завершить игру? "
                        + "(Автосохранения и копии сейвов сохранены.)")
                .setPositiveButton("Ждать", null)
                .setNegativeButton("Завершить", (d, w) -> game.kill())
                .show();
    }

    /** Возврат в лаунчер: при автозапуске из заставки лаунчера в стеке нет — открываем его. */
    private void backToLauncher() {
        if (isTaskRoot()) {
            startActivity(new Intent(this, com.wastelanddroid.MainActivity.class));
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        }
        finish();
    }

    private void updateOverlayVisibility() {
        boolean show = "on".equals(overlayMode) || ("auto".equals(overlayMode) && !GamepadInput.anyConnected());
        overlay.setVisibility(show ? View.VISIBLE : View.GONE);
        if (!show) overlay.releaseAll();
    }

    @Override public void onInputDeviceAdded(int id) { updateOverlayVisibility(); }
    @Override public void onInputDeviceRemoved(int id) { updateOverlayVisibility(); gamepad.releaseAll(); }
    @Override public void onInputDeviceChanged(int id) { updateOverlayVisibility(); }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (gamepad.onKey(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (gamepad.onMotion(e)) return true;
        return super.dispatchGenericMotionEvent(e);
    }

    @Override
    protected void onPause() {
        super.onPause();
        overlay.releaseAll();
        gamepad.stop();
        game.setPaused(true);
        game.suspend();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Ui.immersive(this);
        updateOverlayVisibility();
        gamepad.start();
        game.resume();
        game.setPaused(false);
    }

    @Override
    protected void onDestroy() {
        getSystemService(InputManager.class).unregisterInputDeviceListener(this);
        game.kill();
        if (display != null) display.stop();
        input.close();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // 'Назад' = Esc в игре; выход — только через меню игры или диалог.
        input.key(0x1B, true);
        input.key(0x1B, false);
    }

    @Override
    public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) Ui.immersive(this); }
}
