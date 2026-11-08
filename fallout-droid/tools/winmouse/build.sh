#!/bin/sh
# Builds fd-mouse.exe (32-bit, GUI subsystem so Wine opens no console window over the game).
# Needs zig: pip install ziglang
set -e
cd "$(dirname "$0")"
python3 -m ziglang cc -target x86-windows-gnu -O2 -s -Wl,--subsystem,windows \
    -o fd-mouse.exe fd-mouse-win.c -luser32
cp fd-mouse.exe ../linuxfs/overlay/usr/local/bin/fd-mouse.exe
