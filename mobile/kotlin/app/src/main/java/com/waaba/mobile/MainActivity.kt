package com.waaba.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

private data class TabViews(val container: Int, val icon: Int, val label: Int, val key: String)

class MainActivity : AppCompatActivity(), ScreenHost {
    private lateinit var content: FrameLayout
    private val tabs = mutableMapOf<String, NativeTab>()
    private val roots = mutableMapOf<String, View>()
    private val detailStack = mutableListOf<View>()
    private var currentTab = "chats"
    private var poller: NotificationPoller? = null
    var resultHandler: ((Int, Int, Intent?) -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        val session = SessionStore.current()
        if (session == null) {
            startLogin()
            finish()
            return
        }

        setContentView(R.layout.activity_main)
        content = findViewById(R.id.nativeContent)

        tabs["chats"] = ChatsScreen(this, this)
        tabs["contacts"] = ContactsScreen(this, this)
        tabs["settings"] = SettingsScreen(this, this)
        tabs["profile"] = ProfileScreen(this, this)

        bindTabs()
        val requested = intent.getStringExtra("openTab")
        selectTab(if (requested in tabs) requested!! else "chats")

        poller = NotificationPoller(this, session.token, session.userId)
        poller?.start()
        requestNotificationsIfNeeded()
    }

    private fun bindTabs() {
        findViewById<View>(R.id.tabChats).setOnClickListener { selectTab("chats") }
        findViewById<View>(R.id.tabContacts).setOnClickListener { selectTab("contacts") }
        findViewById<View>(R.id.tabSettings).setOnClickListener { selectTab("settings") }
        findViewById<View>(R.id.tabProfile).setOnClickListener { selectTab("profile") }
    }

    private fun selectTab(key: String) {
        currentTab = key
        detailStack.clear()
        val root = roots.getOrPut(key) { tabs.getValue(key).build() }
        content.removeAllViews()
        content.addView(root)
        tabs.getValue(key).refresh()
        updateTabTint()
    }

    private fun updateTabTint() {
        val tabViews = listOf(
            TabViews(R.id.tabChats, R.id.tabChatsIcon, R.id.tabChatsLabel, "chats"),
            TabViews(R.id.tabContacts, R.id.tabContactsIcon, R.id.tabContactsLabel, "contacts"),
            TabViews(R.id.tabSettings, R.id.tabSettingsIcon, R.id.tabSettingsLabel, "settings"),
            TabViews(R.id.tabProfile, R.id.tabProfileIcon, R.id.tabProfileLabel, "profile"),
        )
        tabViews.forEach { tabView ->
            val selected = tabView.key == currentTab
            findViewById<View>(tabView.container).isSelected = selected
            val tint = ContextCompat.getColor(
                this,
                if (selected) R.color.waaba_green else R.color.ios_tab_inactive,
            )
            findViewById<ImageView>(tabView.icon).setColorFilter(tint)
            findViewById<TextView>(tabView.label).setTextColor(tint)
        }
    }

    override fun api(action: String, args: JSONObject, onResult: (ApiResponse) -> Unit) {
        val session = SessionStore.current()
        if (session == null) {
            startLogin()
            return
        }
        ApiClient.call(action, args, session.token) { response ->
            if (response.httpCode == 401) {
                startLogin()
                return@call
            }
            onResult(response)
        }
    }

    override fun openScreen(title: String, view: View) {
        content.getChildAt(0)?.let { detailStack.add(it) }
        content.removeAllViews()
        content.addView(view)
    }

    override fun closeScreen() {
        if (detailStack.isEmpty()) {
            selectTab(currentTab)
            return
        }
        val previous = detailStack.removeAt(detailStack.lastIndex)
        content.removeAllViews()
        content.addView(previous)
    }

    override fun refreshTab(key: String) {
        tabs[key]?.refresh()
    }

    override fun startLogin() {
        SessionStore.clear()
        poller?.stop()
        poller = null
        val intent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        resultHandler?.invoke(requestCode, resultCode, data)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            detailStack.isNotEmpty() -> closeScreen()
            currentTab != "chats" -> selectTab("chats")
            else -> super.onBackPressed()
        }
    }

    override fun onDestroy() {
        poller?.stop()
        super.onDestroy()
    }

    private fun requestNotificationsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
    }
}
