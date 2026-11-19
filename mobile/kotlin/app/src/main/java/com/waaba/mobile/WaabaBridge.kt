package com.waaba.mobile

import android.util.Log
import android.webkit.JavascriptInterface

class WaabaBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun onSession(json: String) {
        activity.onSessionFromWeb(json)
    }

    @JavascriptInterface
    fun log(message: String) {
        Log.d("WaabaWeb", message)
    }
}
