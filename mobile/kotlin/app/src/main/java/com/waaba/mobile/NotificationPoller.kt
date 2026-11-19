package com.waaba.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class NotificationPoller(
    private val context: Context,
    private val accessToken: String,
    private val userId: String,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("waaba_native", Context.MODE_PRIVATE)
    private var running = false
    private lateinit var pollRunnable: Runnable

    init {
        pollRunnable = Runnable {
            Thread {
                try {
                    poll()
                } catch (error: Exception) {
                    android.util.Log.w("WaabaNotifications", "Poll failed", error)
                } finally {
                    if (running) handler.postDelayed(pollRunnable, POLL_INTERVAL)
                }
            }.start()
        }
    }

    fun start() {
        if (running || accessToken.isBlank() || userId.isBlank()) return
        running = true
        createChannel()
        pollRunnable.run()
    }

    fun stop() {
        running = false
        handler.removeCallbacks(pollRunnable)
    }

    private fun poll() {
        val endpoint = "${BuildConfig.SUPABASE_URL}/rest/v1/messages" +
            "?select=id,contact_id,content,is_outgoing,created_at" +
            "&is_outgoing=eq.false&status=neq.read&order=created_at.desc&limit=20"
        val response = get(endpoint) ?: return
        val rows = JSONArray(response)
        val ids = mutableSetOf<String>()
        val recent = mutableListOf<Pair<String, String>>()

        for (index in 0 until rows.length()) {
            val row = rows.getJSONObject(index)
            val id = row.optString("id")
            if (id.isBlank()) continue
            ids.add(id)
            val content = row.optString("content").ifBlank { "New WhatsApp message" }
            val contactId = row.optString("contact_id")
            recent.add(id to "[$contactId] $content")
        }

        val seededKey = "notif_seeded_$userId"
        val idsKey = "notif_ids_$userId"
        val known = prefs.getStringSet(idsKey, emptySet())?.toMutableSet() ?: mutableSetOf()
        if (!prefs.getBoolean(seededKey, false)) {
            prefs.edit().putStringSet(idsKey, ids).putBoolean(seededKey, true).apply()
            return
        }

        val fresh = recent.filter { !known.contains(it.first) }
        fresh.forEach { showNotification(it.first, it.second) }
        known.addAll(fresh.map { it.first })
        if (known.size > 100) {
            known.retainAll(ids)
        }
        prefs.edit().putStringSet(idsKey, known).apply()
    }

    private fun get(endpoint: String): String? {
        val connection = URL(endpoint).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
        connection.setRequestProperty("Authorization", "Bearer $accessToken")
        return try {
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            stream?.bufferedReader()?.use { it.readText() }
        } catch (error: IOException) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Waaba messages", NotificationManager.IMPORTANCE_DEFAULT)
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun showNotification(id: String, text: String) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openTab", "chats")
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val pendingIntent = PendingIntent.getActivity(context, id.hashCode(), intent, flags)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("Waaba")
            .setContentText(text)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        NotificationManagerCompat.from(context).notify(id.hashCode(), notification)
    }

    companion object {
        private const val POLL_INTERVAL = 30_000L
        private const val CHANNEL_ID = "waaba_messages"
    }
}
