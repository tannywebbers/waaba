package com.waaba.mobile

import android.app.AlertDialog
import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.res.ResourcesCompat
import org.json.JSONObject

internal fun dp(context: Context, value: Int): Int =
    TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        context.resources.displayMetrics,
    ).toInt()

internal fun wc(context: Context, res: Int): Int = androidx.core.content.ContextCompat.getColor(context, res)

internal fun rounded(colorValue: Int, radius: Float): GradientDrawable = GradientDrawable().apply {
    setColor(colorValue)
    cornerRadius = radius
}

internal fun pill(colorValue: Int): GradientDrawable = GradientDrawable().apply {
    setColor(colorValue)
    shape = GradientDrawable.OVAL
}

internal fun label(
    context: Context,
    text: String,
    size: Float = 15f,
    bold: Boolean = false,
    colorRes: Int = R.color.ios_text,
): TextView = TextView(context).apply {
    this.text = text
    textSize = size
    setTextColor(wc(context, colorRes))
    typeface = ResourcesCompat.getFont(
        context,
        if (bold) R.font.ios_semibold else R.font.ios_regular,
    )
}

internal fun field(
    context: Context,
    hint: String,
    value: String = "",
    multiline: Boolean = false,
    number: Boolean = false,
): EditText = EditText(context).apply {
    this.hint = hint
    setText(value)
    textSize = 15f
    setTextColor(wc(context, R.color.ios_text))
    setHintTextColor(wc(context, R.color.ios_text_muted))
    background = rounded(wc(context, R.color.ios_incoming), dp(context, 10).toFloat())
    setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10))
    inputType = when {
        multiline -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        number -> InputType.TYPE_CLASS_NUMBER
        else -> InputType.TYPE_CLASS_TEXT
    }
    if (multiline) {
        minLines = 3
        gravity = Gravity.TOP
    }
    layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(context, 6) }
}

internal fun actionButton(context: Context, text: String, onClick: () -> Unit): TextView =
    TextView(context).apply {
        this.text = text
        gravity = Gravity.CENTER
        textSize = 13f
        setTextColor(wc(context, R.color.waaba_green))
        typeface = ResourcesCompat.getFont(context, R.font.ios_medium)
        background = rounded(wc(context, R.color.ios_soft_gray), dp(context, 8).toFloat())
        setPadding(dp(context, 10), dp(context, 8), dp(context, 10), dp(context, 8))
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { marginEnd = dp(context, 6); topMargin = dp(context, 6) }
        setOnClickListener { onClick() }
    }

internal fun primaryButton(context: Context, text: String, onClick: () -> Unit): TextView =
    TextView(context).apply {
        this.text = text
        gravity = Gravity.CENTER
        textSize = 16f
        setTextColor(wc(context, R.color.ios_incoming))
        typeface = ResourcesCompat.getFont(context, R.font.ios_medium)
        background = rounded(wc(context, R.color.waaba_green), dp(context, 10).toFloat())
        setPadding(dp(context, 16), dp(context, 12), dp(context, 16), dp(context, 12))
        setOnClickListener { onClick() }
    }

internal fun addItem(
    parent: LinearLayout,
    title: String,
    subtitle: String = "",
    trailing: String = "",
    onClick: (() -> Unit)? = null,
) {
    val context = parent.context
    val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        background = rounded(wc(context, R.color.ios_incoming), dp(context, 10).toFloat())
        setPadding(dp(context, 14), dp(context, 12), dp(context, 14), dp(context, 12))
        isClickable = onClick != null
        isFocusable = onClick != null
        if (onClick != null) setOnClickListener { onClick() }
    }
    val texts = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    texts.addView(label(context, title, 15f, true))
    if (subtitle.isNotBlank()) {
        texts.addView(label(context, subtitle, 12f, false, R.color.ios_text_muted).apply {
            maxLines = 2
        })
    }
    row.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    if (trailing.isNotBlank()) {
        row.addView(label(context, trailing, 12f, true, R.color.waaba_green).apply {
            gravity = Gravity.END
        })
    }
    parent.addView(row, LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(context, 8) })
}

internal fun addItem(
    parent: LinearLayout,
    title: String,
    subtitle: String = "",
    trailing: String = "",
    colorRes: Int,
    onClick: (() -> Unit)? = null,
) {
    val context = parent.context
    val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        background = rounded(wc(context, R.color.ios_incoming), dp(context, 10).toFloat())
        setPadding(dp(context, 14), dp(context, 12), dp(context, 14), dp(context, 12))
        isClickable = onClick != null
        isFocusable = onClick != null
        if (onClick != null) setOnClickListener { onClick() }
    }
    val texts = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    texts.addView(label(context, title, 15f, true, colorRes))
    if (subtitle.isNotBlank()) {
        texts.addView(label(context, subtitle, 12f, false, R.color.ios_text_muted).apply { maxLines = 2 })
    }
    row.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    if (trailing.isNotBlank()) {
        row.addView(label(context, trailing, 12f, true, colorRes).apply { gravity = Gravity.END })
    }
    parent.addView(row, LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(context, 8) })
}

