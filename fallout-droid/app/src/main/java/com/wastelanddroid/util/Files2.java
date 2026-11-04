package com.wastelanddroid.util;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public final class Files2 {
    private Files2() {}

    public static void copy(File src, File dst) throws IOException {
        File parent = dst.getParentFile();
        if (parent != null) parent.mkdirs();
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            copy(in, out);
        }
    }

    public static long copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[1 << 16];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); total += n; }
        return total;
    }

    public static void copyTree(File src, File dst) throws IOException {
        if (src.isDirectory()) {
            dst.mkdirs();
            String[] names = src.list();
            if (names == null) return;
            for (String n : names) copyTree(new File(src, n), new File(dst, n));
        } else {
            copy(src, dst);
        }
    }

    public static void deleteTree(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteTree(k);
        }
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /** Поиск файла без учёта регистра (Windows-игры часто расходятся в регистре имён). */
    public static File findCaseInsensitive(File dir, String relPath) {
        File cur = dir;
        for (String part : relPath.split("/")) {
            if (cur == null || !cur.isDirectory()) return null;
            File exact = new File(cur, part);
            if (exact.exists()) { cur = exact; continue; }
            File found = null;
            String[] names = cur.list();
            if (names != null) for (String n : names) if (n.equalsIgnoreCase(part)) { found = new File(cur, n); break; }
            cur = found;
        }
        return cur;
    }
}
