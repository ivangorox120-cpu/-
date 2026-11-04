package com.wastelanddroid.controls;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

/** Раскладка экранного управления + глобальные масштаб/прозрачность/чувствительность. */
public final class ControlLayout {
    public final List<ControlButton> buttons = new ArrayList<>();
    public float globalScale = 1f;
    public float globalAlpha = 0.55f;
    public float lookSensitivity = 1.0f;
    public boolean haptics = true;

    private static File file(Context c) { return new File(c.getFilesDir(), "controls.json"); }

    /** Раскладка по умолчанию под стандартные клавиши ПК-версии игры. */
    public static ControlLayout defaults() {
        ControlLayout l = new ControlLayout();
        List<ControlButton> b = l.buttons;
        b.add(new ControlButton("move", "", ControlButton.Type.STICK, 0, 0.13f, 0.70f, 0.38f));
        b.add(new ControlButton("look", "", ControlButton.Type.LOOK_PAD, 0, 0.62f, 0.50f, 0.0f));
        b.add(new ControlButton("fire", "Огонь", ControlButton.Type.BUTTON, 0x01, 0.90f, 0.62f, 0.17f));
        b.add(new ControlButton("aim", "Цель", ControlButton.Type.BUTTON, 0x02, 0.78f, 0.80f, 0.14f));
        b.add(new ControlButton("use", "E", ControlButton.Type.BUTTON, 0x45, 0.78f, 0.45f, 0.12f));
        b.add(new ControlButton("jump", "Прыг", ControlButton.Type.BUTTON, 0x20, 0.92f, 0.85f, 0.13f));
        b.add(new ControlButton("reload", "R", ControlButton.Type.BUTTON, 0x52, 0.68f, 0.88f, 0.11f));
        ControlButton sneak = new ControlButton("sneak", "Присед", ControlButton.Type.BUTTON, 0x11, 0.30f, 0.88f, 0.11f);
        sneak.toggle = true;
        b.add(sneak);
        b.add(new ControlButton("vats", "V.A.T.S", ControlButton.Type.BUTTON, 0x56, 0.90f, 0.40f, 0.12f));
        b.add(new ControlButton("pipboy", "Pip", ControlButton.Type.BUTTON, 0x09, 0.05f, 0.10f, 0.11f));
        b.add(new ControlButton("menu", "Esc", ControlButton.Type.BUTTON, 0x1B, 0.95f, 0.08f, 0.10f));
        b.add(new ControlButton("pov", "Вид", ControlButton.Type.BUTTON, 0x46, 0.84f, 0.08f, 0.10f));
        b.add(new ControlButton("grab", "Z", ControlButton.Type.BUTTON, 0x5A, 0.68f, 0.70f, 0.10f));
        b.add(new ControlButton("qsave", "F5", ControlButton.Type.BUTTON, 0x74, 0.16f, 0.10f, 0.09f));
        b.add(new ControlButton("qload", "F9", ControlButton.Type.BUTTON, 0x78, 0.26f, 0.10f, 0.09f));
        b.add(new ControlButton("walk", "Шаг", ControlButton.Type.BUTTON, 0x14, 0.30f, 0.70f, 0.10f));
        b.add(new ControlButton("wait", "T", ControlButton.Type.BUTTON, 0x54, 0.36f, 0.10f, 0.09f));
        b.add(new ControlButton("hot1", "1", ControlButton.Type.BUTTON, 0x31, 0.46f, 0.08f, 0.08f));
        b.add(new ControlButton("hot2", "2", ControlButton.Type.BUTTON, 0x32, 0.54f, 0.08f, 0.08f));
        b.add(new ControlButton("hot3", "3", ControlButton.Type.BUTTON, 0x33, 0.62f, 0.08f, 0.08f));
        b.add(new ControlButton("enter", "Ввод", ControlButton.Type.BUTTON, 0x0D, 0.72f, 0.08f, 0.09f));
        return l;
    }

    public static ControlLayout load(Context c) {
        File f = file(c);
        if (!f.exists()) return defaults();
        try {
            JSONObject o = new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8));
            ControlLayout l = new ControlLayout();
            l.globalScale = (float) o.optDouble("globalScale", 1.0);
            l.globalAlpha = (float) o.optDouble("globalAlpha", 0.55);
            l.lookSensitivity = (float) o.optDouble("lookSensitivity", 1.0);
            l.haptics = o.optBoolean("haptics", true);
            JSONArray arr = o.getJSONArray("buttons");
            for (int i = 0; i < arr.length(); i++) l.buttons.add(ControlButton.fromJson(arr.getJSONObject(i)));
            return l;
        } catch (IOException | JSONException e) {
            return defaults(); // повреждённый файл не должен мешать запуску
        }
    }

    public void save(Context c) throws IOException {
        try {
            JSONArray arr = new JSONArray();
            for (ControlButton b : buttons) arr.put(b.toJson());
            JSONObject o = new JSONObject()
                    .put("version", 1).put("globalScale", globalScale).put("globalAlpha", globalAlpha)
                    .put("lookSensitivity", lookSensitivity).put("haptics", haptics).put("buttons", arr);
            File f = file(c), tmp = new File(f.getPath() + ".tmp");
            Files.write(tmp.toPath(), o.toString(2).getBytes(StandardCharsets.UTF_8));
            if (!tmp.renameTo(f)) throw new IOException("rename failed");
        } catch (JSONException e) {
            throw new IOException(e);
        }
    }

    public ControlButton find(String id) {
        for (ControlButton b : buttons) if (b.id.equals(id)) return b;
        return null;
    }
}