internal fun toast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}

internal fun listDialog(
    context: Context,
    title: String,
    items: List<String>,
    onSelect: (Int) -> Unit,
) {
    AlertDialog.Builder(context)
        .setTitle(title)
        .setItems(items.toTypedArray()) { _, which -> onSelect(which) }
        .setNegativeButton("Cancel", null)
        .show()
}

internal fun confirmDialog(context: Context, title: String, message: String, onConfirm: () -> Unit) {
    AlertDialog.Builder(context)
        .setTitle(title)
        .setMessage(message)
        .setPositiveButton("Confirm") { _, _ -> onConfirm() }
        .setNegativeButton("Cancel", null)
        .show()
}

internal fun multiSelectDialog(
    context: Context,
    title: String,
    items: List<String>,
    initiallySelected: Set<Int> = emptySet(),
    onConfirm: (Set<Int>) -> Unit,
) {
    if (items.isEmpty()) {
        toast(context, "Nothing to select")
        return
    }
    val checked = BooleanArray(items.size) { initiallySelected.contains(it) }
    AlertDialog.Builder(context)
        .setTitle(title)
        .setMultiChoiceItems(items.toTypedArray(), checked) { _, which, isChecked ->
            checked[which] = isChecked
        }
        .setPositiveButton("Apply") { _, _ -> onConfirm(checked.indices.filter { checked[it] }.toSet()) }
        .setNegativeButton("Cancel", null)
        .show()
}

data class FieldSpec(
    val key: String,
    val label: String,
    val hint: String = "",
    val value: String = "",
    val multiline: Boolean = false,
    val number: Boolean = false,
    val checkbox: Boolean = false,
    val options: List<String> = emptyList(),
)

internal fun formDialog(
    context: Context,
    title: String,
    fields: List<FieldSpec>,
    onSubmit: (JSONObject) -> Unit,
    initial: JSONObject = JSONObject(),
) {
    val container = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(context, 20), dp(context, 14), dp(context, 20), dp(context, 8))
    }
    val holders = mutableMapOf<String, Any>()

    fields.forEach { item ->
        container.addView(label(context, item.label, 13f, true, R.color.ios_text_muted).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(context, 10) }
        })
        when {
            item.checkbox -> {
                val box = CheckBox(context).apply {
                    isChecked = if (initial.has(item.key)) initial.optBoolean(item.key) else item.value == "true"
                    text = item.label
                    setTextColor(wc(context, R.color.ios_text))
                }
                holders[item.key] = box
                container.addView(box)
            }
            item.options.isNotEmpty() -> {
                val spinner = Spinner(context).apply {
                    adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, item.options)
                    val selected = initial.optString(item.key, item.value)
                    val index = item.options.indexOf(selected)
                    if (index >= 0) setSelection(index)
                }
                holders[item.key] = spinner
                container.addView(spinner)
            }
            else -> {
                val input = field(
                    context,
                    item.hint.ifBlank { item.label },
                    initial.optString(item.key, item.value),
                    item.multiline,
                    item.number,
                )
                holders[item.key] = input
                container.addView(input)
            }
        }
    }

    val scroll = ScrollView(context).apply { addView(container) }
    AlertDialog.Builder(context)
        .setTitle(title)
        .setView(scroll)
        .setPositiveButton("Save") { _, _ ->
            val result = JSONObject()
            fields.forEach { item ->
                when (val holder = holders[item.key]) {
                    is EditText -> result.put(item.key, holder.text.toString().trim())
                    is CheckBox -> result.put(item.key, holder.isChecked)
                    is Spinner -> result.put(item.key, holder.selectedItem.toString())
                }
            }
            onSubmit(result)
        }
        .setNegativeButton("Cancel", null)
        .show()
}

internal fun simpleTextWatcher(onChange: (String) -> Unit): android.text.TextWatcher =
    object : android.text.TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
            onChange(s?.toString().orEmpty())
        }
        override fun afterTextChanged(s: android.text.Editable?) = Unit
    }

internal fun jsonEditorDialog(
    context: Context,
    title: String,
    initial: String,
    onSubmit: (JSONObject) -> Unit,
) {
    val input = EditText(context).apply {
        setText(initial)
        textSize = 13f
        typeface = android.graphics.Typeface.MONOSPACE
        setTextColor(wc(context, R.color.ios_text))
        background = rounded(wc(context, R.color.ios_incoming), dp(context, 10).toFloat())
        setPadding(dp(context, 12), dp(context, 12), dp(context, 12), dp(context, 12))
        minLines = 10
        gravity = Gravity.TOP
    }
    val scroll = ScrollView(context).apply {
        setPadding(dp(context, 16), dp(context, 8), dp(context, 16), dp(context, 8))
        addView(input)
    }
    AlertDialog.Builder(context)
        .setTitle(title)
        .setView(scroll)
        .setPositiveButton("Run") { _, _ ->
            try {
                onSubmit(JSONObject(input.text.toString().trim()))
            } catch (error: Exception) {
                toast(context, "Invalid JSON: ${error.message}")
            }
        }
        .setNegativeButton("Cancel", null)
        .show()
}
