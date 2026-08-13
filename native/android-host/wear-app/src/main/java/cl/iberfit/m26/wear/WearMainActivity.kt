package cl.iberfit.m26.wear

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import cl.iberfit.nativebridge.runtime.IBERFITWearDataLayerRuntime
import cl.iberfit.nativebridge.wear.IBERFITWearHealthServicesBridge
import java.time.Instant
import org.json.JSONObject

class WearMainActivity : Activity() {
    companion object {
        private const val REQUEST_HEART_RATE_PERMISSION = 5704
        private const val READ_HEART_RATE_PERMISSION =
            "android.permission.health.READ_HEART_RATE"
    }

    private lateinit var status: TextView
    private lateinit var dataLayer: IBERFITWearDataLayerRuntime
    private lateinit var health: IBERFITWearHealthServicesBridge

    private var executionId: String? = null
    private var callbackRegistered = false
    private var startRequested = false
    private var exerciseStarted = false

    private val exerciseCallback = object : ExerciseUpdateCallback {
        override fun onRegistered() {
            callbackRegistered = true
            runOnUiThread {
                status.text = "Health Services Â· callback registrado"
                maybeStartExercise()
            }
        }

        override fun onRegistrationFailed(throwable: Throwable) {
            callbackRegistered = false
            runOnUiThread {
                status.text =
                    "Health Services Â· error callback Â· ${throwable.javaClass.simpleName}"
            }
        }

        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val state = update.exerciseStateInfo.state
            if (state.isEnded) {
                exerciseStarted = false
            }

            val heartRatePoints = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
            heartRatePoints.forEach { point ->
                val bpm = health.validateHeartRate(point.value) ?: return@forEach
                val sample = JSONObject()
                    .put("type", "sample")
                    .put("provider", "wear_os_health_services")
                    .put("heartRateBpm", bpm)
                    .put("quality", "alta")
                    .put("recordedAt", Instant.now().toString())

                executionId?.takeIf { it.isNotBlank() }?.let {
                    sample.put("executionId", it)
                }

                dataLayer.sendSample(sample)
                runOnUiThread {
                    status.text =
                        "FC $bpm bpm Â· ${state} Â· ${executionId ?: "sin executionId"}"
                }
            }

            if (heartRatePoints.isEmpty()) {
                runOnUiThread {
                    status.text =
                        "Health Services Â· ${state} Â· esperando FC"
                }
            }
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {
            // IBERFIT RC57 does not use laps.
        }

        override fun onAvailabilityChanged(
            dataType: androidx.health.services.client.data.DataType<*, *>,
            availability: Availability
        ) {
            if (dataType == DataType.HEART_RATE_BPM) {
                runOnUiThread {
                    status.text = "FC disponibilidad Â· $availability"
                }
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

        health = IBERFITWearHealthServicesBridge(this)
        dataLayer = IBERFITWearDataLayerRuntime(
            this,
            onSample = { },
            onCommand = { action, payload ->
                val commandExecutionId = payload.optString("executionId")
                runOnUiThread {
                    handleCommand(action, commandExecutionId)
                }
            }
        )

        dataLayer.startListening()
        health.exerciseClient.setUpdateCallback(exerciseCallback)

        status.text = "IBERFIT Wear Â· DataLayer + Health Services listos"
    }

    private fun handleCommand(action: String, commandExecutionId: String?) {
        when (action) {
            "start" -> requestStart(commandExecutionId)
            "pause" -> pauseExercise()
            "resume" -> resumeExercise()
            "stop" -> stopExercise()
        }
    }

    private fun requestStart(commandExecutionId: String?) {
        executionId = commandExecutionId?.takeIf { it.isNotBlank() }
        startRequested = true

        if (!hasHeartRatePermission()) {
            status.text = "IBERFIT Wear Â· solicitando permiso de FC"
            requestPermissions(
                arrayOf(requiredHeartRatePermission()),
                REQUEST_HEART_RATE_PERMISSION
            )
            return
        }

        maybeStartExercise()
    }

    private fun maybeStartExercise() {
        if (!startRequested || !callbackRegistered || exerciseStarted) return
        if (!hasHeartRatePermission()) return

        startRequested = false
        status.text = "Health Services Â· comprobando capacidades"

        val capabilitiesFuture = health.exerciseClient.getCapabilitiesAsync()
        capabilitiesFuture.addListener({
            try {
                val capabilities = capabilitiesFuture.get()
                if (ExerciseType.WORKOUT !in capabilities.supportedExerciseTypes) {
                    status.text = "Health Services Â· WORKOUT no soportado"
                    return@addListener
                }

                val workoutCapabilities =
                    capabilities.getExerciseTypeCapabilities(ExerciseType.WORKOUT)
                if (DataType.HEART_RATE_BPM !in workoutCapabilities.supportedDataTypes) {
                    status.text = "Health Services Â· HEART_RATE_BPM no soportado"
                    return@addListener
                }

                val config = ExerciseConfig(
                    exerciseType = ExerciseType.WORKOUT,
                    dataTypes = health.requestedDataTypes,
                    isAutoPauseAndResumeEnabled = false,
                    isGpsEnabled = false
                )

                status.text = "Health Services Â· iniciando ejercicio"
                val startFuture = health.exerciseClient.startExerciseAsync(config)
                startFuture.addListener({
                    try {
                        startFuture.get()
                        exerciseStarted = true
                        status.text =
                            "Health Services Â· ACTIVE Â· esperando frecuencia cardiaca"
                    } catch (throwable: Throwable) {
                        exerciseStarted = false
                        status.text =
                            "Health Services Â· START ERROR Â· ${rootCauseName(throwable)}"
                    }
                }, mainExecutor)
            } catch (throwable: Throwable) {
                status.text =
                    "Health Services Â· CAPABILITIES ERROR Â· ${rootCauseName(throwable)}"
            }
        }, mainExecutor)
    }

    private fun pauseExercise() {
        if (!exerciseStarted) {
            status.text = "Health Services Â· pause ignorado Â· sin ejercicio activo"
            return
        }

        val future = health.exerciseClient.pauseExerciseAsync()
        future.addListener({
            try {
                future.get()
                status.text = "Health Services Â· pausa solicitada"
            } catch (throwable: Throwable) {
                status.text =
                    "Health Services Â· PAUSE ERROR Â· ${rootCauseName(throwable)}"
            }
        }, mainExecutor)
    }

    private fun resumeExercise() {
        if (!exerciseStarted) {
            status.text = "Health Services Â· resume ignorado Â· sin ejercicio activo"
            return
        }

        val future = health.exerciseClient.resumeExerciseAsync()
        future.addListener({
            try {
                future.get()
                status.text = "Health Services Â· reanudaciÃ³n solicitada"
            } catch (throwable: Throwable) {
                status.text =
                    "Health Services Â· RESUME ERROR Â· ${rootCauseName(throwable)}"
            }
        }, mainExecutor)
    }

    private fun stopExercise() {
        startRequested = false

        if (!exerciseStarted) {
            status.text = "Health Services Â· stop Â· sin ejercicio activo"
            return
        }

        val future = health.exerciseClient.endExerciseAsync()
        future.addListener({
            try {
                future.get()
                exerciseStarted = false
                status.text = "Health Services Â· ejercicio finalizado"
            } catch (throwable: Throwable) {
                status.text =
                    "Health Services Â· STOP ERROR Â· ${rootCauseName(throwable)}"
            }
        }, mainExecutor)
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
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode != REQUEST_HEART_RATE_PERMISSION) return

        if (grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) {
            status.text = "IBERFIT Wear Â· permiso de FC concedido"
            maybeStartExercise()
        } else {
            startRequested = false
            status.text = "IBERFIT Wear Â· permiso de FC denegado"
        }
    }

    private fun rootCauseName(throwable: Throwable): String {
        var current = throwable
        while (current.cause != null && current.cause !== current) {
            current = current.cause!!
        }
        return current.javaClass.simpleName
    }

    override fun onDestroy() {
        dataLayer.stopListening()

        if (exerciseStarted) {
            health.exerciseClient.endExerciseAsync()
            exerciseStarted = false
        }
        health.exerciseClient.clearUpdateCallbackAsync(exerciseCallback)

        super.onDestroy()
    }
}