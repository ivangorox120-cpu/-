package com.wastelanddroid.controls;

import android.view.Choreographer;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

import com.wastelanddroid.runtime.InputBridge;

import java.util.HashSet;
import java.util.Set;

/**
 * Геймпады (Bluetooth/USB: Xbox, DualShock/DualSense, 8BitDo и любые с HID-раскладкой Android).
 * Стики опрашиваются по vsync: правый стик даёт плавное движение мыши каждые 16,7 мс.
 */
public final class GamepadInput implements Choreographer.FrameCallback {
    private static final int VK_W = 0x57, VK_A = 0x41, VK_S = 0x53, VK_D = 0x44;
    private static final float LOOK_PX_PER_FRAME = 22f;

    private final InputBridge input;
    private final GamepadMapping map;
    private final Set<Integer> held = new HashSet<>();
    private final Set<Integer> toggledOn = new HashSet<>();
    private float lx, ly, rx, ry;
    private boolean w, a, s, d;
    private boolean running;
    /** Цикл кадров крутится только пока отклонён правый стик — в остальное время ноль нагрузки. */
    private boolean looping;

    public GamepadInput(InputBridge input, GamepadMapping map) {
        this.input = input;
        this.map = map;
    }

    public static boolean isGamepad(InputDevice dev) {
        if (dev == null || dev.isVirtual()) return false;
        int src = dev.getSources();
        return (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    public static boolean anyConnected() {
        for (int id : InputDevice.getDeviceIds()) if (isGamepad(InputDevice.getDevice(id))) return true;
        return false;
    }

    public void start() {
        running = true;
    }

    public void stop() {
        running = false;
        if (looping) Choreographer.getInstance().removeFrameCallback(this);
        looping = false;
        releaseAll();
    }

    private void ensureLooping() {
        if (running && !looping && (rx != 0 || ry != 0)) {
            looping = true;
            Choreographer.getInstance().postFrameCallback(this);
        }
    }

    /** @return true, если событие обработано. */
    public boolean onKey(KeyEvent e) {
        if (!isGamepad(e.getDevice()) && !KeyEvent.isGamepadButton(e.getKeyCode())) return false;
        int code = e.getKeyCode();
        switch (code) { // крестовина может приходить кнопками
            case KeyEvent.KEYCODE_DPAD_UP: code = GamepadMapping.PAD_UP; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: code = GamepadMapping.PAD_DOWN; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: code = GamepadMapping.PAD_LEFT; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: code = GamepadMapping.PAD_RIGHT; break;
            case KeyEvent.KEYCODE_BUTTON_L2: code = GamepadMapping.PAD_LT; break;
            case KeyEvent.KEYCODE_BUTTON_R2: code = GamepadMapping.PAD_RT; break;
            default: break;
        }
        if (e.getRepeatCount() > 0) return true;
        if (e.getAction() == KeyEvent.ACTION_DOWN) button(code, true);
        else if (e.getAction() == KeyEvent.ACTION_UP) button(code, false);
        return true;
    }

    public boolean onMotion(MotionEvent e) {
        if (!isGamepad(e.getDevice()) || e.getAction() != MotionEvent.ACTION_MOVE) return false;
        InputDevice dev = e.getDevice();
        lx = axis(e, dev, MotionEvent.AXIS_X);
        ly = axis(e, dev, MotionEvent.AXIS_Y);
        rx = axis(e, dev, MotionEvent.AXIS_Z);
        ry = axis(e, dev, MotionEvent.AXIS_RZ);
        float lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
        float rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
        trigger(GamepadMapping.PAD_LT, lt);
        trigger(GamepadMapping.PAD_RT, rt);
        float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X), hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        hat(GamepadMapping.PAD_LEFT, hx < -0.5f);
        hat(GamepadMapping.PAD_RIGHT, hx > 0.5f);
        hat(GamepadMapping.PAD_UP, hy < -0.5f);
        hat(GamepadMapping.PAD_DOWN, hy > 0.5f);
        updateMove();
        ensureLooping();
        return true;
    }

    private float axis(MotionEvent e, InputDevice dev, int ax) {
        float v = e.getAxisValue(ax);
        InputDevice.MotionRange r = dev.getMotionRange(ax, e.getSource());
        float flat = r != null ? Math.max(r.getFlat(), map.deadzone) : map.deadzone;
        if (Math.abs(v) < flat) return 0f;
        // перенормировка после мёртвой зоны: без 'рывка' на её границе
        return Math.signum(v) * (Math.abs(v) - flat) / (1f - flat);
    }

    private void trigger(int code, float v) {
        boolean down = v > 0.45f;
        if (down != held.contains(code)) button(code, down);
    }

    private void hat(int code, boolean down) {
        if (down != held.contains(code)) button(code, down);
    }

    private void button(int code, boolean down) {
        Integer vk = map.keys.get(code);
        if (down) held.add(code); else held.remove(code);
        if (vk == null || input == null) return;
        if (map.toggles.contains(code)) {
            if (!down) return;
            boolean on = !toggledOn.contains(code);
            if (on) toggledOn.add(code); else toggledOn.remove(code);
            input.key(vk, on);
            return;
        }
        input.key(vk, down);
    }

    private void updateMove() {
        final float t = 0.35f;
        setMove(ly < -t, lx < -t, ly > t, lx > t);
    }

    private void setMove(boolean nw, boolean na, boolean ns, boolean nd) {
        if (input != null) {
            if (nw != w) input.key(VK_W, nw);
            if (na != a) input.key(VK_A, na);
            if (ns != s) input.key(VK_S, ns);
            if (nd != d) input.key(VK_D, nd);
        }
        w = nw; a = na; s = ns; d = nd;
    }

    @Override
    public void doFrame(long frameTimeNanos) {
        if (!running || (rx == 0 && ry == 0)) { looping = false; return; }
        if (input != null) {
            // Кубическая кривая: точность при малом отклонении, быстрый разворот при полном.
            float k = LOOK_PX_PER_FRAME * map.lookSpeed;
            float cx = rx * rx * rx * 0.6f + rx * 0.4f;
            float cy = ry * ry * ry * 0.6f + ry * 0.4f;
            input.mouseMove(cx * k, (map.invertY ? -cy : cy) * k);
        }
        Choreographer.getInstance().postFrameCallback(this);
    }

    public void releaseAll() {
        for (Integer code : new HashSet<>(held)) button(code, false);
        for (Integer code : new HashSet<>(toggledOn)) {
            Integer vk = map.keys.get(code);
            if (vk != null && input != null) input.key(vk, false);
        }
        toggledOn.clear();
        lx = ly = rx = ry = 0;
        setMove(false, false, false, false);
    }
}
