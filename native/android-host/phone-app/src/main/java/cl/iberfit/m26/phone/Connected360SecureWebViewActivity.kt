package cl.iberfit.m26.phone

import android.content.pm.ApplicationInfo
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
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
    private val production: Boolean by lazy {
        (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0
    }
    private var browser: WebView? = null
    private lateinit var status: TextView
    private var oneReadApproved = false
    private var approvedAtElapsedMs: Long? = null
    private var readInFlight = false
    private val requestIds = LinkedHashSet<String>()
    private val readFence = Connected360PageFence()

    private fun resetReadApproval() {
        oneReadApproved = false
        approvedAtElapsedMs = null
    }

    private fun trustedTopPage(view: WebView): Boolean {
        val url = view.url ?: return false
        val uri = Uri.parse(url)
        return Connected360OriginGate.trusted(
            uri.scheme, uri.host, uri.port, uri.userInfo, true, production
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Health preview may contain personal data: block captures and task snapshots.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(resources.getColor(R.color.iberfit_color_canvas, theme))
            setPadding(12, 20, 12, 12)
        }
        status = TextView(this).apply {
            text = if (production) "IBERFIT · Salud y dispositivos" else
                "Canary QA · Lecturas locales de diagnóstico."
            setTextColor(resources.getColor(R.color.iberfit_color_text_primary, theme))
            textSize = 15f
        }
        root.addView(status)
        val approve = Button(this).apply {
            text = "Permitir UNA lectura local para Canary (QA)"
            setOnClickListener {
                if (readInFlight) return@setOnClickListener
                oneReadApproved = true
                approvedAtElapsedMs = SystemClock.elapsedRealtime()
                status.text = "Lectura habilitada una sola vez durante 2 minutos. Puedes consultar ahora los datos locales."
            }
        }
        if (!production) root.addView(approve)
        val permissions = Button(this).apply {
            text = if (production) "Gestionar permisos de salud" else "Revisar permisos de Health Connect en Android"
            setOnClickListener {
                resetReadApproval()
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
                    uri.scheme, uri.host, uri.port, uri.userInfo, true, production
                )
                if (!allowed) {
                    resetReadApproval()
                    readFence.retire()
                    status.text = "Navegación externa bloqueada."
                }
                return !allowed
            }
            override fun onPageStarted(target: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                resetReadApproval()
                readFence.retire()
                requestIds.clear()
            }
            override fun onReceivedSslError(target: WebView, handler: SslErrorHandler, error: SslError) {
                resetReadApproval()
                readFence.retire()
                handler.cancel()
                status.text = "Error de certificado TLS. Canal bloqueado."
            }
        }
        WebViewCompat.addWebMessageListener(
            view,
            Connected360OriginGate.channel(production),
            setOf(Connected360OriginGate.origin(production)),
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
                            sourceOrigin.userInfo, isMainFrame, production
                        ) || !trustedTopPage(view)) return
                    val raw = message.data ?: return
                    if (raw.length !in 2..1024) return
                    val request = runCatching { JSONObject(raw) }.getOrNull() ?: return
                    val id = request.optString("requestId", "")
                    if (!Connected360OriginGate.requestIdAllowed(id)) return
                    val schema = request.optString("schema", "")
                    val action = request.optString("action", "")
                    if (schema != (if (production)
                        "iberfit.connected360.native.request.v1"
                      else "iberfit.connected360.qa.request.v1")) return
                    if (action == "health.invalidate") {
                        // A session logout revokes the local approval, even if
                        // no data read has started. No auth token is sent.
                        resetReadApproval()
                        readFence.retire()
                        status.text = "Autorización local retirada. No se han enviado datos."
                        return
                    }
                    // For reads, reject replayed request identifiers.
                    if (!requestIds.add(id)) return
                    if (requestIds.size > 128) requestIds.remove(requestIds.first())
                    when (action) {
                        "health.permissions" -> {
                            if (production && !readInFlight) {
                                resetReadApproval()
                                readFence.retire()
                                startActivity(android.content.Intent(
                                    this@Connected360SecureWebViewActivity,
                                    Connected360HealthPermissionsActivity::class.java
                                ))
                            } else replyError(replyProxy,id,"M26_HEALTH_ACTION_UNSUPPORTED")
                        }
                        "status" -> {
                            // Kept false on purpose: this is not the certified automatic bridge.
                            val response = JSONObject()
                                .put("schema", if (production)
                                    "iberfit.connected360.native.bridge.v1"
                                else "iberfit.connected360.qa.bridge.v1")
                                .put("requestId", id)
                                .put("available", production)
                                .put("connected", production)
                                .put("reason", if (production) "ANDROID_RELEASE_LOCAL_READER" else
                                    "M26_NATIVE_BRIDGE_NOT_CERTIFIED")
                            replyProxy.postMessage(response.toString())
                        }
                        "health.readDaily" -> {
                            if (readInFlight || (!production && !oneReadApproved)) {
                                replyError(replyProxy, id, "M26_HEALTH_LOCAL_APPROVAL_REQUIRED")
                                return
                            }
                            if (!production && !Connected360LocalApprovalLease.isCurrent(
                                    approvedAtElapsedMs, SystemClock.elapsedRealtime()
                                )) {
                                resetReadApproval()
                                replyError(replyProxy, id, "M26_HEALTH_LOCAL_APPROVAL_EXPIRED")
                                status.text = "La autorización de prueba ha caducado. Pulsa de nuevo Permitir UNA lectura."
                                return
                            }
                            // Consume approval BEFORE suspension. Bind this read to
                            // exactly the document generation that requested it.
                            resetReadApproval()
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
                                    // Bound the entire OS read (availability, grants and data).
                                    // The web caller expires after 30s; Android must release
                                    // its in-flight guard first to keep manual retry possible.
                                    val (permitted, records) = Connected360ReadBudget.run {
                                        if (HealthConnectClient.getSdkStatus(
                                                this@Connected360SecureWebViewActivity
                                            ) != HealthConnectClient.SDK_AVAILABLE) {
                                            throw IllegalStateException("M26_HEALTH_CONNECT_UNAVAILABLE")
                                        }
                                        val client = HealthConnectClient.getOrCreate(
                                            this@Connected360SecureWebViewActivity
                                        )
                                        val reader = IberfitHealthConnectReader(client)
                                        val granted = reader.grantedMetrics(metrics)
                                        if (granted.isEmpty()) {
                                            throw IllegalStateException("M26_HEALTH_PERMISSION_REQUIRED")
                                        }
                                        granted to reader.readDaily(granted, days)
                                    }
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
                                            .put("aggregationTimeZone", record.aggregationTimeZone)
                                        if (record.contributingOriginCount != null) {
                                            row.put("contributingOriginCount", record.contributingOriginCount)
                                        }
                                        if (record.steps != null) row.put("steps", record.steps)
                                        if (record.sleepMinutes != null) row.put("sleepMinutes", record.sleepMinutes)
                                        if (record.restingHeartRate != null) {
                                            row.put("restingHeartRate", record.restingHeartRate)
                                        }
                                        summaries.put(row)
                                    }
                                    // Do not include account identifiers, authentication credentials, grants or fabricated source timestamps.
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
                        "health.readV46" -> {
                            if (readInFlight || (!production && !oneReadApproved)) {
                                replyError(replyProxy, id, "M26_HEALTH_LOCAL_APPROVAL_REQUIRED")
                                return
                            }
                            if (!production && !Connected360LocalApprovalLease.isCurrent(
                                    approvedAtElapsedMs, SystemClock.elapsedRealtime()
                                )) {
                                resetReadApproval()
                                replyError(replyProxy, id, "M26_HEALTH_LOCAL_APPROVAL_EXPIRED")
                                return
                            }
                            val requestedArray = request.optJSONArray("metrics")
                            val requested = if (requestedArray != null) {
                                (0 until requestedArray.length()).mapNotNull {
                                    requestedArray.optString(it).takeIf { value -> value.isNotBlank() }
                                }.toSet()
                            } else emptySet()
                            if (request.optInt("days", -1) != 7 ||
                                requested.isEmpty() || requested.size > 2 ||
                                requested.any { it !in setOf("generalHeartRate", "exerciseSessions") }
                            ) {
                                replyError(replyProxy, id, "M26_HEALTH_V46_REQUEST_INVALID")
                                return
                            }
                            // A new user action is mandatory for every QA read, never an
                            // automatic OS read after a foreground transition.
                            resetReadApproval()
                            val documentLease = readFence.capture()
                            readInFlight = true
                            scope.launch {
                                try {
                                    val (grantedMetrics, payload) = Connected360ReadBudget.run {
                                        if (HealthConnectClient.getSdkStatus(
                                                this@Connected360SecureWebViewActivity
                                            ) != HealthConnectClient.SDK_AVAILABLE) {
                                            throw IllegalStateException("M26_HEALTH_CONNECT_UNAVAILABLE")
                                        }
                                        val client = HealthConnectClient.getOrCreate(
                                            this@Connected360SecureWebViewActivity
                                        )
                                        val osPermissions = client.permissionController
                                            .getGrantedPermissions()
                                        val allowed = requested.filterTo(linkedSetOf()) { metric ->
                                            when (metric) {
                                                "generalHeartRate" ->
                                                    Connected360GeneralHeartRateDiagnostic.permission in osPermissions
                                                "exerciseSessions" ->
                                                    Connected360WorkoutReadOnlyQa.requiredPermission in osPermissions
                                                else -> false
                                            }
                                        }
                                        if (allowed.isEmpty()) {
                                            throw IllegalStateException("M26_HEALTH_PERMISSION_REQUIRED")
                                        }
                                        val daily = if ("generalHeartRate" in allowed) {
                                            Connected360GeneralHeartRateDiagnostic(client)
                                                .readDailyRanges()
                                        } else emptyList()
                                        val sports = if ("exerciseSessions" in allowed) {
                                            Connected360WorkoutReadOnlyQa(client)
                                                .read(includeHeartRate = "generalHeartRate" in allowed)
                                                .workouts
                                        } else emptyList()
                                        val data = Connected360V46QaEnvelope.build(
                                            daily, sports, java.time.ZoneId.systemDefault(),
                                            java.time.Instant.now()
                                        )
                                        allowed to data
                                    }
                                    if (!readFence.isCurrent(documentLease) ||
                                        browser !== view || isFinishing || isDestroyed ||
                                        !trustedTopPage(view)) {
                                        return@launch
                                    }
                                    val response = JSONObject()
                                        .put("schema", if (production)
                                            "iberfit.connected360.native.v46.local.v1"
                                        else "iberfit.connected360.qa.v46.local.v1")
                                        .put("requestId", id)
                                        .put("provider", "health_connect")
                                        .put("grantedMetrics", JSONArray(grantedMetrics.sorted()))
                                        .put("envelope", JSONObject(payload).apply {
                                            if (production) put("schema",
                                                "iberfit.connected360.v46.ingest.v1")
                                        })
                                        .put("persisted", false)
                                        .put("automatic", false)
                                        .toString()
                                    if (response.length > 32000) {
                                        replyError(replyProxy, id, "M26_HEALTH_V46_RESPONSE_TOO_LARGE")
                                        return@launch
                                    }
                                    replyProxy.postMessage(response)
                                    status.text = if (production)
                                        "Lectura local completada. IBERFIT verifica los permisos antes de guardar."
                                    else "Lectura V46 local completada. No se han enviado datos a IBERFIT."
                                } catch (_: Exception) {
                                    if (readFence.isCurrent(documentLease) &&
                                        browser === view && !isFinishing && !isDestroyed &&
                                        trustedTopPage(view)) {
                                        replyError(replyProxy, id, "M26_HEALTH_PERMISSION_OR_READ_FAILED")
                                        status.text = "Lectura V46 no disponible. Revisa permisos y vuelve a intentar."
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
        view.loadUrl(Connected360OriginGate.origin(production) + "/m26/")
    }

    private fun replyError(proxy: JavaScriptReplyProxy, id: String, code: String) {
        proxy.postMessage(JSONObject()
            .put("schema", if (production)
                "iberfit.connected360.native.error.v1"
            else "iberfit.connected360.qa.error.v1")
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
        resetReadApproval()
        readFence.retire()
        super.onStop()
    }

    override fun onDestroy() {
        readFence.retire()
        scope.cancel()
        resetReadApproval()
        browser?.let {
            it.stopLoading()
            it.loadUrl("about:blank")
            it.destroy()
        }
        browser = null
        super.onDestroy()
    }
}
