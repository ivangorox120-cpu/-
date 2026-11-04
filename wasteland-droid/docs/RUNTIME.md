# Пакет рантайма (rootfs.tar.gz)

Архив, который импортируется в лаунчере. Обязательная структура:

```
lib/ld-linux-aarch64.so.1                              # glibc для aarch64
lib/, usr/lib/                                         # glibc и зависимости
usr/bin/box64                                          # Box64 (aarch64, dynarec)
opt/wine/bin/wine                                      # Wine ≥ 9 x86_64, WoW64
opt/wine/lib/wine/...
opt/dxvk/x32/d3d9.dll, opt/dxvk/x64/d3d9.dll           # DXVK
usr/share/vulkan/icd.d/freedreno_icd.aarch64.json      # Mesa Turnip
usr/lib/libvulkan_freedreno.so
```

Сборка: `tools/build-runtime.sh` (Linux aarch64 или кросс-сборка в Docker).
Все компоненты — свободное ПО (Box64 — MIT, Wine — LGPL, DXVK — zlib, Mesa — MIT);
при распространении архива приложите их лицензии.
