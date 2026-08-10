package cl.iberfit.nativebridge.runtime

import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class IBERFITAndroidWebRuntime(
    private val webView: WebView,
    allowedOrigins: Set<String>,
    private val onCommand: (String, JSONObject) -> Unit
) {
    companion object {
        const val JS_OBJECT = "IBERFIT_ANDROID_LIVE_TELEMETRY"
        const val EVENT_NAME = "iberfit:native-live-telemetry"
    }

    init {
        require(allowedOrigins.isNotEmpty())
        require(allowedOrigins.none { it == "*" || it.contains("*://") })
        require(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
        WebViewCompat.addWebMessageListener(
            webView,
            JS_OBJECT,
            allowedOrigins,
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: android.net.Uri,
                    isMainFrame: Boolean,
                    replyProxy: androidx.webkit.JavaScriptReplyProxy
                ) {
                    if (!isMainFrame) return
                    val payload = runCatching { JSONObject(message.data ?: "") }.getOrNull() ?: return
                    val action = payload.optString("action")
                    if (action in setOf("start", "pause", "resume", "stop")) onCommand(action, payload)
                }
            }
        )
    }

    fun emitSample(sample: JSONObject) {
        val encoded = JSONObject.quote(sample.toString())
        val script = """
            (() => {
              const sample = JSON.parse($encoded);
              window.dispatchEvent(new CustomEvent(
                '$EVENT_NAME',
                { detail: { type: 'sample', sample } }
              ));
            })();
        """.trimIndent()
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
