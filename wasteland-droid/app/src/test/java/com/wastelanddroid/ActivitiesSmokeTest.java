package com.wastelanddroid;

import android.content.Intent;

import com.wastelanddroid.controls.ControlsEditorActivity;
import com.wastelanddroid.game.GraphicsActivity;
import com.wastelanddroid.mods.ModManagerActivity;
import com.wastelanddroid.util.Prefs;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** Каждый экран лаунчера должен открываться без исключений (проверка «приложение не вылетает при старте»). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {30, 34})
public class ActivitiesSmokeTest {

    /** Бесконечные анимации интерфейса в тестах мгновенно завершаются (как при «Анимации: выкл»). */
    @org.junit.Before public void noAnimations() {
        org.robolectric.util.ReflectionHelpers.callStaticMethod(android.animation.ValueAnimator.class, "setDurationScale",
                org.robolectric.util.ReflectionHelpers.ClassParameter.from(float.class, 0f));
    }

    @Test public void mainActivityStarts() {
        Robolectric.buildActivity(MainActivity.class).setup().pause().resume().stop().destroy();
    }

    @Test public void mainActivityStartsWithGameDir() {
        Prefs.get(RuntimeEnvironment.getApplication()).edit().putString("game_dir_fo3", "/nonexistent/Fallout 3").apply();
        Robolectric.buildActivity(MainActivity.class).setup();
    }

    @Test public void gameActivityStartsWithoutGame() {
        Intent i = new Intent(RuntimeEnvironment.getApplication(), com.wastelanddroid.game.GameActivity.class).putExtra("game", "fnv");
        Robolectric.buildActivity(com.wastelanddroid.game.GameActivity.class, i).setup().pause().resume();
    }

    @Test public void splashStartsAndProceeds() {
        org.robolectric.android.controller.ActivityController<SplashActivity> c = Robolectric.buildActivity(SplashActivity.class).setup();
        org.robolectric.shadows.ShadowLooper.idleMainLooper(4, java.util.concurrent.TimeUnit.SECONDS);
        Intent next = org.robolectric.Shadows.shadowOf(c.get()).getNextStartedActivity();
        org.junit.Assert.assertNotNull("после заставки должен открыться лаунчер", next);
        org.junit.Assert.assertEquals(MainActivity.class.getName(), next.getComponent().getClassName());
    }

    @Test public void savesStarts() {
        Intent i = new Intent(RuntimeEnvironment.getApplication(), com.wastelanddroid.saves.SavesActivity.class).putExtra("game", "fo3");
        Robolectric.buildActivity(com.wastelanddroid.saves.SavesActivity.class, i).setup().pause();
    }

    @Test public void saveImportFromZipAndFile() throws Exception {
        java.io.File prefix = new java.io.File(RuntimeEnvironment.getApplication().getCacheDir(), "prefix");
        com.wastelanddroid.saves.SaveStore st = new com.wastelanddroid.saves.SaveStore(com.wastelanddroid.game.GameDef.FNV, prefix);
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream z = new java.util.zip.ZipOutputStream(bo)) {
            z.putNextEntry(new java.util.zip.ZipEntry("Saves/Save 1 - Courier.fos")); z.write(new byte[]{1, 2, 3}); z.closeEntry();
            z.putNextEntry(new java.util.zip.ZipEntry("Saves/Save 1 - Courier.nvse")); z.write(new byte[]{4}); z.closeEntry();
            z.putNextEntry(new java.util.zip.ZipEntry("../../evil.fos")); z.write(new byte[]{9}); z.closeEntry();
            z.putNextEntry(new java.util.zip.ZipEntry("readme.txt")); z.write(new byte[]{5}); z.closeEntry();
        }
        int n = st.importStream("saves.zip", new java.io.ByteArrayInputStream(bo.toByteArray()));
        org.junit.Assert.assertEquals(2, n); // «evil.fos» кладётся только по имени, внутрь папки сейвов
        n = st.importStream("Quicksave.fos", new java.io.ByteArrayInputStream(new byte[]{7}));
        org.junit.Assert.assertEquals(1, n);
        org.junit.Assert.assertEquals(3, st.list().size());
        org.junit.Assert.assertTrue(new java.io.File(st.dir, "evil.fos").exists());
        org.junit.Assert.assertFalse(new java.io.File(prefix, "evil.fos").exists());
        org.junit.Assert.assertTrue(st.dir.getPath().endsWith("My Games/FalloutNV/Saves"));
    }

    @Test public void controlsEditorStarts() {
        Robolectric.buildActivity(ControlsEditorActivity.class).setup().pause().stop().destroy();
    }

    @Test public void graphicsStarts() {
        Robolectric.buildActivity(GraphicsActivity.class).setup();
    }

    @Test public void modManagerStarts() {
        java.io.File dir = new java.io.File(RuntimeEnvironment.getApplication().getCacheDir(), "game");
        new java.io.File(dir, "Data").mkdirs();
        Prefs.get(RuntimeEnvironment.getApplication()).edit().putString("game_dir_fo3", dir.getPath()).apply();
        Intent i = new Intent(RuntimeEnvironment.getApplication(), ModManagerActivity.class).putExtra("game", "fo3");
        Robolectric.buildActivity(ModManagerActivity.class, i).setup().pause();
    }
}
