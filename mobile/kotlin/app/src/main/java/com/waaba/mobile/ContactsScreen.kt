package com.waaba.mobile

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.ArrayAdapter
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject

class ContactsScreen(private val activity: MainActivity, private val host: ScreenHost) : NativeTab {
    override val key = "contacts"

    private val filterOptions = listOf("All", "Pinned", "Archived", "Blocked", "Deleted")
    private val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(wc(activity, R.color.ios_chat_bg))
    }
    private lateinit var listContainer: LinearLayout
    private lateinit var searchInput: EditText
    private lateinit var filterSpinner: Spinner
    private lateinit var statusText: TextView
    private lateinit var includeDeleted: CheckBox
    private var contacts = JSONArray()

    override fun build(): View {
        val titleRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(wc(activity, R.color.ios_header))
            setPadding(dp(activity, 16), dp(activity, 14), dp(activity, 12), dp(activity, 10))
        }
        titleRow.addView(label(activity, "Contacts", 22f, true))
        titleRow.addView(actionButton(activity, "Add") { addContact() }, LinearLayout.LayoutParams(
            0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f,
        ).apply { gravity = Gravity.END })
        root.addView(titleRow)

        searchInput = field(activity, "Search contacts")
        root.addView(searchInput, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { setMargins(dp(activity, 16), dp(activity, 10), dp(activity, 16), 0) })
        searchInput.addTextChangedListener(simpleTextWatcher { refresh() })

        val filterRow = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(activity, 16), dp(activity, 6), dp(activity, 16), 0)
        }
        filterSpinner = Spinner(activity).apply {
            adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item, filterOptions)
        }
        filterRow.addView(filterSpinner, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        filterRow.addView(actionButton(activity, "Restore") { restoreContacts() })
        filterRow.addView(actionButton(activity, "Bulk") { bulkActions() })
        root.addView(filterRow)

        includeDeleted = CheckBox(activity).apply {
            text = "Include deleted"
            setTextColor(wc(activity, R.color.ios_text_muted))
        }
        includeDeleted.setOnCheckedChangeListener { _, _ -> refresh() }
        root.addView(includeDeleted, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { setMargins(dp(activity, 16), dp(activity, 2), 0, 0) })

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
        statusText.text = "Loading contacts..."
        val query = searchInput.text.toString().trim()
        val filter = filterSpinner.selectedItem?.toString().orEmpty()
        val args = JSONObject()
            .put("search", query)
            .put("includeDeleted", includeDeleted.isChecked || filter == "Deleted")
        when (filter) {
            "Pinned" -> args.put("isPinned", true)
            "Archived" -> args.put("isArchived", true)
            "Blocked" -> args.put("isBlocked", true)
        }
        val action = if (query.isNotBlank()) "search_contacts" else "get_contacts"
        host.api(action, args) { response ->
            if (!response.ok) {
                statusText.text = response.error
                toast(activity, response.error)
                return@api
            }
            contacts = response.array("contacts")
            render(filter)
        }
    }

    private fun render(filter: String) {
        listContainer.removeAllViews()
        val shown = mutableListOf<JSONObject>()
        for (index in 0 until contacts.length()) {
            val contact = contacts.optJSONObject(index) ?: continue
            if (filter == "Deleted" && !contact.optBoolean("is_deleted")) continue
            shown.add(contact)
        }
        statusText.text = "${shown.size} contact${if (shown.size == 1) "" else "s"}"
        if (shown.isEmpty()) {
            listContainer.addView(label(activity, "No contacts found", 14f, false, R.color.ios_text_muted).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(activity, 32), 0, 0)
            })
            return
        }
        shown.forEach { contact ->
            val name = contact.optString("name").ifBlank { contact.optString("phone").ifBlank { "Unknown" } }
            val flags = mutableListOf<String>()
            if (contact.optBoolean("is_pinned")) flags.add("PINNED")
            if (contact.optBoolean("is_muted")) flags.add("MUTED")
            if (contact.optBoolean("is_archived")) flags.add("ARCHIVED")
            if (contact.optBoolean("is_blocked")) flags.add("BLOCKED")
            if (contact.optBoolean("is_deleted")) flags.add("DELETED")
            val subtitle = listOf(
                contact.optString("phone"),
                contact.optString("loan_id").ifBlank { contact.optString("email") },
            ).filter { it.isNotBlank() }.joinToString("  |  ")
            addItem(listContainer, name, subtitle, flags.joinToString(" ")) {
                openContact(contact)
            }
        }
    }

    private fun addContact() {
        formDialog(
            activity,
            "New contact",
            listOf(
                FieldSpec("name", "Name"),
                FieldSpec("phone", "Phone"),
                FieldSpec("loanId", "Loan ID"),
                FieldSpec("amount", "Amount"),
                FieldSpec("dayType", "Day type"),
                FieldSpec("appType", "App type", value = "tloan"),
                FieldSpec("bvn", "BVN"),
            ),
            { values ->
                host.api("create_contact", values) { result ->
                    toast(activity, if (result.ok) "Contact created" else result.error)
                    refresh()
                }
            },
        )
    }

    private fun restoreContacts() {
        host.api("get_contacts", JSONObject().put("includeDeleted", true)) { response ->
            val deleted = mutableListOf<JSONObject>()
            val names = mutableListOf<String>()
            for (index in 0 until response.array("contacts").length()) {
                val contact = response.array("contacts").optJSONObject(index) ?: continue
                if (!contact.optBoolean("is_deleted")) continue
                deleted.add(contact)
                names.add(contact.optString("name").ifBlank { contact.optString("phone") })
            }
            multiSelectDialog(activity, "Restore contacts", names) { selected ->
                val ids = JSONArray()
                selected.forEach { ids.put(deleted[it].optString("id")) }
                host.api("restore_contacts", JSONObject().put("contactIds", ids)) { result ->
                    toast(activity, if (result.ok) "Contacts restored" else result.error)
                    refresh()
                }
            }
        }
    }

    private fun bulkActions() {
        listDialog(activity, "Bulk actions", listOf("Set flags", "Bulk send", "Bulk upsert (JSON)")) { selected ->
            when (selected) {
                0 -> host.api("get_contacts") { response ->
                    val items = mutableListOf<String>()
                    for (index in 0 until response.array("contacts").length()) {
                        val contact = response.array("contacts").optJSONObject(index) ?: continue
                        items.add(contact.optString("name").ifBlank { contact.optString("phone") })
                    }
                    multiSelectDialog(activity, "Select contacts", items) { indexes ->
                        val ids = JSONArray()
                        indexes.forEach { ids.put(response.array("contacts").optJSONObject(it)?.optString("id")) }
                        formDialog(
                            activity,
                            "Bulk flags",
                            listOf(
                                FieldSpec("is_pinned", "Pinned", checkbox = true),
                                FieldSpec("is_muted", "Muted", checkbox = true),
                                FieldSpec("is_archived", "Archived", checkbox = true),
                                FieldSpec("is_blocked", "Blocked", checkbox = true),
                                FieldSpec("is_deleted", "Deleted", checkbox = true),
                            ),
                            { values ->
                                values.put("contactIds", ids)
                                host.api("bulk_update_contact_flags", values) { result ->
                                    toast(activity, if (result.ok) "Flags updated" else result.error)
                                    refresh()
                                }
                            },
                        )
                    }
                }
                1 -> host.api("get_contacts") { response ->
                    val items = mutableListOf<String>()
                    for (index in 0 until response.array("contacts").length()) {
                        val contact = response.array("contacts").optJSONObject(index) ?: continue
                        items.add(contact.optString("name").ifBlank { contact.optString("phone") })
                    }
                    multiSelectDialog(activity, "Recipients", items) { indexes ->
                        val recipients = JSONArray()
                        indexes.forEach {
                            val contact = response.array("contacts").optJSONObject(it) ?: return@forEach
                            recipients.put(JSONObject().put("contactId", contact.optString("id")))
                        }
                        formDialog(
                            activity,
                            "Bulk send",
                            listOf(
                                FieldSpec("content", "Message"),
                                FieldSpec("type", "Type", options = listOf("text", "template", "image", "document")),
                                FieldSpec("templateName", "Template name (optional)"),
                            ),
                            { values ->
                                values.put("contacts", recipients)
                                host.api("bulk_send", values) { result ->
                                    toast(activity, if (result.ok) "Bulk send requested" else result.error)
                                }
                            },
                        )
                    }
                }
                2 -> jsonEditorDialog(
                    activity,
                    "Bulk upsert contacts",
                    "{\"contacts\":[{\"name\":\"Example\",\"phone\":\"2348000000000\"}]}",
                    { values -> host.api("bulk_upsert_contacts", values) { result ->
                        toast(activity, if (result.ok) "Bulk upsert complete" else result.error)
                        refresh()
                    } },
                )
            }
        }
    }

    private fun openContact(contact: JSONObject) {
        val detail = ContactDetailScreen(activity, host, contact.optString("id")) { refresh() }
        host.openScreen(contact.optString("name").ifBlank { contact.optString("phone") }, detail.build())
        detail.refresh()
    }
}

