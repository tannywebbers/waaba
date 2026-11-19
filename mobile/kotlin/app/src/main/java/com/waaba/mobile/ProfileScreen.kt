package com.waaba.mobile

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

class ProfileScreen(private val activity: MainActivity, private val host: ScreenHost) : NativeTab {
    override val key = "profile"

    private val root = ScrollView(activity).apply { setBackgroundColor(wc(activity, R.color.ios_surface)) }

    override fun build(): View {
        val content = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(activity, 16), dp(activity, 28), dp(activity, 16), dp(activity, 28))
        }
        content.addView(label(activity, "You", 32f, true))

        val session = SessionStore.current()
        val name = session?.name.orEmpty().ifBlank { "Waaba user" }
        val email = session?.email.orEmpty().ifBlank { "Signed in" }
        val card = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = rounded(wc(activity, R.color.ios_incoming), dp(activity, 10).toFloat())
            setPadding(dp(activity, 16), dp(activity, 16), dp(activity, 16), dp(activity, 16))
        }
        val avatar = TextView(activity).apply {
            text = name.firstOrNull()?.uppercase().orEmpty()
            gravity = Gravity.CENTER
            textSize = 28f
            setTextColor(wc(activity, R.color.ios_incoming))
            background = pill(wc(activity, R.color.waaba_green))
        }
        card.addView(avatar, LinearLayout.LayoutParams(dp(activity, 72), dp(activity, 72)))
        val identity = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
        identity.addView(label(activity, name, 18f, true))
        identity.addView(label(activity, email, 14f, false, R.color.ios_text_muted))
        card.addView(identity, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dp(activity, 16)
        })
        content.addView(card, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(activity, 20) })

        addItem(content, "Business Profile", "WhatsApp business account", ">") { businessProfileScreen() }
        addItem(content, "Shared Inbox", "Members and assignments", ">") { sharedInboxScreen() }
        addItem(content, "Account", "Profile and security", ">") { accountScreen() }
        addItem(content, "Logout", "Sign out of this device", colorRes = R.color.ios_danger) {
            confirmDialog(activity, "Logout", "Sign out of Waaba on this device?", { host.startLogin() })
        }

        content.addView(label(activity, activity.getString(R.string.version), 12f, false, R.color.ios_text_muted).apply {
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(activity, 24)
        })

        root.addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        return root
    }

    override fun refresh() = Unit

    private fun businessProfileScreen() {
        val detail = buildDetail(activity, "Business Profile", { host.closeScreen() })
        fun load() {
            host.api("get_whatsapp_business_profile") { response ->
                val content = detail.content
                content.removeAllViews()
                if (response.ok) {
                    renderJsonObject(content, response.body)
                } else {
                    addItem(content, "Error", response.error)
                }
                content.addView(actionButton(activity, "Refresh") { load() })
            }
        }
        host.openScreen("Business Profile", detail.root)
        load()
    }

    private fun sharedInboxScreen() {
        val detail = buildDetail(activity, "Shared Inbox", { host.closeScreen() })
        fun load() {
            host.api("list_shared_inbox") { response ->
                val content = detail.content
                content.removeAllViews()
                addItem(content, "Role", if (response.ok && response.body.optBoolean("isSharedUser")) "Shared user" else "Owner")
                addItem(content, "Balance", response.body.opt("balance")?.toString().orEmpty())
                val members = response.array("sharedUsers")
                addItem(content, "Members", members.length().toString())
                for (index in 0 until members.length()) {
                    val member = members.optJSONObject(index) ?: continue
                    addItem(
                        content,
                        member.optString("name").ifBlank { member.optString("email").ifBlank { "Member" } },
                        listOf(member.optString("email"), member.optString("status"), "Balance ${member.opt("balance")}")
                            .filter { it.isNotBlank() }.joinToString("  |  "),
                    )
                }
                content.addView(actionButton(activity, "Refresh") { load() })
                content.addView(actionButton(activity, "Search users") {
                    formDialog(
                        activity,
                        "Search users",
                        listOf(FieldSpec("email", "Email")),
                        { values ->
                            host.api("search_users", values) { found ->
                                val users = found.array("users")
                                val items = mutableListOf<String>()
                                for (index in 0 until users.length()) {
                                    val user = users.optJSONObject(index) ?: continue
                                    items.add("${user.optString("email")} (${user.optString("id")})")
                                }
                                listDialog(activity, "Search results", items.ifEmpty { listOf("No users") }) { selected ->
                                    val user = users.optJSONObject(selected) ?: return@listDialog
                                    formDialog(
                                        activity,
                                        "Add member",
                                        listOf(FieldSpec("balance", "Balance", number = true, value = "0")),
                                        { balanceValues ->
                                            val args = JSONObject()
                                                .put("sharedUserId", user.optString("id"))
                                                .put("balance", balanceValues.optString("balance"))
                                            host.api("add_shared_user", args) { result ->
                                                toast(activity, if (result.ok) "Member added" else result.error)
                                                load()
                                            }
                                        },
                                    )
                                }
                            }
                        },
                    )
                })
                content.addView(actionButton(activity, "Add member") {
                    formDialog(
                        activity,
                        "Add member",
                        listOf(FieldSpec("sharedUserId", "User ID"), FieldSpec("balance", "Balance", number = true, value = "0")),
                        { values -> host.api("add_shared_user", values) { result ->
                            toast(activity, if (result.ok) "Member added" else result.error)
                            load()
                        } },
                    )
                })
                content.addView(actionButton(activity, "Update member") {
                    val items = mutableListOf<String>()
                    for (index in 0 until members.length()) {
                        items.add(members.optJSONObject(index)?.optString("email").orEmpty().ifBlank { "Member ${index + 1}" })
                    }
                    listDialog(activity, "Update member", items.ifEmpty { listOf("No members") }) { selected ->
                        val member = members.optJSONObject(selected) ?: return@listDialog
                        formDialog(
                            activity,
                            "Update member",
                            listOf(
                                FieldSpec("status", "Status", options = listOf("active", "inactive", "suspended"), value = member.optString("status", "active")),
                                FieldSpec("balance", "Balance", number = true, value = member.optString("balance", "0")),
                            ),
                            { values ->
                                values.put("memberId", member.optString("id"))
                                host.api("update_shared_user", values) { result ->
                                    toast(activity, if (result.ok) "Member updated" else result.error)
                                    load()
                                }
                            },
                        )
                    }
                })
                content.addView(actionButton(activity, "Remove member") {
                    val items = mutableListOf<String>()
                    for (index in 0 until members.length()) {
                        items.add(members.optJSONObject(index)?.optString("email").orEmpty().ifBlank { "Member ${index + 1}" })
                    }
                    listDialog(activity, "Remove member", items.ifEmpty { listOf("No members") }) { selected ->
                        val member = members.optJSONObject(selected) ?: return@listDialog
                        confirmDialog(activity, "Remove member", "Remove ${member.optString("email")} from the inbox?", {
                            host.api("remove_shared_user", JSONObject().put("memberId", member.optString("id"))) { result ->
                                toast(activity, if (result.ok) "Member removed" else result.error)
                                load()
                            }
                        })
                    }
                })
                content.addView(actionButton(activity, "Leave shared inbox") {
                    confirmDialog(activity, "Leave inbox", "Leave this shared inbox?", {
                        host.api("leave_shared_inbox") { result ->
                            toast(activity, if (result.ok) "Left shared inbox" else result.error)
                            load()
                        }
                    })
                })
                if (!response.ok) toast(activity, response.error)
            }
        }
        host.openScreen("Shared Inbox", detail.root)
        load()
    }

    private fun accountScreen() {
        val detail = buildDetail(activity, "Account", { host.closeScreen() })
        fun load() {
            host.api("get_profile") { response ->
                val content = detail.content
                content.removeAllViews()
                val profile = response.obj("profile")
                val user = response.obj("user")
                addItem(content, "Name", profile.optString("name").ifBlank { "-" })
                addItem(content, "Email", profile.optString("email").ifBlank { user.optString("email").ifBlank { "-" } })
                addItem(content, "User ID", user.optString("id").ifBlank { "-" })
                addItem(content, "Workspace owner", response.body.optBoolean("isOwner").toString())
                content.addView(actionButton(activity, "Refresh") { load() })
                content.addView(actionButton(activity, "Edit profile") {
                    formDialog(
                        activity,
                        "Edit profile",
                        listOf(
                            FieldSpec("name", "Name", value = profile.optString("name")),
                            FieldSpec("email", "Email", value = profile.optString("email").ifBlank { user.optString("email") }),
                            FieldSpec("avatar_url", "Avatar URL", value = profile.optString("avatar_url")),
                        ),
                        { values -> host.api("save_profile", values) { result ->
                            toast(activity, if (result.ok) "Profile saved" else result.error)
                            load()
                        } },
                    )
                })
                content.addView(actionButton(activity, "Change email") {
                    formDialog(
                        activity,
                        "Change email",
                        listOf(FieldSpec("email", "New email")),
                        { values -> host.api("change_email", values) { result ->
                            toast(activity, if (result.ok) "Email changed" else result.error)
                        } },
                    )
                })
                content.addView(actionButton(activity, "Change password") {
                    formDialog(
                        activity,
                        "Change password",
                        listOf(FieldSpec("password", "New password")),
                        { values -> host.api("change_password", values) { result ->
                            toast(activity, if (result.ok) "Password changed" else result.error)
                        } },
                    )
                })
                content.addView(actionButton(activity, "Delete account") {
                    confirmDialog(activity, "Delete account", "This permanently removes your Waaba account and data.", {
                        host.api("delete_account") { result ->
                            if (result.ok) {
                                toast(activity, "Account deleted")
                                host.startLogin()
                            } else {
                                toast(activity, result.error)
                            }
                        }
                    })
                })
                if (!response.ok) toast(activity, response.error)
            }
        }
        host.openScreen("Account", detail.root)
        load()
    }
}
