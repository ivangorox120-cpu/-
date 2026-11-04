/*
 * Нативная часть лаунчера:
 *  - запуск процесса рантайма (Box64 + Wine) через fork/execve с привязкой
 *    к «большим» ядрам CPU и повышенным приоритетом;
 *  - ожидание завершения / принудительное завершение группы процессов;
 *  - чтение CPU-времени процесса для сторожа зависаний.
 */
#define _GNU_SOURCE
#include <jni.h>
#include <android/log.h>
#include <sched.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <sys/resource.h>
#include <sys/wait.h>
#include <errno.h>

static int errno_is_eintr(void) { return errno == EINTR; }

#define TAG "WastelandNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)
#define JNI_FN(name) Java_com_wastelanddroid_runtime_NativeBridge_##name

static long read_long_file(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    long v = -1;
    if (fscanf(f, "%ld", &v) != 1) v = -1;
    fclose(f);
    return v;
}

/* Маска «больших» ядер: все ядра, чья максимальная частота >= 80% от максимальной по системе.
 * На SD870: 1×Cortex-A77 @3.2 + 3×A77 @2.42 → берём prime + big (4 ядра), little A55 отбрасываем. */
static unsigned long long big_core_mask(void) {
    long freq[64];
    long maxf = 0;
    int n = 0;
    for (int i = 0; i < 64; i++) {
        char p[128];
        snprintf(p, sizeof p, "/sys/devices/system/cpu/cpu%d/cpufreq/cpuinfo_max_freq", i);
        long f = read_long_file(p);
        if (f < 0) {
            snprintf(p, sizeof p, "/sys/devices/system/cpu/cpu%d", i);
            if (access(p, F_OK) != 0) break;
        }
        freq[i] = f;
        if (f > maxf) maxf = f;
        n = i + 1;
    }
    unsigned long long mask = 0;
    for (int i = 0; i < n; i++)
        if (maxf > 0 && freq[i] * 10 >= maxf * 6) mask |= 1ULL << i;
    if (__builtin_popcountll(mask) < 2) mask = 0; /* не удалось определить — без привязки */
    return mask;
}

static char **to_cstr_array(JNIEnv *env, jobjectArray arr) {
    jsize n = (*env)->GetArrayLength(env, arr);
    char **out = calloc((size_t)n + 1, sizeof(char *));
    for (jsize i = 0; i < n; i++) {
        jstring s = (jstring)(*env)->GetObjectArrayElement(env, arr, i);
        const char *c = (*env)->GetStringUTFChars(env, s, NULL);
        out[i] = strdup(c);
        (*env)->ReleaseStringUTFChars(env, s, c);
        (*env)->DeleteLocalRef(env, s);
    }
    return out;
}

static void free_cstr_array(char **a) {
    if (!a) return;
    for (char **p = a; *p; p++) free(*p);
    free(a);
}

JNIEXPORT jlong JNI_FN(nativeBigCoreMask)(JNIEnv *env, jclass cls) {
    (void)env; (void)cls;
    return (jlong)big_core_mask();
}

JNIEXPORT jint JNI_FN(nativeSpawn)(JNIEnv *env, jclass cls, jobjectArray jargv, jobjectArray jenvp,
                                   jstring jcwd, jstring jlog, jboolean pinBig) {
    (void)cls;
    char **argv = to_cstr_array(env, jargv);
    char **envp = to_cstr_array(env, jenvp);
    const char *cwd = (*env)->GetStringUTFChars(env, jcwd, NULL);
    const char *logp = (*env)->GetStringUTFChars(env, jlog, NULL);
    unsigned long long mask = pinBig ? big_core_mask() : 0;

    pid_t pid = fork();
    if (pid == 0) {
        /* Дочерний процесс: только async-signal-safe вызовы до execve. */
        setpgid(0, 0);
        int fd = open(logp, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
        if (fd >= 0) { dup2(fd, 1); dup2(fd, 2); }
        int nul = open("/dev/null", O_RDONLY);
        if (nul >= 0) dup2(nul, 0);
        if (mask) {
            cpu_set_t set;
            CPU_ZERO(&set);
            for (int i = 0; i < 64; i++) if (mask & (1ULL << i)) CPU_SET(i, &set);
            sched_setaffinity(0, sizeof set, &set);
        }
        setpriority(PRIO_PROCESS, 0, -4);
        if (chdir(cwd) != 0) _exit(126);
        execve(argv[0], argv, envp);
        _exit(127);
    }

    if (pid < 0) LOGE("fork failed");
    else LOGI("spawned pid=%d mask=0x%llx exe=%s", pid, mask, argv[0]);

    (*env)->ReleaseStringUTFChars(env, jcwd, cwd);
    (*env)->ReleaseStringUTFChars(env, jlog, logp);
    free_cstr_array(argv);
    free_cstr_array(envp);
    return (jint)pid;
}

/* Блокирующее ожидание. Возвращает код выхода, либо 128+сигнал. */
JNIEXPORT jint JNI_FN(nativeWait)(JNIEnv *env, jclass cls, jint pid) {
    (void)env; (void)cls;
    int st = 0;
    while (waitpid((pid_t)pid, &st, 0) < 0) {
        if (errno_is_eintr()) continue;
        return -1;
    }
    if (WIFEXITED(st)) return WEXITSTATUS(st);
    if (WIFSIGNALED(st)) return 128 + WTERMSIG(st);
    return -1;
}

JNIEXPORT void JNI_FN(nativeKillGroup)(JNIEnv *env, jclass cls, jint pid, jint sig) {
    (void)env; (void)cls;
    kill(-(pid_t)pid, sig);
    kill((pid_t)pid, sig);
}

/* Суммарное CPU-время (utime+stime, в тиках) всех процессов группы pid.
 * Wine порождает wineserver и сам процесс игры, поэтому смотрим всю группу. */
JNIEXPORT jlong JNI_FN(nativeGroupCpuTicks)(JNIEnv *env, jclass cls, jint pgid) {
    (void)env; (void)cls;
    DIR *d = opendir("/proc");
    if (!d) return -1;
    long long total = 0;
    struct dirent *e;
    char path[64], buf[1024];
    while ((e = readdir(d)) != NULL) {
        if (e->d_name[0] < '0' || e->d_name[0] > '9') continue;
        snprintf(path, sizeof path, "/proc/%s/stat", e->d_name);
        int fd = open(path, O_RDONLY | O_CLOEXEC);
        if (fd < 0) continue;
        ssize_t r = read(fd, buf, sizeof buf - 1);
        close(fd);
        if (r <= 0) continue;
        buf[r] = 0;
        char *p = strrchr(buf, ')');
        if (!p) continue;
        /* после ')' : state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt utime stime */
        char state; int ppid, pgrp; unsigned long ut, stt;
        if (sscanf(p + 2, "%c %d %d %*d %*d %*d %*u %*u %*u %*u %*u %lu %lu",
                   &state, &ppid, &pgrp, &ut, &stt) == 5 && pgrp == pgid)
            total += (long long)ut + (long long)stt;
    }
    closedir(d);
    return (jlong)total;
}
