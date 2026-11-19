package com.waaba.mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.ArrayAdapter
import org.json.JSONArray
import org.json.JSONObject

class ChatsScreen(private val activity: MainActivity, private val host: ScreenHost) : NativeTab {
    override val key = "chats"

    private val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(wc(activity, R.color.ios_chat_bg))
    }
    private lateinit var listContainer: LinearLayout
    private lateinit var searchInput: EditText
    private lateinit var labelSpinner: Spinner
    private lateinit var statusText: TextView
    private var labelNames = mutableListOf("All labels")
    private var labels = JSONArray()
    private var contacts = JSONArray()
    private var messages = JSONArray()
    private var chatLabels = JSONArray()

    private data class ChatRow(
        val contact: JSONObject,
        val preview: String,
        val time: String,
        val unread: Int,
    )

    override fun build(): View {
        val titleRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(wc(activity, R.color.ios_header))
            setPadding(dp(activity, 16), dp(activity, 14), dp(activity, 12), dp(activity, 10))
        }
        titleRow.addView(label(activity, "Chats", 22f, true))
        titleRow.addView(actionButton(activity, "Labels") { openLabels() }, LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f,
        ).apply { gravity = Gravity.END })
        root.addView(titleRow)

        searchInput = field(activity, "Search name, phone or message")
        root.addView(searchInput, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { setMargins(dp(activity, 16), dp(activity, 10), dp(activity, 16), 0) })
        searchInput.addTextChangedListener(simpleTextWatcher { render() })

        val filterRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(activity, 16), dp(activity, 6), dp(activity, 16), 0)
        }
        labelSpinner = Spinner(activity).apply { adapter = labelAdapter() }
        filterRow.addView(labelSpinner, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        filterRow.addView(actionButton(activity, "Mark all read") { markAllRead() })
        filterRow.addView(actionButton(activity, "New chat") { newChat() })
        root.addView(filterRow)

        statusText = label(activity, "", 12f, false, R.color.ios_text_muted).apply {
            setPadding(dp(activity, 16), dp(activity, 6), dp(activity, 16), 0)
        }
        root.addView(statusText)

        listContainer = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(activity, 12), dp(activity, 4), dp(activity, 12), dp(activity, 16))
        }
        val scroll = ScrollView(activity).apply {
            addView(listContainer, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        return root
    }

    override fun refresh() {
        statusText.text = "Loading chats..."
        host.api("bootstrap") { response ->
            if (response.ok) {
                contacts = response.array("contacts")
                messages = response.array("messages")
                labels = response.array("labels")
                chatLabels = response.array("chatLabels")
                updateLabelSpinner()
                render()
            } else {
                host.api("get_contacts") { fallback ->
                    if (fallback.ok) {
                        contacts = fallback.array("contacts")
                        messages = JSONArray()
                        labels = JSONArray()
                        chatLabels = JSONArray()
                        updateLabelSpinner()
                        render()
                    } else {
                        statusText.text = fallback.error
                        toast(activity, fallback.error)
                    }
                }
            }
        }
    }

    private fun labelAdapter(): ArrayAdapter<String> = ArrayAdapter(
        activity,
        android.R.layout.simple_spinner_dropdown_item,
        labelNames,
    )

    private fun updateLabelSpinner() {
        labelNames = mutableListOf("All labels")
        for (index in 0 until labels.length()) {
            labelNames.add(labels.optJSONObject(index)?.optString("name").orEmpty().ifBlank { "Label ${index + 1}" })
        }
        labelSpinner.adapter = labelAdapter()
    }

    private fun render() {
        listContainer.removeAllViews()
        val query = searchInput.text.toString().trim().lowercase()
        val selectedLabelId = selectedLabelId()

        val rows = mutableListOf<ChatRow>()
        for (index in 0 until contacts.length()) {
            val contact = contacts.optJSONObject(index) ?: continue
            val contactId = contact.optString("id")
            if (selectedLabelId.isNotBlank() && !hasLabel(contactId, selectedLabelId)) continue

            var unread = 0
            var latest: JSONObject? = null
            for (messageIndex in 0 until messages.length()) {
                val message = messages.optJSONObject(messageIndex) ?: continue
                if (message.optString("contact_id") != contactId) continue
                if (!message.optBoolean("is_outgoing") && message.optString("status") != "read") unread += 1
                val created = message.optString("created_at")
                if (latest == null || created > latest.optString("created_at")) latest = message
            }

            val name = contact.optString("name").ifBlank { contact.optString("phone") }
            val preview = latest?.let { message ->
                val prefix = if (message.optBoolean("is_outgoing")) "You: " else ""
                prefix + message.optString("content").ifBlank { message.optString("type", "Media") }
            } ?: "No messages yet"
            val searchable = "$name ${contact.optString("phone")} $preview".lowercase()
            if (query.isNotBlank() && !searchable.contains(query)) continue
            rows.add(ChatRow(contact, preview, latest?.optString("created_at").orEmpty(), unread))
        }
        rows.sortByDescending { it.time }

        statusText.text = "${rows.size} chat${if (rows.size == 1) "" else "s"}"
        if (rows.isEmpty()) {
            listContainer.addView(label(activity, "No matching chats", 14f, false, R.color.ios_text_muted).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(activity, 32), 0, 0)
            })
            return
        }
        rows.forEach { addChatRow(it) }
    }

    private fun selectedLabelId(): String {
        val position = labelSpinner.selectedItemPosition
        if (position <= 0) return ""
        return labels.optJSONObject(position - 1)?.optString("id").orEmpty()
    }

    private fun hasLabel(contactId: String, labelId: String): Boolean {
        for (index in 0 until chatLabels.length()) {
            val row = chatLabels.optJSONObject(index) ?: continue
            if (row.optString("chat_id") == contactId && row.optString("label_id") == labelId) return true
        }
        return false
    }

    private fun addChatRow(row: ChatRow) {
        val context = activity
        val contactId = row.contact.optString("id")
        val name = row.contact.optString("name").ifBlank { row.contact.optString("phone").ifBlank { "Unknown" } }
        val rowView = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(wc(context, R.color.ios_incoming), dp(context, 10).toFloat())
            setPadding(dp(context, 12), dp(context, 12), dp(context, 12), dp(context, 12))
            isClickable = true
            setOnClickListener { openThread(row.contact) }
        }
        val avatar = TextView(context).apply {
            text = name.firstOrNull()?.uppercase().orEmpty()
            gravity = Gravity.CENTER
            textSize = 20f
            setTextColor(wc(context, R.color.ios_incoming))
            background = pill(wc(context, R.color.waaba_green))
        }
        rowView.addView(avatar, LinearLayout.LayoutParams(dp(context, 46), dp(context, 46)))

        val details = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        details.addView(label(context, name, 15f, true))
        details.addView(label(context, row.preview, 12f, false, R.color.ios_text_muted).apply { maxLines = 1 })
        details.addView(label(context, row.contact.optString("phone"), 11f, false, R.color.ios_text_muted))
        rowView.addView(details, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dp(context, 12)
        })

        if (row.unread > 0) {
            val badge = TextView(context).apply {
                text = row.unread.toString()
                gravity = Gravity.CENTER
                textSize = 11f
                setTextColor(wc(context, R.color.ios_incoming))
                background = pill(wc(context, R.color.waaba_green))
            }
            rowView.addView(badge, LinearLayout.LayoutParams(dp(context, 26), dp(context, 26)))
        }
        listContainer.addView(rowView, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(context, 8) })
    }

    private fun markAllRead() {
        host.api("mark_all_read") { response ->
            if (response.ok) {
                toast(activity, "All chats marked read")
                refresh()
            } else {
                toast(activity, response.error)
            }
        }
    }

    private fun newChat() {
        host.api("get_contacts") { response ->
            if (!response.ok) {
                toast(activity, response.error)
                return@api
            }
            val items = mutableListOf<String>()
            for (index in 0 until response.array("contacts").length()) {
                val contact = response.array("contacts").optJSONObject(index) ?: continue
                items.add(contact.optString("name").ifBlank { contact.optString("phone") })
            }
            listDialog(activity, "Open chat with", items) { selected ->
                val contact = response.array("contacts").optJSONObject(selected) ?: return@listDialog
                openThread(contact)
            }
        }
    }

    private fun openLabels() {
        host.api("get_labels") { response ->
            val items = mutableListOf("Create label")
            for (index in 0 until response.array("labels").length()) {
                val item = response.array("labels").optJSONObject(index) ?: continue
                items.add("${item.optString("name")} (${item.optString("color")})")
            }
            listDialog(activity, "Labels", items) { selected ->
                if (selected == 0) {
                    formDialog(
                        activity,
                        "Create label",
                        listOf(
                            FieldSpec("name", "Name"),
                            FieldSpec("color", "Color", value = "#25D366"),
                        ),
                        { values ->
                            host.api("upsert_label", values) { result ->
                                toast(activity, if (result.ok) "Label saved" else result.error)
                                refresh()
                            }
                        },
                    )
                    return@listDialog
                }
                val item = response.array("labels").optJSONObject(selected - 1) ?: return@listDialog
                val labelId = item.optString("id")
                listDialog(activity, item.optString("name"), listOf("Rename", "Delete")) { action ->
                    when (action) {
                        0 -> formDialog(
                            activity,
                            "Rename label",
                            listOf(
                                FieldSpec("name", "Name", value = item.optString("name")),
                                FieldSpec("color", "Color", value = item.optString("color")),
                            ),
                            { values ->
                                values.put("labelId", labelId)
                                host.api("upsert_label", values) { result ->
                                    toast(activity, if (result.ok) "Label saved" else result.error)
                                    refresh()
                                }
                            },
                        )
                        1 -> confirmDialog(activity, "Delete label", "Remove this label from all chats?", {
                            host.api("delete_label", JSONObject().put("labelId", labelId)) { result ->
                                toast(activity, if (result.ok) "Label deleted" else result.error)
                                refresh()
                            }
                        })
                    }
                }
            }
        }
    }

    private fun openThread(contact: JSONObject) {
        val thread = ChatThreadScreen(activity, host, contact) { refresh() }
        host.openScreen(contact.optString("name").ifBlank { contact.optString("phone").ifBlank { "Chat" } }, thread.build())
        thread.refresh()
    }
}

