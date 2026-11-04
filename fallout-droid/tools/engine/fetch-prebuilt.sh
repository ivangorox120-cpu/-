#!/usr/bin/env bash
# Нативные части движка (библиотеки и ассеты рантайма) берутся из закреплённого релиза
# upstream-проекта (GPL-3.0, исходники: см. NOTICE-ENGINE.md), сверяются по SHA-256
# и раскладываются для Gradle. C++/Rust при этом локально не собираются.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
. "$here/engine.env"
cache="$root/app/build/prebuilt-engine"
apk="$cache/engine.apk"
mkdir -p "$cache"
if [[ ! -f "$apk" ]] || ! echo "$ENGINE_APK_SHA256  $apk" | sha256sum -c --quiet; then
  curl -fsSL --retry 4 -o "$apk.part" "$ENGINE_APK_URL"
  echo "$ENGINE_APK_SHA256  $apk.part" | sha256sum -c --quiet
  mv "$apk.part" "$apk"
fi
rm -rf "$cache/jniLibs" "$cache/assets"
mkdir -p "$cache/jniLibs" "$cache/assets"
unzip -q -o "$apk" 'lib/arm64-v8a/*' -d "$cache/x"
mv "$cache/x/lib/arm64-v8a" "$cache/jniLibs/arm64-v8a"
# библиотеки, которые уже есть в исходниках, не дублируем
for f in "$root"/app/src/main/jniLibs/arm64-v8a/*.so; do rm -f "$cache/jniLibs/arm64-v8a/$(basename "$f")"; done
unzip -q -o "$apk" 'assets/*' -d "$cache/x"
# только то, чего нет в исходниках: собранные компоненты рантайма
( cd "$cache/x/assets" && find . -type f ) | while read -r f; do
  [[ -e "$root/app/src/main/assets/$f" ]] && continue
  case "$f" in ./licenses/xdelta3/*|./dexopt/*) continue ;; esac  # добавляется задачей stageGogNotices
  mkdir -p "$cache/assets/$(dirname "$f")"
  mv "$cache/x/assets/$f" "$cache/assets/$f"
done
rm -rf "$cache/x"
echo "prebuilt engine: $(ls "$cache/jniLibs/arm64-v8a" | wc -l) libs, $(find "$cache/assets" -type f | wc -l) assets"
