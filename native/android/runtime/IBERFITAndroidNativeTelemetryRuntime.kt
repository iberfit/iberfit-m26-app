package cl.iberfit.nativebridge.runtime

import android.content.Context
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

class IBERFITAndroidNativeTelemetryRuntime(
    context: Context,
    webView: WebView,
    allowedOrigins: Set<String>
) {
    private var executionId: String? = null
    private var active = false
    private lateinit var web: IBERFITAndroidWebRuntime

    private val ble = IBERFITBleHeartRateRuntime(context) { sample ->
        web.emitSample(
            JSONObject()
                .put("provider", sample.provider)
                .put("heartRateBpm", sample.heartRateBpm)
                .put("rrIntervalsMs", JSONArray(sample.rrIntervalsMs))
                .put("quality", sample.quality)
                .put("recordedAt", Instant.now().toString())
        )
    }

    private val dataLayer = IBERFITWearDataLayerRuntime(
        context,
        onSample = { sample ->
            ble.stop()
            web.emitSample(sample)
        },
        onCommand = { _, _ -> }
    )

    init {
        web = IBERFITAndroidWebRuntime(webView, allowedOrigins) { action, payload ->
            val id = payload.optString("executionId").ifBlank { executionId }
            if (action == "start") { executionId = id; active = true }
            if (action == "stop") active = false

            dataLayer.startListening()
            dataLayer.sendCommand(action, executionId) { sentToWatch ->
                if (!sentToWatch) {
                    when (action) {
                        "start" -> ble.start()
                        "pause" -> ble.pause()
                        "resume" -> ble.resume()
                        "stop" -> ble.stop()
                    }
                } else if (action == "start") {
                    ble.stop()
                }
            }
            if (action == "stop") dataLayer.stopListening()
        }
    }

    fun destroy() {
        active = false
        ble.stop()
        dataLayer.stopListening()
    }
}