class ChatThreadScreen(
    private val activity: MainActivity,
    private val host: ScreenHost,
    private val contact: JSONObject,
    private val onChanged: () -> Unit,
) {
    private val contactId: String get() = contact.optString("id")
    private val phone: String get() = contact.optString("phone")
    private val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(wc(activity, R.color.ios_chat_bg))
    }
    private lateinit var messagesContainer: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var composer: EditText
    private var messages = JSONArray()
    private var replyTo: String? = null
    private val mediaRequestCode = 4321

    fun build(): View {
        val header = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(wc(activity, R.color.ios_header))
            setPadding(dp(activity, 10), dp(activity, 10), dp(activity, 10), dp(activity, 10))
        }
        val back = TextView(activity).apply {
            text = "<"
            textSize = 24f
            setTextColor(wc(activity, R.color.waaba_green))
            setPadding(dp(activity, 8), dp(activity, 4), dp(activity, 12), dp(activity, 4))
            setOnClickListener { host.closeScreen() }
        }
        header.addView(back)
        val name = contact.optString("name").ifBlank { contact.optString("phone").ifBlank { "Chat" } }
        header.addView(label(activity, name, 17f, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val menuButton = TextView(activity).apply {
            text = "..."
            textSize = 20f
            setTextColor(wc(activity, R.color.waaba_green))
            setPadding(dp(activity, 12), dp(activity, 4), dp(activity, 8), dp(activity, 4))
            setOnClickListener { openMenu(this) }
        }
        header.addView(menuButton)
        root.addView(header)

        messagesContainer = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(activity, 12), dp(activity, 12), dp(activity, 12), dp(activity, 12))
        }
        scroll = ScrollView(activity).apply {
            addView(messagesContainer, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        root.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        composer = field(activity, "Type a message")
        val attach = actionButton(activity, "Media") { chooseMedia() }
        val template = actionButton(activity, "Template") { chooseTemplate() }
        val send = primaryButton(activity, "Send") { sendText() }
        val composerRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(wc(activity, R.color.ios_surface))
            setPadding(dp(activity, 8), dp(activity, 8), dp(activity, 8), dp(activity, 8))
        }
        composerRow.addView(composer, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        composerRow.addView(attach)
        composerRow.addView(template)
        composerRow.addView(send)
        root.addView(composerRow)
        return root
    }

    fun refresh() {
        host.api("get_messages", JSONObject().put("contactId", contactId)) { response ->
            if (response.ok) {
                messages = response.array("messages")
                render()
            } else {
                toast(activity, response.error)
            }
        }
        host.api("mark_read", JSONObject().put("contactId", contactId)) {}
    }

    private fun render() {
        messagesContainer.removeAllViews()
        if (messages.length() == 0) {
            messagesContainer.addView(label(activity, "No messages yet", 13f, false, R.color.ios_text_muted).apply {
                gravity = Gravity.CENTER
            })
        }
        for (index in 0 until messages.length()) {
            val message = messages.optJSONObject(index) ?: continue
            val outgoing = message.optBoolean("is_outgoing")
            val content = message.optString("content").ifBlank {
                message.optString("media_url").ifBlank { message.optString("type", "Media") }
            }
            val bubble = TextView(activity).apply {
                text = content
                textSize = 15f
                maxWidth = (activity.resources.displayMetrics.widthPixels * 0.75f).toInt()
                setTextColor(wc(activity, if (outgoing) R.color.ios_text else R.color.ios_text))
                background = rounded(
                    wc(activity, if (outgoing) R.color.ios_outgoing else R.color.ios_incoming),
                    dp(activity, 9).toFloat(),
                )
                setPadding(dp(activity, 12), dp(activity, 8), dp(activity, 12), dp(activity, 8))
                setOnLongClickListener {
                    messageActions(message)
                    true
                }
            }
            val wrapper = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = if (outgoing) Gravity.END else Gravity.START
                addView(bubble)
            }
            val column = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
            column.addView(wrapper)
            val meta = listOf(
                message.optString("created_at").take(16).replace("T", " "),
                reactionSummary(message),
                message.optString("status"),
            ).filter { it.isNotBlank() }.joinToString("  ")
            if (meta.isNotBlank()) {
                column.addView(label(activity, meta, 10f, false, R.color.ios_text_muted).apply {
                    gravity = if (outgoing) Gravity.END else Gravity.START
                })
            }
            messagesContainer.addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(activity, 8) })
        }
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun reactionSummary(message: JSONObject): String {
        val reactions = message.optJSONObject("reactions") ?: return ""
        val keys = reactions.keys()
        val parts = mutableListOf<String>()
        while (keys.hasNext()) {
            val key = keys.next()
            val count = reactions.optInt(key)
            if (count > 0) parts.add("$key $count")
        }
        return parts.joinToString(" ")
    }

    private fun openMenu(anchor: View) {
        val popup = PopupMenu(activity, anchor)
        popup.menu.add(1, 1, 0, "Mark read")
        popup.menu.add(1, 2, 1, "Clear chat")
        popup.menu.add(1, 3, 2, "Scheduled messages")
        popup.menu.add(1, 4, 3, "Upload sticker")
        popup.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> host.api("mark_read", JSONObject().put("contactId", contactId)) { result ->
                    toast(activity, if (result.ok) "Marked read" else result.error)
                }
                2 -> confirmDialog(activity, "Clear chat", "Hide all messages in this chat?", {
                    host.api("clear_chat", JSONObject().put("contactId", contactId)) { result ->
                        toast(activity, if (result.ok) "Chat cleared" else result.error)
                        refresh()
                        onChanged()
                    }
                })
                3 -> openScheduled()
                4 -> pickSticker()
            }
            true
        }
        popup.show()
    }

    private fun messageActions(message: JSONObject) {
        listDialog(activity, "Message", listOf("React", "Reply", "Forward", "Delete")) { selected ->
            when (selected) {
                0 -> formDialog(
                    activity,
                    "React",
                    listOf(FieldSpec("emoji", "Emoji", value = "👍")),
                    { values ->
                        values.put("messageId", message.optString("id"))
                        host.api("react_to_message", values) { result ->
                            toast(activity, if (result.ok) "Reaction sent" else result.error)
                            refresh()
                        }
                    },
                )
                1 -> {
                    replyTo = message.optString("id")
                    composer.hint = "Reply to: ${message.optString("content").take(30)}"
                    composer.requestFocus()
                }
                2 -> host.api("get_contacts") { response ->
                    val items = mutableListOf<String>()
                    for (index in 0 until response.array("contacts").length()) {
                        val item = response.array("contacts").optJSONObject(index) ?: continue
                        items.add(item.optString("name").ifBlank { item.optString("phone") })
                    }
                    multiSelectDialog(activity, "Forward to", items) { selectedIndexes ->
                        val ids = JSONArray()
                        selectedIndexes.forEach { position ->
                            ids.put(response.array("contacts").optJSONObject(position)?.optString("id"))
                        }
                        val args = JSONObject()
                            .put("messageId", message.optString("id"))
                            .put("contactIds", ids)
                        host.api("forward_message", args) { result ->
                            toast(activity, if (result.ok) "Message forwarded" else result.error)
                        }
                    }
                }
                3 -> confirmDialog(activity, "Delete message", "Remove this message from the chat?", {
                    host.api("delete_message", JSONObject().put("messageId", message.optString("id"))) { result ->
                        toast(activity, if (result.ok) "Message deleted" else result.error)
                        refresh()
                        onChanged()
                    }
                })
            }
        }
    }

    private fun sendText() {
        val content = composer.text.toString().trim()
        if (content.isBlank()) return
        val args = JSONObject()
            .put("contactId", contactId)
            .put("to", phone)
            .put("content", content)
        replyTo?.let { args.put("replyToMessageId", it) }
        host.api("send_text", args) { response ->
            if (response.ok) {
                composer.text.clear()
                replyTo = null
                composer.hint = "Type a message"
                refresh()
                onChanged()
            } else {
                toast(activity, response.error)
            }
        }
    }

    private fun chooseMedia() {
        listDialog(activity, "Send media", listOf("Upload from gallery", "Send by URL")) { selected ->
            if (selected == 0) {
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }
                activity.resultHandler = { requestCode, resultCode, data ->
                    activity.resultHandler = null
                    if (requestCode == mediaRequestCode && resultCode == Activity.RESULT_OK && data?.data != null) {
                        uploadMedia(data.data!!)
                    }
                }
                activity.startActivityForResult(intent, mediaRequestCode)
            } else {
                formDialog(
                    activity,
                    "Send media by URL",
                    listOf(
                        FieldSpec("mediaUrl", "Media URL"),
                        FieldSpec("type", "Type", options = listOf("image", "video", "document", "audio")),
                        FieldSpec("caption", "Caption"),
                        FieldSpec("mediaFileName", "File name"),
                    ),
                    { values ->
                        values.put("contactId", contactId)
                        values.put("to", phone)
                        host.api("send_media", values) { result ->
                            toast(activity, if (result.ok) "Media sent" else result.error)
                            refresh()
                            onChanged()
                        }
                    },
                )
            }
        }
    }

    private fun uploadMedia(uri: Uri) {
        val bytes = try {
            activity.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        } catch (error: Exception) {
            null
        }
        if (bytes == null) {
            toast(activity, "Cannot read selected file")
            return
        }
        val mime = activity.contentResolver.getType(uri) ?: "application/octet-stream"
        val fileName = displayName(uri) ?: "media-file"
        val args = JSONObject()
            .put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            .put("fileName", fileName)
            .put("mimeType", mime)
            .put("contactId", contactId)
        host.api("upload_media_base64", args) { result ->
            if (!result.ok) {
                toast(activity, result.error)
                return@api
            }
            val type = when {
                mime.startsWith("image/") -> "image"
                mime.startsWith("video/") -> "video"
                mime.startsWith("audio/") -> "audio"
                else -> "document"
            }
            val sendArgs = JSONObject()
                .put("contactId", contactId)
                .put("to", phone)
                .put("type", type)
                .put("mediaUrl", result.text("url"))
                .put("mediaFileName", fileName)
            host.api("send_media", sendArgs) { sent ->
                toast(activity, if (sent.ok) "Media sent" else sent.error)
                refresh()
                onChanged()
            }
        }
    }

    private fun displayName(uri: Uri): String? {
        val cursor = activity.contentResolver.query(uri, null, null, null, null) ?: return null
        return cursor.use {
            val index = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && it.moveToFirst()) it.getString(index) else null
        }
    }

    private fun chooseTemplate() {
        host.api("get_templates") { response ->
            val templates = response.array("templates")
            if (templates.length() == 0) {
                toast(activity, "No WhatsApp templates available")
                return@api
            }
            val names = mutableListOf<String>()
            for (index in 0 until templates.length()) {
                names.add(templates.optJSONObject(index)?.optString("name").orEmpty().ifBlank { "Template ${index + 1}" })
            }
            listDialog(activity, "Templates", names) { selected ->
                val template = templates.optJSONObject(selected) ?: return@listDialog
                formDialog(
                    activity,
                    "Send template",
                    listOf(
                        FieldSpec("templateName", "Template name", value = template.optString("name")),
                        FieldSpec("templateLanguage", "Language", value = template.optString("language").ifBlank { "en" }),
                        FieldSpec("params", "Params (comma separated or JSON array)"),
                    ),
                    { values ->
                        val raw = values.optString("params")
                        val params = try {
                            JSONArray(raw)
                        } catch (error: Exception) {
                            JSONArray(raw.split(",").map { it.trim() }.filter { it.isNotBlank() })
                        }
                        val args = JSONObject()
                            .put("contactId", contactId)
                            .put("to", phone)
                            .put("templateName", values.optString("templateName"))
                            .put("templateLanguage", values.optString("templateLanguage"))
                            .put("templateParams", params)
                        host.api("send_template", args) { result ->
                            toast(activity, if (result.ok) "Template sent" else result.error)
                            refresh()
                            onChanged()
                        }
                    },
                )
            }
        }
    }

    private fun pickSticker() {
        host.api("list_stickers") { response ->
            val stickers = response.array("stickers")
            val names = mutableListOf<String>()
            for (index in 0 until stickers.length()) {
                names.add(stickers.optJSONObject(index)?.optString("name").orEmpty().ifBlank { "Sticker ${index + 1}" })
            }
            names.add("Upload sticker")
            listDialog(activity, "Stickers", names) { selected ->
                if (selected == stickers.length()) {
                    jsonEditorDialog(
                        activity,
                        "Upload sticker (base64)",
                        "{\"name\":\"sticker.webp\",\"mimeType\":\"image/webp\",\"base64\":\"\"}",
                        { values ->
                            host.api("upload_sticker_base64", values) { result ->
                                toast(activity, if (result.ok) "Sticker uploaded" else result.error)
                            }
                        },
                    )
                    return@listDialog
                }
                val sticker = stickers.optJSONObject(selected) ?: return@listDialog
                val sendArgs = JSONObject()
                    .put("contactId", contactId)
                    .put("to", phone)
                    .put("type", "sticker")
                    .put("mediaUrl", sticker.optString("media_url"))
                host.api("send_media", sendArgs) { result ->
                    toast(activity, if (result.ok) "Sticker sent" else result.error)
                    refresh()
                }
            }
        }
    }

    private fun openScheduled() {
        host.api("list_scheduled_messages", JSONObject().put("contactId", contactId)) { response ->
            val rows = response.array("scheduledMessages")
            val items = mutableListOf("New scheduled message")
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                items.add("${row.optString("scheduled_at")} - ${row.optString("content").take(30)}")
            }
            listDialog(activity, "Scheduled messages", items) { selected ->
                if (selected == 0) {
                    formDialog(
                        activity,
                        "Schedule message",
                        listOf(
                            FieldSpec("content", "Message"),
                            FieldSpec("scheduledAt", "Scheduled at (ISO 8601)"),
                        ),
                        { values ->
                            values.put("contactId", contactId)
                            host.api("create_scheduled_message", values) { result ->
                                toast(activity, if (result.ok) "Scheduled" else result.error)
                            }
                        },
                    )
                    return@listDialog
                }
                val row = rows.optJSONObject(selected - 1) ?: return@listDialog
                val rowId = row.optString("id")
                listDialog(activity, "Scheduled message", listOf("Edit", "Cancel")) { action ->
                    when (action) {
                        0 -> jsonEditorDialog(
                            activity,
                            "Edit scheduled message",
                            JSONObject()
                                .put("scheduledMessageId", rowId)
                                .put("content", row.optString("content"))
                                .put("scheduledAt", row.optString("scheduled_at"))
                                .toString(2),
                            { values -> host.api("update_scheduled_message", values) { result ->
                                toast(activity, if (result.ok) "Updated" else result.error)
                            } },
                        )
                        1 -> host.api("cancel_scheduled_message", JSONObject().put("scheduledMessageId", rowId)) { result ->
                            toast(activity, if (result.ok) "Cancelled" else result.error)
                        }
                    }
                }
            }
        }
    }
}
