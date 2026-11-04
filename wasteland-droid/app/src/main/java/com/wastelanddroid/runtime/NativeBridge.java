package com.wastelanddroid.runtime;

/** JNI-обёртка над libwasteland.so (см. app/src/main/cpp/wd_native.c). */
public final class NativeBridge {
    static { System.loadLibrary("wasteland"); }

    private NativeBridge() {}

    public static native long nativeBigCoreMask();
    public static native int nativeSpawn(String[] argv, String[] envp, String cwd, String logPath, boolean pinBigCores);
    public static native int nativeWait(int pid);
    public static native void nativeKillGroup(int pid, int signal);
    public static native long nativeGroupCpuTicks(int pgid);
}