class ContactDetailScreen(
    private val activity: MainActivity,
    private val host: ScreenHost,
    private val contactId: String,
    private val onChanged: () -> Unit,
) {
    private val detail = buildDetail(activity, "Contact", { host.closeScreen() })
    private var details = JSONObject()

    fun build(): View = detail.root

    fun refresh() {
        host.api("get_contact_details", JSONObject().put("contactId", contactId)) { response ->
            if (!response.ok) {
                toast(activity, response.error)
                return@api
            }
            details = response.body
            render()
        }
    }

    private fun render() {
        val content = detail.content
        content.removeAllViews()
        val contact = details.optJSONObject("contact") ?: JSONObject()
        val name = contact.optString("name").ifBlank { contact.optString("phone").ifBlank { "Contact" } }
        addItem(content, name, listOf(
            contact.optString("phone"),
            contact.optString("loan_id").ifBlank { contact.optString("email") },
        ).filter { it.isNotBlank() }.joinToString("  |  "))

        addItem(content, "Edit details", "Name, phone, email, loan, app, notes") { editContact(contact) }
        addItem(content, "Open chat", "View messages and send a reply") { openChat(contact) }
        addItem(content, "Assign conversation", contact.optString("assigned_user_id").ifBlank { "Unassigned" }) { assignConversation() }
        addItem(content, "Labels", details.optJSONArray("labels")?.length()?.toString().orEmpty() + " assigned") { assignLabels() }

        addItem(content, "Pin / Unpin", if (contact.optBoolean("is_pinned")) "Pinned" else "Not pinned") {
            setFlag("is_pinned", !contact.optBoolean("is_pinned"))
        }
        addItem(content, "Mute / Unmute", if (contact.optBoolean("is_muted")) "Muted" else "Not muted") {
            setFlag("is_muted", !contact.optBoolean("is_muted"))
        }
        addItem(content, "Archive / Unarchive", if (contact.optBoolean("is_archived")) "Archived" else "Active") {
            setFlag("is_archived", !contact.optBoolean("is_archived"))
        }
        addItem(content, "Block / Unblock", if (contact.optBoolean("is_blocked")) "Blocked" else "Not blocked") {
            setFlag("is_blocked", !contact.optBoolean("is_blocked"))
        }

        val accounts = details.optJSONArray("accountDetails") ?: JSONArray()
        addItem(content, "Account details", "${accounts.length()} record(s)") { editRelated("accountDetails", accounts) }
        for (index in 0 until accounts.length()) {
            val account = accounts.optJSONObject(index) ?: continue
            addItem(
                content,
                account.optString("bank").ifBlank { "Account" },
                listOf(account.optString("account_number"), account.optString("account_name"))
                    .filter { it.isNotBlank() }.joinToString("  |  "),
            )
        }

        val customerContacts = details.optJSONArray("customerContacts") ?: JSONArray()
        addItem(content, "Customer contacts", "${customerContacts.length()} record(s)") {
            editRelated("customerContacts", customerContacts)
        }
        for (index in 0 until customerContacts.length()) {
            val person = customerContacts.optJSONObject(index) ?: continue
            addItem(content, person.optString("name"), listOf(person.optString("phone"), person.optString("email"))
                .filter { it.isNotBlank() }.joinToString("  |  "))
        }

        addItem(content, "Messages", "${details.optJSONArray("messages")?.length() ?: 0} message(s)") { openChat(contact) }
        addItem(content, "Restore contact", "Clear deleted state") {
            host.api("restore_contacts", JSONObject().put("contactIds", JSONArray().put(contactId))) { result ->
                toast(activity, if (result.ok) "Restored" else result.error)
                refresh()
                onChanged()
            }
        }
        addItem(content, "Delete contact", "Move to deleted", colorRes = R.color.ios_danger) {
            setFlag("is_deleted", true)
        }
        addItem(content, "Delete permanently", "Removes messages and related data", colorRes = R.color.ios_danger) {
            confirmDialog(activity, "Permanent delete", "This cannot be undone.", {
                host.api("permanent_delete_contacts", JSONObject().put("contactIds", JSONArray().put(contactId))) { result ->
                    toast(activity, if (result.ok) "Deleted permanently" else result.error)
                    host.closeScreen()
                    onChanged()
                }
            })
        }
    }

    private fun setFlag(flag: String, value: Boolean) {
        val args = JSONObject().put("contactId", contactId).put(flag, value)
        host.api("update_contact_flag", args) { result ->
            toast(activity, if (result.ok) "Contact updated" else result.error)
            refresh()
            onChanged()
        }
    }

    private fun editContact(contact: JSONObject) {
        formDialog(
            activity,
            "Edit contact",
            listOf(
                FieldSpec("name", "Name", value = contact.optString("name")),
                FieldSpec("phone", "Phone", value = contact.optString("phone")),
                FieldSpec("email", "Email", value = contact.optString("email")),
                FieldSpec("role", "Role", value = contact.optString("role")),
                FieldSpec("loan_id", "Loan ID", value = contact.optString("loan_id")),
                FieldSpec("amount", "Amount", value = contact.optString("amount")),
                FieldSpec("app_type", "App type", value = contact.optString("app_type").ifBlank { "tloan" }),
                FieldSpec("notes", "Notes", value = contact.optString("notes"), multiline = true),
                FieldSpec("bvn", "BVN", value = contact.optString("bvn")),
            ),
            { values ->
                values.put("contactId", contactId)
                host.api("update_contact", values) { result ->
                    toast(activity, if (result.ok) "Contact saved" else result.error)
                    refresh()
                    onChanged()
                }
            },
            initial = contact,
        )
    }

    private fun assignConversation() {
        formDialog(
            activity,
            "Assign conversation",
            listOf(FieldSpec("assignedUserId", "User ID", value = details.optJSONObject("contact")?.optString("assigned_user_id").orEmpty())),
            { values ->
                values.put("contactId", contactId)
                host.api("assign_conversation", values) { result ->
                    toast(activity, if (result.ok) "Conversation assigned" else result.error)
                    refresh()
                    onChanged()
                }
            },
        )
    }

    private fun assignLabels() {
        host.api("get_labels") { response ->
            val available = mutableListOf<JSONObject>()
            val names = mutableListOf<String>()
            for (index in 0 until response.array("labels").length()) {
                val item = response.array("labels").optJSONObject(index) ?: continue
                available.add(item)
                names.add(item.optString("name"))
            }
            val assignedIds = mutableSetOf<String>()
            val current = details.optJSONArray("labels") ?: JSONArray()
            for (index in 0 until current.length()) {
                assignedIds.add(current.optJSONObject(index)?.optString("id").orEmpty())
            }
            val selected = available.indices.filter { assignedIds.contains(available[it].optString("id")) }.toSet()
            multiSelectDialog(activity, "Chat labels", names, selected) { indexes ->
                val ids = JSONArray()
                indexes.forEach { ids.put(available[it].optString("id")) }
                val args = JSONObject().put("contactId", contactId).put("labelIds", ids)
                host.api("set_chat_labels", args) { result ->
                    toast(activity, if (result.ok) "Labels updated" else result.error)
                    refresh()
                    onChanged()
                }
            }
        }
    }

    private fun editRelated(key: String, current: JSONArray) {
        jsonEditorDialog(
            activity,
            "Replace $key",
            JSONObject().put(key, current).toString(2),
            { values ->
                values.put("contactId", contactId)
                host.api("upsert_contact_full", values) { result ->
                    toast(activity, if (result.ok) "Saved" else result.error)
                    refresh()
                    onChanged()
                }
            },
        )
    }

    private fun openChat(contact: JSONObject) {
        val thread = ChatThreadScreen(activity, host, contact) { refresh() }
        host.openScreen(contact.optString("name").ifBlank { contact.optString("phone") }, thread.build())
        thread.refresh()
    }
}
