package cl.iberfit.m26.wear

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderChange
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderError
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderSnapshot
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionContext
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionListener
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionManager
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import cl.iberfit.nativebridge.wear.IBERFITWearHealthServicesBridge
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

class WearMainActivity : Activity() {
    companion object {
        private const val REQUEST_HEART_RATE_PERMISSION = 5704
        private const val READ_HEART_RATE_PERMISSION =
            "android.permission.health.READ_HEART_RATE"
    }

    private lateinit var status: TextView
    private lateinit var dataLayer: IBERFITWearDataLayerRuntime
    private lateinit var healthProvider: IBERFITWearHealthServicesBridge
    private lateinit var sessionManager: IBERFITHeartRateSessionManager

    private var pendingStartExecutionId: String? = null

    private val sessionListener =
        object : IBERFITHeartRateSessionListener {
            override fun onPrimaryProviderChanged(
                change: IBERFITHeartRateProviderChange
            ) {
                runOnUiThread {
                    status.text =
                        "Provider FC: " +
                            (
                                change.nextProviderId ?:
                                    "sin provider primario"
                            )
                }
            }

            override fun onProviderStateChanged(
                snapshot: IBERFITHeartRateProviderSnapshot
            ) {
                runOnUiThread {
                    status.text =
                        "FC ${snapshot.descriptor.providerId} Â· " +
                            snapshot.state
                }
            }

            override fun onHeartRateSample(
                sample: IBERFITHeartRateSample
            ) {
                dataLayer.sendSample(sample.toDataLayerJson())

                runOnUiThread {
                    status.text =
                        "FC ${sample.bpm} bpm Â· " +
                            "${sample.providerId} Â· " +
                            "${sample.executionId ?: "sin executionId"}"
                }
            }

            override fun onProviderError(
                error: IBERFITHeartRateProviderError
            ) {
                runOnUiThread {
                    status.text =
                        "FC provider error Â· ${error.code} Â· " +
                            "${error.message ?: "sin detalle"}"
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        status = TextView(this).apply {
            text = "IBERFIT Wear Â· preparando"
            textSize = 16f
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 32, 24, 24)
            addView(status)
        }
        setContentView(root)

        healthProvider = IBERFITWearHealthServicesBridge(this)
        sessionManager =
            IBERFITHeartRateSessionManager(
                listOf(healthProvider)
            )

        dataLayer = IBERFITWearDataLayerRuntime(
            this,
            onSample = { },
            onCommand = { action, payload ->
                val commandExecutionId =
                    payload.optString("executionId")
                runOnUiThread {
                    handleCommand(
                        action,
                        commandExecutionId
                    )
                }
            }
        )

        dataLayer.startListening()

        status.text =
            "IBERFIT Wear Â· DataLayer + provider FC listos"
    }

    private fun handleCommand(
        action: String,
        commandExecutionId: String?
    ) {
        when (action) {
            "start" -> requestStart(commandExecutionId)
            "pause" -> sessionManager.pause()
            "resume" -> sessionManager.resume()
            "stop" -> stopHeartRateSession()
        }
    }

    private fun requestStart(
        commandExecutionId: String?
    ) {
        pendingStartExecutionId =
            commandExecutionId?.takeIf { it.isNotBlank() }

        if (!hasHeartRatePermission()) {
            status.text =
                "IBERFIT Wear Â· solicitando permiso de FC"
            requestPermissions(
                arrayOf(requiredHeartRatePermission()),
                REQUEST_HEART_RATE_PERMISSION
            )
            return
        }

        startHeartRateSession()
    }

    private fun startHeartRateSession() {
        val now = System.currentTimeMillis()
        val executionId =
            pendingStartExecutionId ?:
                "wear-$now"

        pendingStartExecutionId = null

        val started = sessionManager.start(
            context =
                IBERFITHeartRateSessionContext(
                    sessionId = "hr-$executionId",
                    executionId = executionId,
                    startedAtEpochMs = now
                ),
            listener = sessionListener,
            preferredProviderId =
                IBERFITWearHealthServicesBridge.PROVIDER_ID
        )

        if (!started) {
            status.text =
                "IBERFIT Wear Â· sin provider FC disponible"
        }
    }

    private fun stopHeartRateSession() {
        pendingStartExecutionId = null
        sessionManager.stop()
        status.text =
            "IBERFIT Wear Â· sesiÃ³n FC detenida"
    }

    private fun requiredHeartRatePermission(): String =
        if (Build.VERSION.SDK_INT >= 36) {
            READ_HEART_RATE_PERMISSION
        } else {
            Manifest.permission.BODY_SENSORS
        }

    private fun hasHeartRatePermission(): Boolean =
        checkSelfPermission(requiredHeartRatePermission()) ==
            PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(
            requestCode,
            permissions,
            grantResults
        )

        if (
            requestCode !=
                REQUEST_HEART_RATE_PERMISSION
        ) {
            return
        }

        if (
            grantResults.isNotEmpty() &&
            grantResults[0] ==
                PackageManager.PERMISSION_GRANTED
        ) {
            status.text =
                "IBERFIT Wear Â· permiso de FC concedido"
            startHeartRateSession()
        } else {
            pendingStartExecutionId = null
            status.text =
                "IBERFIT Wear Â· permiso de FC denegado"
        }
    }

    private fun IBERFITHeartRateSample.toDataLayerJson():
        JSONObject {
        val json = JSONObject()
            .put("type", "sample")
            .put("provider", providerId)
            .put("heartRateBpm", bpm)
            .put("quality", quality.name.lowercase())
            .put("deviceType", deviceType.name.lowercase())
            .put("contactStatus", contactStatus.name.lowercase())
            .put("receivedAtEpochMs", receivedAtEpochMs)
            .put(
                "recordedAt",
                Instant.ofEpochMilli(
                    recordedAtEpochMs ?: receivedAtEpochMs
                ).toString()
            )

        recordedAtEpochMs?.let {
            json.put("recordedAtEpochMs", it)
        }

        latencyMs?.let {
            json.put("latencyMs", it)
        }

        deviceId?.takeIf { it.isNotBlank() }?.let {
            json.put("deviceId", it)
        }

        executionId?.takeIf { it.isNotBlank() }?.let {
            json.put("executionId", it)
        }

        sessionId?.takeIf { it.isNotBlank() }?.let {
            json.put("sessionId", it)
        }

        val rrIntervals = JSONArray()
        rrIntervalsMs.forEach {
            rrIntervals.put(it)
        }
        json.put("rrIntervalsMs", rrIntervals)

        return json
    }

    override fun onDestroy() {
        sessionManager.stop()
        dataLayer.stopListening()
        healthProvider.close()
        super.onDestroy()
    }
}