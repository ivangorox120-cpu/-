# Архитектура

```
┌───────────────────── процесс лаунчера ─────────────────────┐
│ MainActivity → выбор папки, импорт рантайма, настройки       │
│ ControlsEditorActivity → controls.json                       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Intent
┌───────────────────── процесс :game ────────────────────────┐
│ GameActivity                                                │
│  ├ Performance: 60 Гц, sustained mode, приоритет            │
│  ├ подготовка: LAA → бэкап сейвов → ini → dxvk.conf → реестр │
│  ├ SurfaceView (фикс. разрешение рендера, скейл композитором)│
│  ├ ControlsOverlay ─► InputBridge ─► unix socket            │
│  ├ DisplayServer (X11, этап 2) ◄── socket                   │
│  └ GameProcess (JNI fork/exec, affinity, watchdog)          │
└──────────────────────────────┬──────────────────────────────┘
                               │ execve
   ld-linux-aarch64 → box64 → wine explorer /desktop → Fallout3.exe
                                   └─ d3d9 (DXVK) → Vulkan (Turnip)
```

## Ввод
`InputBridge` шлёт 8-байтовые пакеты в абстрактный unix-сокет `wasteland.input`.
Коды клавиш — Windows Virtual-Key; дисплейный сервер переводит их в X11 keycode
и генерирует события для Wine. Движения мыши копятся и отправляются пачкой,
чтобы ввод не отставал от кадра.

## Почему targetSdk 28
С targetSdk ≥ 29 Android запрещает исполнять файлы из каталога данных
приложения. Рантайм (glibc rootfs) распаковывается именно туда, поэтому
приложение собирается с targetSdk 28 и распространяется APK-файлом.

## Лок 60 к/с
1. Экран переключается в режим 60 Гц (или 120 Гц — каждый кадр ровно дважды).
2. `Surface.setFrameRate(60, FIXED_SOURCE)`.
3. DXVK: `d3d9.maxFrameRate = 60`, `presentInterval = 1`, Mesa WSI `fifo`.
4. В игре `iFPSClamp=0`: при редких просадках ниже 60 физика идёт в реальном времени,
   а не замедляется.
