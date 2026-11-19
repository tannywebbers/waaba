package com.waaba.mobile

import android.content.Context
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

interface ScreenHost {
    fun api(action: String, args: JSONObject = JSONObject(), onResult: (ApiResponse) -> Unit)
    fun openScreen(title: String, view: View)
    fun closeScreen()
    fun refreshTab(key: String)
    fun startLogin()
}

interface NativeTab {
    val key: String
    fun build(): View
    fun refresh()
}

data class DetailView(val root: View, val content: LinearLayout)

internal fun buildDetail(
    context: Context,
    title: String,
    onBack: () -> Unit,
    actions: List<Pair<String, () -> Unit>> = emptyList(),
): DetailView {
    val root = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(wc(context, R.color.ios_chat_bg))
    }
    val header = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setBackgroundColor(wc(context, R.color.ios_surface))
        setPadding(dp(context, 10), dp(context, 10), dp(context, 10), dp(context, 10))
    }
    val back = TextView(context).apply {
        text = "<"
        textSize = 24f
        setTextColor(wc(context, R.color.waaba_green))
        setPadding(dp(context, 8), dp(context, 4), dp(context, 12), dp(context, 4))
        setOnClickListener { onBack() }
    }
    header.addView(back)
    header.addView(label(context, title, 17f, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    actions.forEach { (name, click) -> header.addView(actionButton(context, name, click)) }

    val content = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(context, 16), dp(context, 16), dp(context, 16), dp(context, 28))
    }
    val scroll = ScrollView(context).apply {
        addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
    root.addView(header)
    root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    return DetailView(root, content)
}

internal fun apiButton(
    context: Context,
    host: ScreenHost,
    parent: LinearLayout,
    text: String,
    action: String,
    args: JSONObject = JSONObject(),
    onDone: (() -> Unit)? = null,
) {
    parent.addView(actionButton(context, text) {
        host.api(action, args) { response ->
            if (response.ok) {
                toast(context, "$text complete")
                onDone?.invoke()
            } else {
                toast(context, response.error)
            }
        }
    })
}

internal fun renderJsonObject(content: LinearLayout, body: JSONObject) {
    val keys = body.keys()
    while (keys.hasNext()) {
        val key = keys.next()
        val value = body.opt(key)
        addItem(content, key, value?.toString().orEmpty().ifBlank { "-" })
    }
}

val ALL_API_ACTIONS = listOf(
    "bootstrap", "get_profile", "save_profile", "change_email", "change_password", "delete_account",
    "get_contacts", "search_contacts", "get_contact_details", "create_contact", "upsert_contact_full",
    "bulk_upsert_contacts", "update_contact", "bulk_update_contact_flags", "restore_contacts",
    "permanent_delete_contacts", "assign_conversation", "get_messages", "send_message", "send_text",
    "send_media", "send_template", "react_to_message", "delete_message", "clear_chat", "forward_message",
    "create_scheduled_message", "list_scheduled_messages", "update_scheduled_message",
    "cancel_scheduled_message", "upload_media_base64", "upload_sticker_base64", "list_stickers",
    "delete_sticker", "mark_read", "mark_all_read", "update_contact_flag", "get_labels", "upsert_label",
    "delete_label", "set_chat_labels", "get_templates", "list_app_templates", "upsert_app_template",
    "delete_app_template", "list_template_mappings", "save_template_mapping", "clear_template_mapping",
    "get_apps", "add_app", "rename_app", "delete_app", "list_auto_replies", "upsert_auto_reply",
    "toggle_auto_reply", "delete_auto_reply", "get_api_stats", "get_logs", "clear_logs",
    "get_preferences", "save_preferences", "register_push_token", "unregister_push_token",
    "get_settings", "save_settings", "test_whatsapp_connection", "sync_whatsapp_templates",
    "get_whatsapp_business_profile", "generate_webhook_url", "reset_whatsapp_connection",
    "list_shared_inbox", "search_users", "add_shared_user", "update_shared_user", "remove_shared_user",
    "leave_shared_inbox", "bulk_send",
)
