package com.waaba.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.ByteArrayInputStream

private data class TabViews(val container: Int, val icon: Int, val label: Int, val key: String)

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var profileOverlay: View
    private lateinit var tabBar: View
    private lateinit var tabDivider: View
    private var currentTab = "chats"
    private var hasSession = false
    private var poller: NotificationPoller? = null
    private val prefs by lazy { getSharedPreferences("waaba_native", Context.MODE_PRIVATE) }
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        profileOverlay = findViewById(R.id.profileOverlay)
        tabBar = findViewById(R.id.tabBar)
        tabDivider = findViewById(R.id.tabDivider)

        bindViews()
        configureWebView()
        webView.loadUrl(WebAppConfig.BASE_URL)
        updateProfile()
    }

    private fun bindViews() {
        findViewById<View>(R.id.tabChats).setOnClickListener { selectTab("chats") }
        findViewById<View>(R.id.tabContacts).setOnClickListener { selectTab("contacts") }
        findViewById<View>(R.id.tabSettings).setOnClickListener { selectTab("settings") }
        findViewById<View>(R.id.tabProfile).setOnClickListener { selectTab("profile") }

        findViewById<View>(R.id.profileRowAccount).setOnClickListener { openSettingsSection("Account") }
        findViewById<View>(R.id.profileRowNotifications).setOnClickListener { openSettingsSection("Notifications") }
        findViewById<View>(R.id.profileRowAppearance).setOnClickListener { openSettingsSection("Appearance") }
        findViewById<View>(R.id.profileRowApi).setOnClickListener { openSettingsSection("WhatsApp API") }
        findViewById<View>(R.id.profileRowShared).setOnClickListener { openSettingsSection("Shared Inbox") }
        findViewById<View>(R.id.profileRowAutoReply).setOnClickListener { openSettingsSection("Auto Reply") }
        findViewById<View>(R.id.profileLogout).setOnClickListener { logout() }
        updateTabTint()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString WaabaAndroid/1.0"
        }

        webView.addJavascriptInterface(WaabaBridge(this), WebAppConfig.BRIDGE_NAME)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val host = Uri.parse(WebAppConfig.BASE_URL).host ?: return null
                val uri = request.url
                if (uri.host != host) return null

                val path = uri.path ?: "/"
                val staticPrefixes = listOf("/assets/", "/icons/", "/fonts/", "/sounds/")
                val staticFiles = setOf(
                    "/favicon.ico", "/manifest.webmanifest", "/firebase-messaging-sw.js", "/fcm-sw.js",
                    "/pwa-192x192.png", "/pwa-512x512.png"
                )
                val isStatic = staticPrefixes.any { path.startsWith(it) } || path in staticFiles
                if (!isStatic) return assetResponse("assets/web/index.html", false)
                return assetResponse(path.trimStart('/'), true)
            }

            override fun onPageFinished(view: WebView, url: String) {
                injectThemeAndSession()
                handler.postDelayed({ syncTab() }, 300)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = Uri.parse(WebAppConfig.BASE_URL).host ?: return false
                if (request.url.host == host) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (error: Exception) {
                    Log.w("WaabaWeb", "Cannot open external link", error)
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }
    }

    private fun assetResponse(path: String, isStatic: Boolean): WebResourceResponse {
        val normalized = path.trimStart('/')
        val candidates = if (isStatic) listOf("web/$normalized", normalized) else listOf(normalized)
        for (candidate in candidates) {
            try {
                return WebResourceResponse(mimeType(candidate), "utf-8", assets.open(candidate))
            } catch (error: Exception) {
                Log.d("WaabaWeb", "Asset missing: $candidate")
            }
        }
        val empty = ByteArrayInputStream(ByteArray(0))
        return WebResourceResponse(if (isStatic) mimeType(normalized) else "text/html", "utf-8", empty)
    }

    private fun mimeType(path: String): String = when {
        path.endsWith(".html") -> "text/html"
        path.endsWith(".js") -> "application/javascript"
        path.endsWith(".css") -> "text/css"
        path.endsWith(".json") || path.endsWith(".webmanifest") -> "application/json"
        path.endsWith(".png") -> "image/png"
        path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
        path.endsWith(".svg") -> "image/svg+xml"
        path.endsWith(".webp") -> "image/webp"
        path.endsWith(".woff2") -> "font/woff2"
        path.endsWith(".ttf") -> "font/ttf"
        path.endsWith(".mp3") -> "audio/mpeg"
        path.endsWith(".ogg") -> "audio/ogg"
        path.endsWith(".wav") -> "audio/wav"
        else -> "application/octet-stream"
    }

    private fun injectThemeAndSession() {
        val css = JSONObject.quote(WebAppConfig.WAABA_CSS)
        val script = """
            (function () {
              var style = document.getElementById('waaba-theme-style');
              if (!style) {
                style = document.createElement('style');
                style.id = 'waaba-theme-style';
                style.textContent = $css;
                document.head.appendChild(style);
              }
              Object.keys(localStorage).forEach(function (key) {
                if (key.indexOf('-auth-token') === -1) return;
                try {
                  var session = JSON.parse(localStorage.getItem(key));
                  if (!session || !session.access_token) return;
                  var user = session.user || {};
                  var metadata = user.user_metadata || {};
                  window.WaabaBridge.onSession(JSON.stringify({
                    accessToken: session.access_token,
                    userId: user.id || '',
                    email: user.email || '',
                    name: metadata.name || metadata.full_name || ''
                  }));
                } catch (error) {}
              });
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun syncTab() {
        if (!hasSession || currentTab == "profile") return
        clickText(tabLabel(currentTab))
    }

    private fun tabLabel(tab: String): String = when (tab) {
        "contacts" -> "Contacts"
        "settings" -> "Settings"
        else -> "Chats"
    }

    private fun clickText(label: String) {
        val safeLabel = JSONObject.quote(label)
        val script = """
            (function () {
              var label = $safeLabel;
              var nodes = Array.prototype.slice.call(
                document.querySelectorAll('button, a, [role="tab"], [role="button"], span, div')
              );
              for (var i = 0; i < nodes.length; i += 1) {
                var node = nodes[i];
                var text = ((node.innerText || node.textContent || '') + '').trim();
                if (text === label && typeof node.click === 'function') {
                  node.click();
                  return true;
                }
              }
              return false;
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun selectTab(tab: String) {
        if (!hasSession) return
        currentTab = tab
        profileOverlay.visibility = if (tab == "profile") View.VISIBLE else View.GONE
        webView.visibility = View.VISIBLE
        updateTabTint()
        if (tab != "profile") {
            handler.postDelayed({ clickText(tabLabel(tab)) }, 120)
        }
    }

    private fun updateTabTint() {
        val tabs = listOf(
            TabViews(R.id.tabChats, R.id.tabChatsIcon, R.id.tabChatsLabel, "chats"),
            TabViews(R.id.tabContacts, R.id.tabContactsIcon, R.id.tabContactsLabel, "contacts"),
            TabViews(R.id.tabSettings, R.id.tabSettingsIcon, R.id.tabSettingsLabel, "settings"),
            TabViews(R.id.tabProfile, R.id.tabProfileIcon, R.id.tabProfileLabel, "profile")
        )
        tabs.forEach { tabView ->
            val selected = tabView.key == currentTab
            findViewById<View>(tabView.container).isSelected = selected
            val color = ContextCompat.getColor(
                this,
                if (selected) R.color.waaba_green else R.color.ios_tab_inactive
            )
            findViewById<ImageView>(tabView.icon).setColorFilter(color)
            findViewById<TextView>(tabView.label).setTextColor(color)
        }
    }

    private fun openSettingsSection(label: String) {
        selectTab("settings")
        handler.postDelayed({ clickText(label) }, 400)
    }

    fun onSessionFromWeb(json: String) {
        try {
            val data = JSONObject(json)
            val token = data.optString("accessToken")
            val id = data.optString("userId")
            val email = data.optString("email")
            val name = data.optString("name")
            if (token.isBlank()) return

            showSessionUI()
            val previousToken = prefs.getString("access_token", "")
            prefs.edit()
                .putString("access_token", token)
                .putString("user_id", id)
                .putString("profile_email", email)
                .putString("profile_name", name)
                .apply()

            runOnUiThread { updateProfile() }
            if (token != previousToken) {
                poller?.stop()
                poller = NotificationPoller(this, token, id)
                poller?.start()
                requestNotificationsIfNeeded()
            }
        } catch (error: Exception) {
            Log.w("WaabaSession", "Invalid session payload", error)
        }
    }

    private fun showSessionUI() {
        if (hasSession) return
        hasSession = true
        tabBar.visibility = View.VISIBLE
        tabDivider.visibility = View.VISIBLE
        updateTabTint()
    }

    private fun updateProfile() {
        val name = prefs.getString("profile_name", "").orEmpty().ifBlank { "Waaba user" }
        val email = prefs.getString("profile_email", "").orEmpty().ifBlank { "Signed in" }
        findViewById<TextView>(R.id.profileName).text = name
        findViewById<TextView>(R.id.profileEmail).text = email
        findViewById<TextView>(R.id.profileAvatar).text = name.first().uppercase()
    }

    private fun logout() {
        webView.evaluateJavascript("(function(){try{localStorage.clear()}catch(e){}return true})()", null)
        prefs.edit().clear().apply()
        poller?.stop()
        poller = null
        hasSession = false
        currentTab = "chats"
        profileOverlay.visibility = View.GONE
        tabBar.visibility = View.GONE
        tabDivider.visibility = View.GONE
        webView.loadUrl(WebAppConfig.BASE_URL)
        Toast.makeText(this, "Signed out", Toast.LENGTH_SHORT).show()
    }

    private fun requestNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            profileOverlay.visibility == View.VISIBLE -> selectTab("chats")
            webView.canGoBack() -> webView.goBack()
            else -> super.onBackPressed()
        }
    }

    override fun onDestroy() {
        poller?.stop()
        super.onDestroy()
    }
}
