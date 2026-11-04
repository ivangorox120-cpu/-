#!/usr/bin/env bash
# Сборка rootfs.tar.gz для Wasteland Droid. Запускать на aarch64 Linux (или в Docker --platform linux/arm64).
# Версии зафиксированы, чтобы рантайм был воспроизводимым.
set -euo pipefail

BOX64_REF="${BOX64_REF:-v0.3.6}"
WINE_URL="${WINE_URL:?укажите URL сборки Wine x86_64 (WoW64), например из Kron4ek/Wine-Builds}"
DXVK_VER="${DXVK_VER:-2.5.3}"
MESA_REF="${MESA_REF:-mesa-25.0.0}"

OUT="$(pwd)/out/rootfs"
WORK="$(pwd)/out/work"
rm -rf "$OUT" "$WORK"; mkdir -p "$OUT"/{lib,usr/bin,usr/lib,opt,usr/share/vulkan/icd.d} "$WORK"

echo "== glibc"
cp -L /lib/ld-linux-aarch64.so.1 "$OUT/lib/"
for l in libc.so.6 libm.so.6 libdl.so.2 libpthread.so.0 librt.so.1 libresolv.so.2 libgcc_s.so.1 libstdc++.so.6; do
  cp -L "$(ldconfig -p | awk -v n="$l" '$1==n && /aarch64|AArch64/ {print $NF; exit}')" "$OUT/lib/" || true
done

echo "== Box64 $BOX64_REF"
git clone --depth 1 -b "$BOX64_REF" https://github.com/ptitSeb/box64 "$WORK/box64"
cmake -S "$WORK/box64" -B "$WORK/box64/build" -DARM_DYNAREC=ON -DCMAKE_BUILD_TYPE=RelWithDebInfo -DSD8G2=ON
cmake --build "$WORK/box64/build" -j"$(nproc)"
cp "$WORK/box64/build/box64" "$OUT/usr/bin/"

echo "== Wine"
curl -fL "$WINE_URL" -o "$WORK/wine.tar.xz"
mkdir -p "$OUT/opt/wine" && tar -xf "$WORK/wine.tar.xz" -C "$OUT/opt/wine" --strip-components=1

echo "== DXVK $DXVK_VER"
curl -fL "https://github.com/doitsujin/dxvk/releases/download/v$DXVK_VER/dxvk-$DXVK_VER.tar.gz" -o "$WORK/dxvk.tgz"
mkdir -p "$OUT/opt/dxvk" && tar -xf "$WORK/dxvk.tgz" -C "$OUT/opt/dxvk" --strip-components=1

echo "== Mesa Turnip $MESA_REF"
git clone --depth 1 -b "$MESA_REF" https://gitlab.freedesktop.org/mesa/mesa.git "$WORK/mesa"
meson setup "$WORK/mesa/build" "$WORK/mesa" -Dgallium-drivers= -Dvulkan-drivers=freedreno \
  -Dfreedreno-kmds=kgsl -Dplatforms=x11 -Dbuildtype=release -Dprefix=/usr
ninja -C "$WORK/mesa/build"
DESTDIR="$OUT" ninja -C "$WORK/mesa/build" install

echo "== упаковка"
tar -C "$OUT" -czf out/rootfs.tar.gz .
echo "Готово: out/rootfs.tar.gz"
