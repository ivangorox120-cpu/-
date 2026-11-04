# Конвейер ассетов «Ларька»

`convert.html` + `convert.js` — конвертация присланных FBX в GLB в headless-Chromium (Playwright):
three.js FBXLoader → назначение PBR-материалов (BaseColor/Normal/Roughness/Metallic/AO) → GLTFExporter (binary, maxTextureSize 1024).

Ожидаемая структура рядом со скриптами:
- `three/package/` — npm-пакет three@0.158.0 (`npm pack three@0.158.0 && tar xzf ...`)
- `raw/<архив>/...` — распакованные архивы пользователя

Запуск: `python3 -m http.server 8765` в этой папке, затем `node convert.js radio busstop beton apartment snowtrees2`.

Особенности:
- у радио 6 текстур с одинаковым именем — различаются по индексу в архиве (`__2` metallic, `__3` basecolor, `__4` AO, `__5` roughness, без суффикса — normal);
- у панельного дома материалы в FBX привязаны неверно: текстуры назначаются по именам материалов (`204L` → `2 Windows/2_0_4.png`, ночью `2_1_4.png`), кондиционеры (Material.0xx) удалены, группы склеены (587 → 22 вызова отрисовки), отрицательная матрица исправлена, добавлены индексы;
- шаги в `walk.mp3`/`walk_snow.mp3` найдены по огибающей громкости, смещения записаны в `larek/js/audio.js`.
