package com.waaba.mobile

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.ArrayAdapter
import org.json.JSONArray
import org.json.JSONObject

class SettingsScreen(private val activity: MainActivity, private val host: ScreenHost) : NativeTab {
    override val key = "settings"

    private val root = ScrollView(activity).apply { setBackgroundColor(wc(activity, R.color.ios_chat_bg)) }

    override fun build(): View {
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(activity, 16), dp(activity, 20), dp(activity, 16), dp(activity, 32))
        }
        content.addView(label(activity, "Settings", 22f, true).apply {
            setPadding(0, 0, 0, dp(activity, 12))
        })
        val sections = listOf(
            Triple("WhatsApp API", "Credentials, connection and webhook", { whatsappApiScreen() }),
            Triple("API Stats", "Message delivery counters", { apiStatsScreen() }),
            Triple("System Logs", "Webhook activity and errors", { systemLogsScreen() }),
            Triple("Template Mapping", "Variables, WhatsApp and app templates", { templateMappingScreen() }),
            Triple("Apps", "Manage app types", { appsScreen() }),
            Triple("Auto Reply", "Automated reply flows", { autoReplyScreen() }),
            Triple("Notifications", "Push and message preferences", { notificationsScreen() }),
            Triple("Appearance", "Theme and display preferences", { appearanceScreen() }),
        )
        sections.forEach { (title, subtitle, click) ->
            addItem(content, title, subtitle, ">") { click() }
        }
        addItem(content, "Advanced API action", "Call any mobile-api action with JSON arguments", ">") {
            advancedApiScreen()
        }
        root.addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return root
    }

    override fun refresh() = Unit

    private fun openSection(title: String, populate: (DetailView) -> Unit) {
        val detail = buildDetail(activity, title, { host.closeScreen() })
        populate(detail)
        host.openScreen(title, detail.root)
    }

    private fun whatsappApiScreen() {
        openSection("WhatsApp API") { detail ->
            fun load() {
                host.api("get_settings") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val settings = response.obj("settings")
                    addItem(content, "Status", if (settings.optBoolean("is_connected")) "Connected" else "Not connected")
                    addItem(content, "Phone number ID", settings.optString("phone_number_id").ifBlank { "-" })
                    addItem(content, "Business account ID", settings.optString("business_account_id").ifBlank { "-" })
                    addItem(content, "Webhook URL", settings.optString("webhook_url").ifBlank { "-" })
                    addItem(content, "Verify token", settings.optString("verify_token").ifBlank { "-" })
                    content.addView(actionButton(activity, "Refresh") { load() })

                    content.addView(actionButton(activity, "Edit credentials") {
                        formDialog(
                            activity,
                            "WhatsApp credentials",
                            listOf(
                                FieldSpec("api_token", "API token", value = settings.optString("api_token")),
                                FieldSpec("phone_number_id", "Phone number ID", value = settings.optString("phone_number_id")),
                                FieldSpec("business_account_id", "Business account ID", value = settings.optString("business_account_id")),
                                FieldSpec("app_id", "App ID", value = settings.optString("app_id")),
                            ),
                            { values ->
                                host.api("save_settings", values) { result ->
                                    toast(activity, if (result.ok) "Settings saved" else result.error)
                                    load()
                                }
                            },
                            initial = settings,
                        )
                    })
                    apiButton(activity, host, content, "Test connection", "test_whatsapp_connection")
                    apiButton(activity, host, content, "Sync templates", "sync_whatsapp_templates")
                    content.addView(actionButton(activity, "Generate webhook URL") {
                        formDialog(
                            activity,
                            "Webhook URL",
                            listOf(FieldSpec("verifyToken", "Verify token (blank = auto)")),
                            { values ->
                                host.api("generate_webhook_url", values) { result ->
                                    if (result.ok) {
                                        android.app.AlertDialog.Builder(activity)
                                            .setTitle("Webhook URL")
                                            .setMessage(result.text("webhookUrl") + "\n\nVerify token: " + result.text("verifyToken"))
                                            .setPositiveButton("OK", null)
                                            .show()
                                        load()
                                    } else {
                                        toast(activity, result.error)
                                    }
                                }
                            },
                        )
                    })
                    content.addView(actionButton(activity, "Reset connection") {
                        confirmDialog(activity, "Reset connection", "Remove stored WhatsApp credentials and logs?", {
                            host.api("reset_whatsapp_connection") { result ->
                                toast(activity, if (result.ok) "Connection reset" else result.error)
                                load()
                            }
                        })
                    })
                    content.addView(actionButton(activity, "View WhatsApp templates") {
                        host.api("get_templates") { templates ->
                            val rows = templates.array("templates")
                            val items = mutableListOf<String>()
                            for (index in 0 until rows.length()) {
                                val row = rows.optJSONObject(index) ?: continue
                                items.add("${row.optString("name")} (${row.optString("language")})")
                            }
                            listDialog(activity, "WhatsApp templates", items.ifEmpty { listOf("No templates") }) {}
                        }
                    })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun apiStatsScreen() {
        openSection("API Stats") { detail ->
            fun load() {
                host.api("get_api_stats") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val stats = response.obj("stats")
                    listOf("total", "sent", "delivered", "read", "failed", "deliveryRate").forEach { key ->
                        addItem(content, key.replaceFirstChar { it.uppercase() }, stats.opt(key)?.toString().orEmpty())
                    }
                    content.addView(actionButton(activity, "Refresh") { load() })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun systemLogsScreen() {
        openSection("System Logs") { detail ->
            var eventType = ""
            var direction = ""
            var status = ""
            var search = ""

            fun load() {
                val args = JSONObject()
                    .put("eventType", eventType)
                    .put("direction", direction)
                    .put("status", status)
                    .put("search", search)
                host.api("get_logs", args) { response ->
                    val content = detail.content
                    content.removeAllViews()
                    content.addView(actionButton(activity, "Filter") {
                        formDialog(
                            activity,
                            "Filter logs",
                            listOf(
                                FieldSpec("eventType", "Event type", value = eventType),
                                FieldSpec("direction", "Direction", value = direction),
                                FieldSpec("status", "Status", value = status),
                                FieldSpec("search", "Search", value = search),
                            ),
                            { values ->
                                eventType = values.optString("eventType")
                                direction = values.optString("direction")
                                status = values.optString("status")
                                search = values.optString("search")
                                load()
                            },
                        )
                    })
                    content.addView(actionButton(activity, "Clear logs") {
                        confirmDialog(activity, "Clear logs", "Delete all webhook logs?", {
                            host.api("clear_logs") { result ->
                                toast(activity, if (result.ok) "Logs cleared" else result.error)
                                load()
                            }
                        })
                    })
                    val logs = response.array("logs")
                    addItem(content, "Entries", logs.length().toString())
                    for (index in 0 until logs.length()) {
                        val row = logs.optJSONObject(index) ?: continue
                        addItem(
                            content,
                            row.optString("event_type").ifBlank { "Event" },
                            listOf(
                                row.optString("created_at").take(19),
                                row.optString("phone_number"),
                                row.optString("status"),
                                row.optString("error"),
                            ).filter { it.isNotBlank() }.joinToString("  |  "),
                        )
                    }
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun templateMappingScreen() {
        openSection("Template Mapping") { detail ->
            fun load() {
                host.api("list_template_mappings") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val rows = response.array("mappings")
                    addItem(content, "Mappings", rows.length().toString())
                    for (index in 0 until rows.length()) {
                        val row = rows.optJSONObject(index) ?: continue
                        addItem(
                            content,
                            row.optString("template_name"),
                            "Variable ${row.optString("variable_number")} -> ${row.optString("mapped_field")}",
                        )
                    }
                    content.addView(actionButton(activity, "Refresh") { load() })
                    content.addView(actionButton(activity, "Add mapping") {
                        formDialog(
                            activity,
                            "Save mapping",
                            listOf(
                                FieldSpec("templateName", "Template name"),
                                FieldSpec("variableNumber", "Variable number", number = true),
                                FieldSpec("mappedField", "Mapped field"),
                            ),
                            { values ->
                                host.api("save_template_mapping", values) { result ->
                                    toast(activity, if (result.ok) "Mapping saved" else result.error)
                                    load()
                                }
                            },
                        )
                    })
                    content.addView(actionButton(activity, "Clear mapping") {
                        formDialog(
                            activity,
                            "Clear mapping",
                            listOf(FieldSpec("templateName", "Template name")),
                            { values ->
                                host.api("clear_template_mapping", values) { result ->
                                    toast(activity, if (result.ok) "Mapping cleared" else result.error)
                                    load()
                                }
                            },
                        )
                    })
                    content.addView(actionButton(activity, "App templates") { appTemplatesScreen() })
                    content.addView(actionButton(activity, "WhatsApp templates") {
                        host.api("get_templates") { templates ->
                            val items = mutableListOf<String>()
                            for (index in 0 until templates.array("templates").length()) {
                                items.add(templates.array("templates").optJSONObject(index)?.optString("name").orEmpty())
                            }
                            listDialog(activity, "WhatsApp templates", items.ifEmpty { listOf("No templates") }) {}
                        }
                    })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun appTemplatesScreen() {
        openSection("App Templates") { detail ->
            fun load() {
                host.api("list_app_templates") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val rows = response.array("templates")
                    addItem(content, "Templates", rows.length().toString())
                    for (index in 0 until rows.length()) {
                        val row = rows.optJSONObject(index) ?: continue
                        addItem(content, row.optString("name"), row.optString("body"), ">") {
                            formDialog(
                                activity,
                                "Edit template",
                                listOf(
                                    FieldSpec("name", "Name", value = row.optString("name")),
                                    FieldSpec("body", "Body", value = row.optString("body"), multiline = true),
                                ),
                                { values ->
                                    values.put("templateId", row.optString("id"))
                                    host.api("upsert_app_template", values) { result ->
                                        toast(activity, if (result.ok) "Template saved" else result.error)
                                        load()
                                    }
                                },
                            )
                        }
                    }
                    content.addView(actionButton(activity, "New template") {
                        formDialog(
                            activity,
                            "New app template",
                            listOf(FieldSpec("name", "Name"), FieldSpec("body", "Body", multiline = true)),
                            { values -> host.api("upsert_app_template", values) { result ->
                                toast(activity, if (result.ok) "Template saved" else result.error)
                                load()
                            } },
                        )
                    })
                    content.addView(actionButton(activity, "Delete template") {
                        val items = mutableListOf<String>()
                        for (index in 0 until rows.length()) {
                            items.add(rows.optJSONObject(index)?.optString("name").orEmpty())
                        }
                        listDialog(activity, "Delete template", items.ifEmpty { listOf("No templates") }) { selected ->
                            confirmDialog(activity, "Delete template", "Remove this template?", {
                                host.api("delete_app_template", JSONObject().put("templateId", rows.optJSONObject(selected)?.optString("id"))) { result ->
                                    toast(activity, if (result.ok) "Template deleted" else result.error)
                                    load()
                                }
                            })
                        }
                    })
                }
            }
            load()
        }
    }

    private fun appsScreen() {
        openSection("Apps") { detail ->
            fun load() {
                host.api("get_apps") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val rows = response.array("apps")
                    addItem(content, "Apps", rows.length().toString())
                    for (index in 0 until rows.length()) {
                        val row = rows.optJSONObject(index) ?: continue
                        addItem(content, row.optString("name"), "Created ${row.optString("created_at").take(10)}", ">") {
                            formDialog(
                                activity,
                                "Rename app",
                                listOf(FieldSpec("name", "Name", value = row.optString("name"))),
                                { values ->
                                    values.put("appId", row.optString("id"))
                                    host.api("rename_app", values) { result ->
                                        toast(activity, if (result.ok) "App renamed" else result.error)
                                        load()
                                    }
                                },
                            )
                        }
                    }
                    content.addView(actionButton(activity, "Add app") {
                        formDialog(
                            activity,
                            "New app",
                            listOf(FieldSpec("name", "Name")),
                            { values -> host.api("add_app", values) { result ->
                                toast(activity, if (result.ok) "App added" else result.error)
                                load()
                            } },
                        )
                    })
                    content.addView(actionButton(activity, "Delete app") {
                        val items = mutableListOf<String>()
                        for (index in 0 until rows.length()) items.add(rows.optJSONObject(index)?.optString("name").orEmpty())
                        listDialog(activity, "Delete app", items.ifEmpty { listOf("No apps") }) { selected ->
                            confirmDialog(activity, "Delete app", "Remove this app?", {
                                host.api("delete_app", JSONObject().put("appId", rows.optJSONObject(selected)?.optString("id"))) { result ->
                                    toast(activity, if (result.ok) "App deleted" else result.error)
                                    load()
                                }
                            })
                        }
                    })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun autoReplyScreen() {
        openSection("Auto Reply") { detail ->
            fun load() {
                host.api("list_auto_replies") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val rows = response.array("autoReplies")
                    addItem(content, "Flows", rows.length().toString())
                    for (index in 0 until rows.length()) {
                        val row = rows.optJSONObject(index) ?: continue
                        addItem(
                            content,
                            row.optString("name"),
                            "Active: ${row.optBoolean("is_active")}",
                            ">",
                        ) { editAutoReply(row) { load() } }
                    }
                    content.addView(actionButton(activity, "New auto reply") {
                        jsonEditorDialog(
                            activity,
                            "New auto reply",
                            "{\"name\":\"Welcome\",\"steps\":[],\"is_active\":true}",
                            { values -> host.api("upsert_auto_reply", values) { result ->
                                toast(activity, if (result.ok) "Auto reply saved" else result.error)
                                load()
                            } },
                        )
                    })
                    content.addView(actionButton(activity, "Toggle") {
                        val items = mutableListOf<String>()
                        for (index in 0 until rows.length()) items.add(rows.optJSONObject(index)?.optString("name").orEmpty())
                        listDialog(activity, "Toggle auto reply", items.ifEmpty { listOf("No flows") }) { selected ->
                            val row = rows.optJSONObject(selected) ?: return@listDialog
                            formDialog(
                                activity,
                                "Toggle ${row.optString("name")}",
                                listOf(FieldSpec("isActive", "Active", checkbox = true, value = row.optBoolean("is_active").toString())),
                                { values ->
                                    values.put("autoReplyId", row.optString("id"))
                                    host.api("toggle_auto_reply", values) { result ->
                                        toast(activity, if (result.ok) "Updated" else result.error)
                                        load()
                                    }
                                },
                            )
                        }
                    })
                    content.addView(actionButton(activity, "Delete") {
                        val items = mutableListOf<String>()
                        for (index in 0 until rows.length()) items.add(rows.optJSONObject(index)?.optString("name").orEmpty())
                        listDialog(activity, "Delete auto reply", items.ifEmpty { listOf("No flows") }) { selected ->
                            confirmDialog(activity, "Delete auto reply", "Remove this flow?", {
                                host.api("delete_auto_reply", JSONObject().put("autoReplyId", rows.optJSONObject(selected)?.optString("id"))) { result ->
                                    toast(activity, if (result.ok) "Deleted" else result.error)
                                    load()
                                }
                            })
                        }
                    })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun editAutoReply(row: JSONObject, reload: () -> Unit) {
        jsonEditorDialog(
            activity,
            "Edit auto reply",
            JSONObject()
                .put("autoReplyId", row.optString("id"))
                .put("name", row.optString("name"))
                .put("steps", row.optJSONArray("steps") ?: JSONArray())
                .put("is_active", row.optBoolean("is_active"))
                .toString(2),
            { values -> host.api("upsert_auto_reply", values) { result ->
                toast(activity, if (result.ok) "Auto reply saved" else result.error)
                reload()
            } },
        )
    }

    private fun notificationsScreen() {
        openSection("Notifications") { detail ->
            fun load() {
                host.api("get_preferences") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val prefs = response.obj("preferences")
                    addItem(content, "Notifications", prefs.optBoolean("notifications_enabled", true).toString())
                    addItem(content, "Sound", prefs.optString("notification_sound", "default"))
                    addItem(content, "Vibration", prefs.optBoolean("vibration_enabled", true).toString())
                    addItem(content, "Message preview", prefs.optBoolean("message_preview", true).toString())
                    content.addView(actionButton(activity, "Edit preferences") {
                        formDialog(
                            activity,
                            "Notification preferences",
                            listOf(
                                FieldSpec("notifications_enabled", "Notifications", checkbox = true, value = prefs.optBoolean("notifications_enabled", true).toString()),
                                FieldSpec("vibration_enabled", "Vibration", checkbox = true, value = prefs.optBoolean("vibration_enabled", true).toString()),
                                FieldSpec("message_preview", "Message preview", checkbox = true, value = prefs.optBoolean("message_preview", true).toString()),
                                FieldSpec("notification_sound", "Sound", value = prefs.optString("notification_sound", "default")),
                            ),
                            { values -> host.api("save_preferences", values) { result ->
                                toast(activity, if (result.ok) "Preferences saved" else result.error)
                                load()
                            } },
                        )
                    })
                    content.addView(actionButton(activity, "Register push token") {
                        formDialog(
                            activity,
                            "Register push token",
                            listOf(FieldSpec("token", "Token")),
                            { values ->
                                values.put("platform", "android")
                                values.put("deviceInfo", "Waaba Android")
                                host.api("register_push_token", values) { result ->
                                    toast(activity, if (result.ok) "Token registered" else result.error)
                                }
                            },
                        )
                    })
                    content.addView(actionButton(activity, "Unregister push token") {
                        formDialog(
                            activity,
                            "Unregister push token",
                            listOf(FieldSpec("token", "Token")),
                            { values -> host.api("unregister_push_token", values) { result ->
                                toast(activity, if (result.ok) "Token removed" else result.error)
                            } },
                        )
                    })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun appearanceScreen() {
        openSection("Appearance") { detail ->
            fun load() {
                host.api("get_preferences") { response ->
                    val content = detail.content
                    content.removeAllViews()
                    val prefs = response.obj("preferences")
                    addItem(content, "Theme", prefs.optString("theme", "system"))
                    addItem(content, "Dark mode", prefs.optBoolean("dark_mode").toString())
                    addItem(content, "Primary color", prefs.optString("primary_color", "#28A156"))
                    addItem(content, "Font", prefs.optString("font_family", "system"))
                    content.addView(actionButton(activity, "Edit appearance") {
                        formDialog(
                            activity,
                            "Appearance",
                            listOf(
                                FieldSpec("theme", "Theme", options = listOf("system", "light", "dark"), value = prefs.optString("theme", "system")),
                                FieldSpec("dark_mode", "Dark mode", checkbox = true, value = prefs.optBoolean("dark_mode").toString()),
                                FieldSpec("primary_color", "Primary color", value = prefs.optString("primary_color", "#28A156")),
                                FieldSpec("font_family", "Font", options = listOf("system", "ios"), value = prefs.optString("font_family", "system")),
                            ),
                            { values -> host.api("save_preferences", values) { result ->
                                toast(activity, if (result.ok) "Appearance saved" else result.error)
                                load()
                            } },
                        )
                    })
                    if (!response.ok) toast(activity, response.error)
                }
            }
            load()
        }
    }

    private fun advancedApiScreen() {
        val detail = buildDetail(activity, "Advanced API action", { host.closeScreen() })
        val spinner = Spinner(activity).apply {
            adapter = ArrayAdapter(activity, android.R.layout.simple_spinner_dropdown_item, ALL_API_ACTIONS)
        }
        detail.content.addView(label(activity, "Action", 13f, true, R.color.ios_text_muted))
        detail.content.addView(spinner)
        detail.content.addView(actionButton(activity, "Edit arguments and run") {
            jsonEditorDialog(activity, spinner.selectedItem.toString(), "{}") { args ->
                host.api(spinner.selectedItem.toString(), args) { response ->
                    android.app.AlertDialog.Builder(activity)
                        .setTitle(if (response.ok) "Success" else "Error")
                        .setMessage(response.body.toString(2))
                        .setPositiveButton("OK", null)
                        .show()
                }
            }
        })
        host.openScreen("Advanced API action", detail.root)
    }
}
