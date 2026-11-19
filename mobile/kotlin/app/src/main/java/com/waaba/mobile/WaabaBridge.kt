package com.waaba.mobile

import android.util.Log
import android.webkit.JavascriptInterface

class WaabaBridge {
    @JavascriptInterface
    fun log(message: String) {
        Log.d("WaabaBridge", message)
    }
}
