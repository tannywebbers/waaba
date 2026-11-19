package com.waaba.mobile

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class LoginActivity : AppCompatActivity() {
    private lateinit var emailInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var errorText: TextView
    private lateinit var signInButton: TextView
    private lateinit var progress: View
    private var signingIn = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SessionStore.init(this)
        if (SessionStore.current() != null) {
            startMain()
            finish()
            return
        }

        setContentView(R.layout.activity_login)
        emailInput = findViewById(R.id.loginEmail)
        passwordInput = findViewById(R.id.loginPassword)
        errorText = findViewById(R.id.loginError)
        signInButton = findViewById(R.id.loginButton)
        progress = findViewById(R.id.loginProgress)

        emailInput.setText(SessionStore.current()?.email.orEmpty())
        signInButton.setOnClickListener { signIn() }
    }

    private fun signIn() {
        if (signingIn) return
        val email = emailInput.text.toString().trim()
        val password = passwordInput.text.toString()
        if (email.isBlank() || password.isBlank()) {
            errorText.text = "Enter your email and password"
            return
        }

        signingIn = true
        errorText.text = ""
        progress.visibility = View.VISIBLE
        signInButton.isEnabled = false

        ApiClient.login(email, password) { response ->
            signingIn = false
            progress.visibility = View.GONE
            signInButton.isEnabled = true
            if (response.ok && SessionStore.current() != null) {
                startMain()
                finish()
            } else {
                errorText.text = response.error.ifBlank { "Sign in failed" }
            }
        }
    }

    private fun startMain() {
        startActivity(Intent(this, MainActivity::class.java))
    }
}
