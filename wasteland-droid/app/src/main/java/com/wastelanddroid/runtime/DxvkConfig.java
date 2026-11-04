package com.wastelanddroid.runtime;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** dxvk.conf: жёсткий лок 60 к/с и настройки, снижающие статтеры компиляции шейдеров. */
public final class DxvkConfig {
    private DxvkConfig() {}

    public static File write(File dir, boolean hud) throws IOException {
        String conf = String.join("\n",
                "# Сгенерировано Wasteland Droid",
                "# Лок 60 к/с: движок завязывает физику Havok и скрипты на время кадра,",
                "# выше 60 к/с ломаются физика, двери, лифты и анимации.",
                "d3d9.maxFrameRate = 60",
                "d3d9.presentInterval = 1",
                "d3d9.numBackBuffers = 2",
                "# Игра 2008 г. не знает про >4 ГБ VRAM и может переполнить счётчик — ограничиваем.",
                "d3d9.maxAvailableMemory = 2048",
                "# Компиляция пайплайнов в фоне на «больших» ядрах.",
                "dxvk.numCompilerThreads = 3",
                "dxvk.enableGraphicsPipelineLibrary = Auto",
                "d3d9.deferSurfaceCreation = True",
                "d3d9.floatEmulation = Strict",
                "d3d9.samplerAnisotropy = -1",
                "dxvk.hud = " + (hud ? "fps,frametimes" : ""),
                "");
        dir.mkdirs();
        File f = new File(dir, "dxvk.conf");
        Files.write(f.toPath(), conf.getBytes(StandardCharsets.UTF_8));
        return f;
    }
}
