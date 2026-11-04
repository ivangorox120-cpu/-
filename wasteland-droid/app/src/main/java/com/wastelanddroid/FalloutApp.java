package com.wastelanddroid;

import android.app.Application;

import com.wastelanddroid.util.Ui;

public final class FalloutApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        Ui.init(this);
    }
}
