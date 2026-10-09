package cl.iberfit.m26.phone

import android.content.pm.ApplicationInfo
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import cl.iberfit.healthconnect.IberfitHealthConnectReader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * Canary DEBUG transport proof, NOT a certified health integration.
 *
 * Security properties:
 * - exact HTTPS Canary origin + main-frame-only messages; navigation escapes blocked
 * - no legacy script-object injection, no tokens, client IDs or background reads
 * - a real, local Android button enables ONE read (7 civil days maximum)
 * - Health Connect OS read permission is rechecked on every read
 * - never writes to Supabase or grants server-side consent
 * - disabled in release, never exposes IBERFIT_HEALTH_BRIDGE or productionAllowed
 */
class Connected360SecureWebViewActivity : ComponentActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var browser: WebView? = null
    private lateinit var status: TextView
    private var oneReadApproved = false
    private var readInFlight = false
    private val requestIds = LinkedHashSet<String>()
    private val readFence = Connected360PageFence()

    private fun trustedTopPage(view: WebView): Boolean {
        val url = view.url ?: return false
        val uri = Uri.parse(url)
        return Connected360OriginGate.trusted(
            uri.scheme, uri.host, uri.port, uri.userInfo, true
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            finish()
            return
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(resources.getColor(R.color.iberfit_color_canvas, theme))
            setPadding(12, 20, 12, 12)
        }
        status = TextView(this).apply {
            text = "Canary QA · Sin conexión automática. Los datos no se envían al servidor desde Android."
            setTextColor(resources.getColor(R.color.iberfit_color_text_primary, theme))
            textSize = 15f
        }
        root.addView(status)
        val approve = Button(this).apply {
            text = "Permitir UNA lectura local para Canary (QA)"
            setOnClickListener {
                if (readInFlight) return@setOnClickListener
                oneReadApproved = true
                status.text = "Lectura de prueba habilitada una sola vez. Autoriza en Android antes de consultarla."
            }
        }
        root.addView(approve)
        val permissions = Button(this).apply {
            text = "Revisar permisos de Health Connect en Android"
            setOnClickListener {
                oneReadApproved = false
                startActivity(
                    android.content.Intent(
                        this@Connected360SecureWebViewActivity,
                        Connected360HealthPermissionsActivity::class.java
                    )
                )
            }
        }
        root.addView(permissions)
        setContentView(root)

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            status.text = "Android WebView no soporta el canal seguro: integración deshabilitada."
            return
        }

        val view = WebView(this)
        browser = view
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
        WebView.setWebContentsDebuggingEnabled(false)
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(target: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url
                val allowed = Connected360OriginGate.trusted(
                    uri.scheme, uri.host, uri.port, uri.userInfo, true
                )
                if (!allowed) {
                    oneReadApproved = false
                    readFence.retire()
                    status.text = "Navegación externa bloqueada."
                }
                return !allowed
            }
            override fun onPageStarted(target: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                oneReadApproved = false
                readFence.retire()
                requestIds.clear()
            }
            override fun onReceivedSslError(target: WebView, handler: SslErrorHandler, error: SslError) {
                oneReadApproved = false
                readFence.retire()
                handler.cancel()
                status.text = "Error de certificado TLS. Canal bloqueado."
            }
        }
        WebViewCompat.addWebMessageListener(
            view,
            Connected360OriginGate.CHANNEL,
            setOf(Connected360OriginGate.QA_ORIGIN),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    target: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy,
                ) {
                    if (target !== view ||
                        !Connected360OriginGate.trusted(
                            sourceOrigin.scheme, sourceOrigin.host, sourceOrigin.port,
                            sourceOrigin.userInfo, isMainFrame
                        ) || !trustedTopPage(view)) return
                    val raw = message.data ?: return
                    if (raw.length !in 2..1024) return
                    val request = runCatching { JSONObject(raw) }.getOrNull() ?: return
                    val id = request.optString("requestId", "")
                    if (!Connected360OriginGate.requestIdAllowed(id) || !requestIds.add(id)) return
                    if (requestIds.size > 128) requestIds.remove(requestIds.first())
                    val schema = request.optString("schema", "")
                    val action = request.optString("action", "")
                    if (schema != "iberfit.connected360.qa.request.v1") return
                    when (action) {
                        "status" -> {
                            // Kept false on purpose: this is not the certified automatic bridge.
                            val response = JSONObject()
                                .put("schema", "iberfit.connected360.qa.bridge.v1")
                                .put("requestId", id)
                                .put("available", false)
                                .put("connected", false)
                                .put("reason", "M26_NATIVE_BRIDGE_NOT_CERTIFIED")
                            replyProxy.postMessage(response.toString())
                        }
                        "health.readDaily" -> {
                            if (readInFlight || !oneReadApproved) {
                                replyError(replyProxy, id, "M26_HEALTH_LOCAL_APPROVAL_REQUIRED")
                                return
                            }
                            // Consume approval BEFORE suspension. Bind this read to
                            // exactly the document generation that requested it.
                            oneReadApproved = false
                            val documentLease = readFence.capture()
                            val days = request.optInt("days", -1)
                            val metricsArray = request.optJSONArray("metrics")
                            val metrics = if (metricsArray != null) {
                                (0 until metricsArray.length()).mapNotNull {
                                    metricsArray.optString(it).takeIf { v -> v.isNotBlank() }
                                }.toSet()
                            } else emptySet()
                            if (days !in 1..7 || metrics.isEmpty() ||
                                metrics.size > 3 || metrics.any {
                                    it !in IberfitHealthConnectReader.supportedMetrics
                                }) {
                                replyError(replyProxy, id, "M26_HEALTH_REQUEST_INVALID")
                                return
                            }
                            readInFlight = true
                            scope.launch {
                                try {
                                    if (HealthConnectClient.getSdkStatus(this@Connected360SecureWebViewActivity)
                                        != HealthConnectClient.SDK_AVAILABLE) {
                                        throw IllegalStateException("M26_HEALTH_CONNECT_UNAVAILABLE")
                                    }
                                    val client = HealthConnectClient.getOrCreate(
                                        this@Connected360SecureWebViewActivity
                                    )
                                    val reader = IberfitHealthConnectReader(client)
                                    val permitted = reader.grantedMetrics(metrics)
                                    if (permitted.isEmpty()) {
                                        throw IllegalStateException("M26_HEALTH_PERMISSION_REQUIRED")
                                    }
                                    val records = reader.readDaily(permitted, days)
                                    if (!readFence.isCurrent(documentLease) ||
                                        browser !== view || isFinishing || isDestroyed || !trustedTopPage(view)) {
                                        return@launch
                                    }
                                    val summaries = JSONArray()
                                    for (record in records) {
                                        val row = JSONObject()
                                            .put("provider", record.provider)
                                            .put("date", record.date)
                                            .put("acquiredAt", record.acquiredAt)
                                        if (record.steps != null) row.put("steps", record.steps)
                                        if (record.sleepMinutes != null) row.put("sleepMinutes", record.sleepMinutes)
                                        if (record.restingHeartRate != null) {
                                            row.put("restingHeartRate", record.restingHeartRate)
                                        }
                                        summaries.put(row)
                                    }
                                    // No userId, clientId, token, grant, or invented source timestamp.
                                    replyProxy.postMessage(JSONObject()
                                        .put("schema", "iberfit.connected360.qa.read.v1")
                                        .put("requestId", id)
                                        .put("provider", "health_connect")
                                        .put("grantedMetrics", JSONArray(permitted.sorted()))
                                        .put("records", summaries)
                                        .put("persisted", false)
                                        .toString())
                                    status.text = "Lectura local de QA completada. No sincronizada con IBERFIT."
                                } catch (_: Exception) {
                                    if (readFence.isCurrent(documentLease) &&
                                        browser === view && !isFinishing && !isDestroyed && trustedTopPage(view)) {
                                        replyError(replyProxy, id, "M26_HEALTH_PERMISSION_OR_READ_FAILED")
                                        status.text = "Lectura fallida o permiso ausente. Revisa Android."
                                    }
                                } finally {
                                    readInFlight = false
                                }
                            }
                        }
                        else -> replyError(replyProxy, id, "M26_HEALTH_ACTION_UNSUPPORTED")
                    }
                }
            }
        )
        root.addView(view, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        view.loadUrl(Connected360OriginGate.QA_ORIGIN + "/m26/")
    }

    private fun replyError(proxy: JavaScriptReplyProxy, id: String, code: String) {
        proxy.postMessage(JSONObject()
            .put("schema", "iberfit.connected360.qa.error.v1")
            .put("requestId", id)
            .put("error", code)
            .toString())
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        val view = browser
        if (view?.canGoBack() == true) view.goBack() else super.onBackPressed()
    }

    override fun onStop() {
        oneReadApproved = false
        readFence.retire()
        super.onStop()
    }

    override fun onDestroy() {
        readFence.retire()
        scope.cancel()
        oneReadApproved = false
        browser?.let {
            it.stopLoading()
            it.loadUrl("about:blank")
            it.destroy()
        }
        browser = null
        super.onDestroy()
    }
}
