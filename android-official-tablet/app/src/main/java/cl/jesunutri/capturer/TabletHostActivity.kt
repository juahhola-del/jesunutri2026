package cl.jesunutri.capturer

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class TabletHostActivity : ComponentActivity() {
    private lateinit var server: AndroidLocalServer
    private lateinit var statusDot: TextView
    private lateinit var statusText: TextView
    private lateinit var connectText: TextView
    private lateinit var setupPanel: LinearLayout
    private lateinit var installButton: Button
    private lateinit var importButton: Button
    private lateinit var webView: WebView

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        startBackendService()
        lifecycleScope.launch {
            startServer()
            refreshStatus()
            loadAdminApp()
        }
    }

    private suspend fun startServer() = withContext(Dispatchers.IO) {
        server = TabletServerRuntime.ensureStarted(this@TabletHostActivity)
    }

    private fun startBackendService() {
        val intent = Intent(this, TabletBackendService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(9, 13, 20))
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(14), dp(12), dp(10))
            setBackgroundColor(Color.rgb(9, 13, 20))
        }
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        top.addView(TextView(this).apply {
            text = "Jesunutri Tablet Oficial"
            textSize = 18f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        statusDot = TextView(this).apply {
            text = "\u25CF"
            textSize = 20f
            setTextColor(Color.rgb(107, 114, 128))
            gravity = Gravity.CENTER
        }
        top.addView(statusDot, LinearLayout.LayoutParams(dp(32), LinearLayout.LayoutParams.WRAP_CONTENT))
        header.addView(top)
        statusText = TextView(this).apply {
            text = "Iniciando backend local Android..."
            textSize = 13f
            setTextColor(Color.rgb(203, 213, 225))
        }
        header.addView(statusText)
        connectText = TextView(this).apply {
            text = ""
            textSize = 12f
            setTextColor(Color.rgb(147, 197, 253))
            setPadding(0, dp(4), 0, 0)
        }
        header.addView(connectText)

        setupPanel = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(10), 0, 0)
        }
        installButton = smallButton("Instalar local") { installLocal() }
        importButton = smallButton("Abrir app para importar") {
            loadAdminApp()
            showToast("Ingresa como admin y usa Importar datos existentes.")
        }
        val adminButton = smallButton("Abrir app") { loadAdminApp() }
        val captureButton = smallButton("Capturador") {
            startActivity(Intent(this, MainActivity::class.java).putExtra("server_url", "http://127.0.0.1:8787"))
        }
        setupPanel.addView(installButton, LinearLayout.LayoutParams(0, dp(44), 1f).apply { rightMargin = dp(6) })
        setupPanel.addView(importButton, LinearLayout.LayoutParams(0, dp(44), 1f).apply { rightMargin = dp(6) })
        setupPanel.addView(adminButton, LinearLayout.LayoutParams(0, dp(44), 1f).apply { rightMargin = dp(6) })
        setupPanel.addView(captureButton, LinearLayout.LayoutParams(0, dp(44), 1f))
        header.addView(setupPanel)
        root.addView(header)

        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(15, 23, 42))
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.mediaPlaybackRequiresUserGesture = false
        }
        root.addView(webView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }

    private fun installLocal() {
        lifecycleScope.launch {
            setBusy("Instalando base local Android...")
            runCatching { postJson("/api/install", JSONObject()) }
                .onSuccess {
                    showToast("Base local instalada")
                    refreshStatus()
                    webView.reload()
                }
                .onFailure { showError(it) }
        }
    }

    private fun importSupabase() {
        lifecycleScope.launch {
            setBusy("Importando datos desde Supabase...")
            importButton.isEnabled = false
            val body = JSONObject()
                .put("supabaseUrl", SUPABASE_URL)
                .put("supabaseKey", SUPABASE_ANON_KEY)
                .put("pageSize", 1000)
            runCatching {
                val result = postJson("/api/import-from-supabase", body)
                val totals = result.optJSONObject("totals") ?: JSONObject()
                if (result.optString("status") == "error" || totals.optInt("errors", 0) > 0 && totals.optInt("fetched", 0) == 0) {
                    error("No se pudo importar con el acceso nativo. Inicia sesion en la app y usa Importar datos existentes.")
                }
                result
            }.onSuccess {
                    showToast("Importacion completa")
                    refreshStatus()
                    webView.reload()
                }
                .onFailure { showError(it) }
            importButton.isEnabled = true
        }
    }

    private fun loadAdminApp() {
        webView.loadUrl(LOCAL_APP_URL)
    }

    private suspend fun refreshStatus() {
        val status = withContext(Dispatchers.IO) { getJson("/api/status") }
        val installed = status.optBoolean("installed", false)
        val imported = status.optString("importedAt").let { it.isNotBlank() && it != "null" }
        val products = status.optJSONObject("counts")?.optInt("productos", 0) ?: 0
        val sessions = status.optJSONObject("counts")?.optInt("operatorScanSessions", 0) ?: 0
        statusDot.setTextColor(if (installed) Color.rgb(34, 197, 94) else Color.rgb(250, 204, 21))
        statusText.text = if (installed) {
            if (imported) "Base oficial local activa. Insumos: $products. Sesiones escaneo: $sessions."
            else "Backend local instalado. Falta importar datos existentes."
        } else {
            "Backend Android activo. Falta instalar la base local."
        }
        val lanUrl = server.connectionUrls().firstOrNull { !it.contains("127.0.0.1") } ?: "http://127.0.0.1:8787"
        connectText.text = "Conecta capturador en: $lanUrl"
        setupPanel.visibility = View.VISIBLE
        installButton.visibility = if (imported) View.GONE else View.VISIBLE
        installButton.isEnabled = !installed
        installButton.text = if (installed) "Base local instalada" else "Instalar local"
        installButton.setBackgroundColor(if (installed) Color.rgb(22, 101, 52) else Color.rgb(30, 41, 59))
        importButton.visibility = if (installed && !imported) View.VISIBLE else View.GONE
        importButton.text = "Abrir app para importar"
    }

    private suspend fun getJson(path: String): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("http://127.0.0.1:8787$path").get().build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}: $text")
            JSONObject(text)
        }
    }

    private suspend fun postJson(path: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("http://127.0.0.1:8787$path")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}: $text")
            JSONObject(text)
        }
    }

    private fun setBusy(message: String) {
        statusDot.setTextColor(Color.rgb(250, 204, 21))
        statusText.text = message
    }

    private fun showError(error: Throwable) {
        statusDot.setTextColor(Color.rgb(248, 113, 113))
        statusText.text = error.message ?: "Error en tablet oficial."
        Toast.makeText(this, statusText.text, Toast.LENGTH_LONG).show()
    }

    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun smallButton(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 12f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(30, 41, 59))
            setOnClickListener { action() }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val LOCAL_APP_URL = "http://127.0.0.1:8787/"
        private const val SUPABASE_URL = "https://kfobwrcxvqygmfvvccfl.supabase.co"
        private const val SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb2J3cmN4dnF5Z21mdnZjY2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY0MTQsImV4cCI6MjA5NTgxMjQxNH0.hgGBTlCDtz3gbBTxnwmikVEtM6FFzRI1pL5BzgRFTPI"
    }
}
