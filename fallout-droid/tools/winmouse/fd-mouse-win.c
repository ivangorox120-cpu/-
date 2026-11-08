/*
 * Fallout Droid: mouse input generated inside Wine with SendInput.
 *
 * Pointer events coming from outside (the Android compositor, gamescope, even XTEST into
 * Xwayland) never reached Fallout: the X pointer stayed at 0,0 whatever we sent. SendInput is
 * how Windows programs synthesize the mouse; Wine feeds it into the same hardware queue that
 * DirectInput, raw input and low-level hooks read, so the game sees an ordinary mouse.
 *
 * Commands are read as lines from a fifo the launcher creates (default Z:\root\.fd-mouse):
 *     m <dx> <dy>        relative motion
 *     a <x> <y>          absolute position, 0..65535 on each axis
 *     b <button> <0|1>   button release / press (1 left, 2 middle, 3 right)
 *     w <steps>          wheel, positive is up
 *
 * Build: tools/winmouse/build.sh (zig cc -target x86-windows-gnu, GUI subsystem: no console window)
 */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned long seen;

static void send_mouse(LONG dx, LONG dy, DWORD data, DWORD flags)
{
    INPUT in;
    memset(&in, 0, sizeof(in));
    in.type = INPUT_MOUSE;
    in.mi.dx = dx;
    in.mi.dy = dy;
    in.mi.mouseData = data;
    in.mi.dwFlags = flags;
    SendInput(1, &in, sizeof(in));
}

static void handle(char *line)
{
    int a = 0, b = 0;
    char cmd = line[0];
    if (!cmd) return;
    sscanf(line + 1, "%d %d", &a, &b);
    switch (cmd) {
    case 'm':
        if (a || b) send_mouse(a, b, 0, MOUSEEVENTF_MOVE);
        break;
    case 'a':
        send_mouse(a, b, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE);
        break;
    case 'b':
        if (a == 3) send_mouse(0, 0, 0, b ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP);
        else if (a == 2) send_mouse(0, 0, 0, b ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP);
        else send_mouse(0, 0, 0, b ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP);
        break;
    case 'w':
        send_mouse(0, 0, (DWORD)(a * WHEEL_DELTA), MOUSEEVENTF_WHEEL);
        break;
    default:
        return;
    }
    seen++;
    if (seen == 1 || seen % 500 == 0) {
        POINT p = {0, 0};
        HWND fg = GetForegroundWindow();
        char title[96] = "";
        GetCursorPos(&p);
        if (fg) GetWindowTextA(fg, title, sizeof(title));
        fprintf(stderr, "fd-mouse-win: %lu commands (last: %s); cursor %ld,%ld; foreground \"%s\"\n",
                seen, line, p.x, p.y, title);
        fflush(stderr);
    }
}

int main(int argc, char **argv)
{
    const char *path = argc > 1 ? argv[1] : "Z:\\root\\.fd-mouse";
    fprintf(stderr, "fd-mouse-win: reading %s\n", path);
    fflush(stderr);
    for (;;) {
        char buf[4096];
        DWORD len = 0, got;
        HANDLE h = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                               OPEN_EXISTING, 0, NULL);
        if (h == INVALID_HANDLE_VALUE) {
            Sleep(500);
            continue;
        }
        while (ReadFile(h, buf + len, sizeof(buf) - 1 - len, &got, NULL) && got > 0) {
            char *start = buf, *nl;
            len += got;
            buf[len] = 0;
            while ((nl = memchr(start, '\n', len - (DWORD)(start - buf))) != NULL) {
                *nl = 0;
                handle(start);
                start = nl + 1;
            }
            len -= (DWORD)(start - buf);
            memmove(buf, start, len);
            if (len >= sizeof(buf) - 1) len = 0;
        }
        CloseHandle(h);
        Sleep(50);
    }
    return 0;
}
