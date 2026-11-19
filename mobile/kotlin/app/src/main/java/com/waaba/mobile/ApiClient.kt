package com.waaba.mobile

import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

data class ApiResponse(
    val ok: Boolean,
    val body: JSONObject,
    val httpCode: Int = 200,
) {
    val error: String
        get() = body.optString("error").ifBlank {
            body.optString("msg").ifBlank {
                body.optString("error_description").ifBlank {
                    body.optString("message").ifBlank { if (ok) "" else "Request failed ($httpCode)" }
                }
            }
        }

    fun array(key: String): JSONArray = body.optJSONArray(key) ?: JSONArray()

    fun obj(key: String): JSONObject = body.optJSONObject(key) ?: JSONObject()

    fun text(key: String, fallback: String = ""): String =
        if (body.has(key) && !body.isNull(key)) body.optString(key, fallback) else fallback
}

object ApiClient {
    private val executor = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())

    fun login(email: String, password: String, callback: (ApiResponse) -> Unit) {
        val payload = JSONObject()
            .put("email", email)
            .put("password", password)
        val headers = mapOf(
            "Content-Type" to "application/json",
            "apikey" to BuildConfig.SUPABASE_PUBLISHABLE_KEY,
            "Authorization" to "Bearer ${BuildConfig.SUPABASE_PUBLISHABLE_KEY}",
        )
        post("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=password", payload, headers, callback, true)
    }

    fun call(action: String, args: JSONObject, token: String, callback: (ApiResponse) -> Unit) {
        val payload = JSONObject().put("action", action)
        val keys = args.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            payload.put(key, args.opt(key))
        }
        val headers = mapOf(
            "Content-Type" to "application/json",
            "apikey" to BuildConfig.SUPABASE_PUBLISHABLE_KEY,
            "Authorization" to "Bearer $token",
        )
        post("${BuildConfig.SUPABASE_URL}/functions/v1/mobile-api", payload, headers, callback, false)
    }

    private fun post(
        endpoint: String,
        payload: JSONObject,
        headers: Map<String, String>,
        callback: (ApiResponse) -> Unit,
        saveSession: Boolean,
    ) {
        executor.execute {
            var response = ApiResponse(false, JSONObject().put("error", "Network error"), 0)
            var connection: HttpURLConnection? = null
            try {
                connection = URL(endpoint).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 20_000
                connection.readTimeout = 30_000
                connection.doOutput = true
                headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }

                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                val body = try {
                    JSONObject(text)
                } catch (error: Exception) {
                    JSONObject().put("error", text.ifBlank { "Invalid response from server" })
                }
                val successFlag = if (body.has("success")) body.optBoolean("success") else body.has("access_token")
                response = ApiResponse(code in 200..299 && successFlag, body, code)

                if (saveSession && response.ok) {
                    val user = body.optJSONObject("user") ?: JSONObject()
                    val metadata = user.optJSONObject("user_metadata") ?: JSONObject()
                    val name = metadata.optString("name")
                        .ifBlank { metadata.optString("full_name") }
                        .ifBlank { body.optString("name") }
                    SessionStore.save(
                        token = body.optString("access_token"),
                        userId = user.optString("id"),
                        email = user.optString("email"),
                        name = name,
                    )
                }
            } catch (error: Exception) {
                response = ApiResponse(false, JSONObject().put("error", error.message ?: "Network error"), 0)
            } finally {
                connection?.disconnect()
            }
            main.post { callback(response) }
        }
    }
}
