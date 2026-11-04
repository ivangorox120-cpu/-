package com.wastelanddroid.runtime;

import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.util.Log;

import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Передача ввода в дисплейный сервер рантайма (см. docs/ARCHITECTURE.md, «Ввод»).
 *
 * Протокол: пакеты по 8 байт (little-endian):
 *   u8 type | u8 flags | u16 code | i16 a | i16 b
 *   type 1 = клавиша (code = Windows Virtual-Key, a = 1 нажата / 0 отпущена)
 *   type 2 = относительное движение мыши (a = dx, b = dy)
 *   type 3 = колесо (a = шаги)
 * Движения мыши копятся и отправляются одним пакетом — без очереди из сотен мелких событий.
 */
public final class InputBridge {
    private static final String TAG = "InputBridge";
    public static final String SOCKET = "wasteland.input";

    private final BlockingQueue<byte[]> queue = new ArrayBlockingQueue<>(512);
    private final AtomicInteger accDx = new AtomicInteger(), accDy = new AtomicInteger();
    private volatile boolean running = true;
    private final Thread thread;

    public InputBridge() {
        thread = new Thread(this::loop, "input-bridge");
        thread.setPriority(Thread.MAX_PRIORITY);
        thread.start();
    }

    public void key(int vk, boolean down) { queue.offer(packet(1, vk, down ? 1 : 0, 0)); }

    public void mouseMove(float dx, float dy) {
        accDx.addAndGet(Math.round(dx));
        accDy.addAndGet(Math.round(dy));
        queue.offer(new byte[0]); // «будильник»: накопленное движение будет отправлено
    }

    public void wheel(int steps) { queue.offer(packet(3, 0, steps, 0)); }

    private static byte[] packet(int type, int code, int a, int b) {
        return new byte[]{(byte) type, 0, (byte) code, (byte) (code >> 8),
                (byte) a, (byte) (a >> 8), (byte) b, (byte) (b >> 8)};
    }

    private void loop() {
        LocalSocket sock = null;
        OutputStream out = null;
        while (running) {
            try {
                byte[] p = queue.take();
                if (!running) break;
                if (out == null) {
                    sock = new LocalSocket();
                    sock.connect(new LocalSocketAddress(SOCKET, LocalSocketAddress.Namespace.ABSTRACT));
                    out = sock.getOutputStream();
                }
                int dx = accDx.getAndSet(0), dy = accDy.getAndSet(0);
                while (dx != 0 || dy != 0) {
                    int sx = Math.max(-32768, Math.min(32767, dx)), sy = Math.max(-32768, Math.min(32767, dy));
                    out.write(packet(2, 0, sx, sy));
                    dx -= sx; dy -= sy;
                }
                if (p.length > 0) out.write(p);
            } catch (InterruptedException e) {
                break;
            } catch (IOException e) {
                // Сервер ещё не поднялся или перезапускается — событие теряется, переподключимся позже.
                Log.d(TAG, "input socket: " + e.getMessage());
                try { if (sock != null) sock.close(); } catch (IOException ignored) {}
                sock = null; out = null;
            }
        }
        try { if (sock != null) sock.close(); } catch (IOException ignored) {}
    }

    public void close() { running = false; thread.interrupt(); }
}
