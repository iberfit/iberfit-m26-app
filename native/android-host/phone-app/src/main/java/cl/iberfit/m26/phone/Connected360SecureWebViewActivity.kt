package cl.iberfit.m26.phone

import android.annotation.SuppressLint
import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.http.SslError
import android.widget.LinearLayout
import android.widget.TextView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * CANARY QA ONLY, NOT a wearable connection, native authorization, or data sync.
 *
 * The single origin-pinned, main-frame-only message channel responds only with
 * a disabled bridge capability. No tokens, client identifiers, grants, health
 * data or native permissions cross the boundary. Future enabled methods must
 * validate server consent per request and must not reuse this QA channel.
 */
class Connected360SecureWebViewActivity : Activity() {
    private var browser: WebView? = null
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(resources.getColor(R.color.iberfit_color_canvas, theme))
            setPadding(12, 20, 12, 12)
        }
        status = TextView(this).apply {
            text = "IBERFIT Canary · Navegación web de pruebas. Health Connect NO está vinculado."
            setTextColor(resources.getColor(R.color.iberfit_color_text_primary, theme))
            textSize = 15f
        }
        root.addView(status)
        setContentView(root)

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            status.text = "Este Android WebView no soporta el canal seguro requerido. No se abrirá la integración."
            return
        }

        val view = WebView(this)
        browser = view
        val options = view.settings
        options.javaScriptEnabled = true
        options.domStorageEnabled = true
        options.allowFileAccess = false
        options.allowContentAccess = false
        options.javaScriptCanOpenWindowsAutomatically = false
        options.setSupportMultipleWindows(false)
        options.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false)
        WebView.setWebContentsDebuggingEnabled(false)
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                target: WebView,
                request: WebResourceRequest,
            ): Boolean {
                if (!request.isForMainFrame) return false
                val uri = request.url
                val allowed = Connected360OriginGate.trusted(
                    uri.scheme, uri.host, uri.port, uri.userInfo, true,
                )
                if (!allowed) {
                    status.text = "Navegación externa bloqueada en la prueba de seguridad."
                }
                return !allowed
            }

            override fun onReceivedSslError(
                target: WebView,
                handler: SslErrorHandler,
                error: SslError,
            ) {
                handler.cancel()
                status.text = "No se pudo verificar el certificado de la conexión. Navegación detenida."
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
                    if (target !== view || !Connected360OriginGate.trusted(
                            sourceOrigin.scheme,
                            sourceOrigin.host,
                            sourceOrigin.port,
                            sourceOrigin.userInfo,
                            isMainFrame,
                        )
                    ) return
                    val raw = message.data ?: return
                    if (raw.length !in 2..1024) return
                    val request = runCatching { JSONObject(raw) }.getOrNull() ?: return
                    val id = request.optString("requestId", "")
                    if (!Connected360OriginGate.requestIdAllowed(id)) return
                    // Never expose "IBERFIT_HEALTH_BRIDGE": the normal web app
                    // keeps productionAllowed=false until remote certification.
                    val response = JSONObject()
                        .put("schema", "iberfit.connected360.qa.bridge.v1")
                        .put("requestId", id)
                        .put("available", false)
                        .put("connected", false)
                        .put("reason", "M26_NATIVE_BRIDGE_NOT_CERTIFIED")
                    replyProxy.postMessage(response.toString())
                }
            },
        )
        root.addView(
            view,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
            ),
        )
        view.loadUrl(Connected360OriginGate.QA_ORIGIN + "/m26/")
    }

    override fun onBackPressed() {
        val view = browser
        if (view?.canGoBack() == true) {
            view.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        browser?.let {
            it.stopLoading()
            it.loadUrl("about:blank")
            it.destroy()
        }
        browser = null
        super.onDestroy()
    }
}
