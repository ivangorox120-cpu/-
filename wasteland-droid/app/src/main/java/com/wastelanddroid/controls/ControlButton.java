package com.wastelanddroid.controls;

import org.json.JSONException;
import org.json.JSONObject;

/** Один элемент экранного управления. Координаты — доли экрана (0..1), размер — доля высоты экрана. */
public final class ControlButton {
    public enum Type { BUTTON, STICK, LOOK_PAD }

    public String id;
    public String label;
    public Type type;
    /** Windows Virtual-Key (0x01 ЛКМ, 0x02 ПКМ, 0x04 СКМ, 0x41.. буквы и т.д.). Для STICK — не используется. */
    public int vk;
    public float x, y;
    public float size;
    /** Прозрачность самого элемента 0..1 (умножается на глобальную). */
    public float alpha = 1f;
    /** Удерживать нажатие до повторного касания (присед, бег). */
    public boolean toggle;

    public ControlButton(String id, String label, Type type, int vk, float x, float y, float size) {
        this.id = id; this.label = label; this.type = type; this.vk = vk; this.x = x; this.y = y; this.size = size;
    }

    public JSONObject toJson() throws JSONException {
        return new JSONObject()
                .put("id", id).put("label", label).put("type", type.name()).put("vk", vk)
                .put("x", x).put("y", y).put("size", size).put("alpha", alpha).put("toggle", toggle);
    }

    public static ControlButton fromJson(JSONObject o) throws JSONException {
        ControlButton b = new ControlButton(o.getString("id"), o.optString("label", ""),
                Type.valueOf(o.optString("type", "BUTTON")), o.optInt("vk", 0),
                (float) o.getDouble("x"), (float) o.getDouble("y"), (float) o.optDouble("size", 0.14));
        b.alpha = (float) o.optDouble("alpha", 1.0);
        b.toggle = o.optBoolean("toggle", false);
        return b;
    }
}
