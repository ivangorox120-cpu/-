package com.wastelanddroid.runtime;

import android.view.Surface;

/**
 * Дисплейный сервер: принимает кадры Wine/DXVK и выводит их на Android Surface,
 * а также принимает ввод из {@link InputBridge}.
 *
 * Целевая реализация — X11-сервер с прямым выводом Vulkan-swapchain (DRI3/Present +
 * Turnip KGSL) в Surface, без лишнего копирования кадра. См. docs/ARCHITECTURE.md.
 */
public interface DisplayServer {
    /** @return значение переменной DISPLAY для Wine. */
    String start(Surface surface, int width, int height) throws Exception;
    void resize(Surface surface, int width, int height);
    void stop();

    /** Возвращает доступную реализацию или null, если в сборке её нет. */
    static DisplayServer create() {
        try {
            Class<?> c = Class.forName("com.wastelanddroid.runtime.x11.X11DisplayServer");
            return (DisplayServer) c.getDeclaredConstructor().newInstance();
        } catch (ReflectiveOperationException e) {
            return null;
        }
    }
}
