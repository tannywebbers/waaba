package com.waaba.mobile

import android.content.Context
import android.content.SharedPreferences

data class NativeSession(
    val token: String,
    val userId: String,
    val email: String,
    val name: String,
)

object SessionStore {
    private const val PREFS = "waaba_native"
    private const val KEY_TOKEN = "access_token"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_EMAIL = "profile_email"
    private const val KEY_NAME = "profile_name"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        if (!::prefs.isInitialized) {
            prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        }
    }

    fun save(token: String, userId: String, email: String, name: String) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_EMAIL, email)
            .putString(KEY_NAME, name)
            .apply()
    }

    fun current(): NativeSession? {
        val token = prefs.getString(KEY_TOKEN, "").orEmpty()
        if (token.isBlank()) return null
        return NativeSession(
            token = token,
            userId = prefs.getString(KEY_USER_ID, "").orEmpty(),
            email = prefs.getString(KEY_EMAIL, "").orEmpty(),
            name = prefs.getString(KEY_NAME, "").orEmpty(),
        )
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
