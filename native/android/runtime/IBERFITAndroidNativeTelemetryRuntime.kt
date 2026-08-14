package cl.iberfit.nativebridge.runtime

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateQuality
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

class IBERFITAndroidNativeTelemetryRuntime(
    context: Context,
    webView: WebView,
    allowedOrigins: Set<String>
) {
    private enum class ActiveSource {
        NONE,
        WEAR_OS,
        BLUETOOTH_HRS
    }

    private val appContext =
        context.applicationContext

    private val diagnostics =
        IBERFITAndroidTelemetryDiagnostics(
            appContext
        )

    private var executionId:
        String? = null

    private var active =
        false

    private var paused =
        false

    private var generation =
        0L

    private var activeSource =
        ActiveSource.NONE

    private var wearSessionQueued =
        false

    private var bleFallbackAttempted =
        false

    private var bleBackgroundPrepared =
        false

    private var wearSampleObserved =
        false

    private var bleSampleObserved =
        false

    private val runtimeHandler =
        Handler(
            Looper.getMainLooper()
        )

    private var wearWatchdog:
        Runnable? = null

    private lateinit var web:
        IBERFITAndroidWebRuntime

    /**
     * The phone foreground service owns IBERFITPreferredBleHeartRateRuntime(...)
     * during background-capable sessions. This client preserves the RC57.6F
     * runtime contract while moving BLE ownership out of the WebView lifecycle.
     */
    private val preferredBle =
        IBERFITBluetoothBackgroundBleSessionClient(
            context = appContext,
            onSample = {
                sample ->
                runtimeHandler.post {
                    handleBleSample(
                        sample
                    )
                }
            },
            onProviderError = {
                _ ->
                runtimeHandler.post {
                    handleBleProviderError()
                }
            },
            onUnavailable = {
                unavailableExecutionId ->
                runtimeHandler.post {
                    handleBleUnavailable(
                        unavailableExecutionId
                    )
                }
            }
        )

    private val dataLayer =
        IBERFITWearDataLayerRuntime(
            context,
            onSample = {
                sample ->
                runtimeHandler.post {
                    handleWearSample(
                        sample
                    )
                }
            },
            onCommand = {
                _,
                _ ->
            }
        )

    init {
        web =
            IBERFITAndroidWebRuntime(
                webView,
                allowedOrigins
            ) {
                action,
                payload ->
                runtimeHandler.post {
                    handleRuntimeCommand(
                        action = action,
                        payload = payload
                    )
                }
            }
    }

    private fun handleRuntimeCommand(
        action: String,
        payload: JSONObject
    ) {
        val commandExecutionId =
            payload.optString(
                "executionId"
            )
                .trim()

        if (action == "start") {
            if (
                commandExecutionId.isBlank()
            ) {
                return
            }

            start(
                commandExecutionId
            )

            return
        }

        val currentExecutionId =
            executionId
                ?: return

        if (
            commandExecutionId.isNotBlank() &&
            commandExecutionId !=
                currentExecutionId
        ) {
            return
        }

        when (action) {
            "pause" ->
                pause(
                    currentExecutionId
                )

            "resume" ->
                resume(
                    currentExecutionId
                )

            "stop" ->
                stop(
                    currentExecutionId
                )
        }
    }

    private fun start(
        newExecutionId: String
    ) {
        generation +=
            1L

        val startGeneration =
            generation

        diagnostics.clear()
        diagnostics.record(
            "RUNTIME_START"
        )

        cancelWearWatchdog()

        preferredBle.stop()
        preferredBle.release()

        executionId =
            newExecutionId

        active =
            true

        paused =
            false

        activeSource =
            ActiveSource.NONE

        wearSessionQueued =
            false

        bleFallbackAttempted =
            false

        wearSampleObserved =
            false

        bleSampleObserved =
            false

        /**
         * Prepare the FGS now, while START originates from visible session UI.
         * If no preferred BLE device exists or permission is unavailable, the
         * session simply continues with Wear without background BLE standby.
         */
        bleBackgroundPrepared =
            preferredBle.prepare(
                newExecutionId
            )

        diagnostics.record(
            if (bleBackgroundPrepared) {
                "BLE_FGS_PREPARED"
            } else {
                "BLE_FGS_NOT_PREPARED"
            }
        )

        dataLayer.startListening()

        dataLayer.sendCommand(
            "start",
            newExecutionId
        ) {
            sentToWatch ->
            runtimeHandler.post {
                if (
                    !active ||
                    generation != startGeneration ||
                    executionId != newExecutionId
                ) {
                    return@post
                }

                if (sentToWatch) {
                    diagnostics.record(
                        "WEAR_START_QUEUED"
                    )

                    wearSessionQueued =
                        true

                    activeSource =
                        ActiveSource.WEAR_OS

                    armWearWatchdog(
                        expectedExecutionId =
                            newExecutionId,
                        timeoutMs =
                            WEAR_INITIAL_SAMPLE_TIMEOUT_MS
                    )
                } else {
                    diagnostics.record(
                        "WEAR_START_NOT_QUEUED"
                    )

                    wearSessionQueued =
                        false

                    fallbackToPreferredBle(
                        expectedExecutionId =
                            newExecutionId
                    )
                }
            }
        }
    }

    private fun handleWearSample(
        sample: JSONObject
    ) {
        val currentExecutionId =
            executionId
                ?: return

        val sampleExecutionId =
            sample.optString(
                "executionId"
            )

        if (
            !active ||
            paused ||
            sampleExecutionId !=
                currentExecutionId
        ) {
            return
        }

        if (!wearSampleObserved) {
            wearSampleObserved =
                true

            diagnostics.record(
                "WEAR_SAMPLE_RECEIVED"
            )
        }

        wearSessionQueued =
            true

        bleFallbackAttempted =
            false

        if (
            activeSource ==
                ActiveSource.BLUETOOTH_HRS
        ) {
            diagnostics.record(
                "WEAR_RECOVERY_FROM_BLE"
            )

            preferredBle.stop()
        }

        activeSource =
            ActiveSource.WEAR_OS

        web.emitSample(
            sample
        )

        armWearWatchdog(
            expectedExecutionId =
                currentExecutionId,
            timeoutMs =
                WEAR_STALE_SAMPLE_TIMEOUT_MS
        )
    }

    private fun handleBleSample(
        sample: IBERFITHeartRateSample
    ) {
        val currentExecutionId =
            executionId
                ?: return

        if (
            !active ||
            paused ||
            activeSource !=
                ActiveSource.BLUETOOTH_HRS ||
            sample.executionId !=
                currentExecutionId
        ) {
            return
        }

        if (!bleSampleObserved) {
            bleSampleObserved =
                true

            diagnostics.record(
                "BLE_SAMPLE_RECEIVED"
            )
        }

        web.emitSample(
            sample.toWebSample()
        )
    }

    private fun handleBleProviderError() {
        val currentExecutionId =
            executionId
                ?: return

        handleBleUnavailable(
            currentExecutionId
        )
    }

    private fun handleBleUnavailable(
        unavailableExecutionId: String
    ) {
        val currentExecutionId =
            executionId
                ?: return

        if (
            !active ||
            unavailableExecutionId !=
                currentExecutionId ||
            activeSource !=
                ActiveSource.BLUETOOTH_HRS
        ) {
            return
        }

        diagnostics.record(
            "BLE_UNAVAILABLE"
        )

        preferredBle.stop()

        activeSource =
            if (wearSessionQueued) {
                ActiveSource.WEAR_OS
            } else {
                ActiveSource.NONE
            }

        cancelWearWatchdog()

        if (!wearSessionQueued) {
            preferredBle.release()

            bleBackgroundPrepared =
                false
        }
    }

    private fun fallbackToPreferredBle(
        expectedExecutionId: String
    ): Boolean {
        if (
            !active ||
            paused ||
            executionId !=
                expectedExecutionId ||
            bleFallbackAttempted ||
            !bleBackgroundPrepared
        ) {
            return false
        }

        bleFallbackAttempted =
            true

        bleSampleObserved =
            false

        diagnostics.record(
            "BLE_FAILOVER_REQUESTED"
        )

        cancelWearWatchdog()

        val bleStarted =
            preferredBle.start(
                expectedExecutionId
            )

        if (bleStarted) {
            diagnostics.record(
                "BLE_FAILOVER_STARTED"
            )

            activeSource =
                ActiveSource.BLUETOOTH_HRS
        } else if (!wearSessionQueued) {
            diagnostics.record(
                "BLE_FAILOVER_NOT_STARTED"
            )
            activeSource =
                ActiveSource.NONE

            preferredBle.release()

            bleBackgroundPrepared =
                false
        }

        return bleStarted
    }

    private fun armWearWatchdog(
        expectedExecutionId: String,
        timeoutMs: Long
    ) {
        cancelWearWatchdog()

        if (
            !active ||
            paused ||
            activeSource !=
                ActiveSource.WEAR_OS
        ) {
            return
        }

        val expectedGeneration =
            generation

        val watchdog =
            Runnable {
                if (
                    !active ||
                    paused ||
                    generation !=
                        expectedGeneration ||
                    executionId !=
                        expectedExecutionId ||
                    activeSource !=
                        ActiveSource.WEAR_OS
                ) {
                    return@Runnable
                }

                diagnostics.record(
                    "WEAR_WATCHDOG_FIRED"
                )

                fallbackToPreferredBle(
                    expectedExecutionId
                )
            }

        wearWatchdog =
            watchdog

        runtimeHandler.postDelayed(
            watchdog,
            timeoutMs
        )
    }

    private fun cancelWearWatchdog() {
        val watchdog =
            wearWatchdog

        wearWatchdog =
            null

        if (watchdog != null) {
            runtimeHandler.removeCallbacks(
                watchdog
            )
        }
    }

    private fun pause(
        currentExecutionId: String
    ) {
        diagnostics.record(
            "RUNTIME_PAUSE"
        )

        paused =
            true

        cancelWearWatchdog()

        if (wearSessionQueued) {
            dataLayer.sendCommand(
                "pause",
                currentExecutionId
            ) {
                _ ->
            }
        }

        if (
            activeSource ==
                ActiveSource.BLUETOOTH_HRS
        ) {
            preferredBle.pause()
        }
    }

    private fun resume(
        currentExecutionId: String
    ) {
        diagnostics.record(
            "RUNTIME_RESUME"
        )

        paused =
            false

        if (
            activeSource ==
                ActiveSource.BLUETOOTH_HRS
        ) {
            preferredBle.resume()
        }

        if (wearSessionQueued) {
            val resumeGeneration =
                generation

            dataLayer.sendCommand(
                "resume",
                currentExecutionId
            ) {
                queued ->
                runtimeHandler.post {
                    if (
                        !active ||
                        paused ||
                        generation !=
                            resumeGeneration ||
                        executionId !=
                            currentExecutionId
                    ) {
                        return@post
                    }

                    if (
                        queued &&
                        activeSource ==
                            ActiveSource.WEAR_OS
                    ) {
                        armWearWatchdog(
                            expectedExecutionId =
                                currentExecutionId,
                            timeoutMs =
                                WEAR_INITIAL_SAMPLE_TIMEOUT_MS
                        )
                    }
                }
            }
        }
    }

    private fun stop(
        currentExecutionId: String
    ) {
        diagnostics.record(
            "RUNTIME_STOP"
        )

        generation +=
            1L

        cancelWearWatchdog()

        if (wearSessionQueued) {
            dataLayer.sendCommand(
                "stop",
                currentExecutionId
            ) {
                _ ->
            }
        }

        preferredBle.stop()
        preferredBle.release()

        bleBackgroundPrepared =
            false

        activeSource =
            ActiveSource.NONE

        active =
            false

        paused =
            false

        wearSessionQueued =
            false

        bleFallbackAttempted =
            false

        executionId =
            null

        dataLayer.stopListening()
    }

    private fun IBERFITHeartRateSample.toWebSample():
        JSONObject =
        JSONObject()
            .put(
                "provider",
                "ble_direct"
            )
            .put(
                "providerId",
                providerId
            )
            .put(
                "heartRateBpm",
                bpm
            )
            .put(
                "rrIntervalsMs",
                JSONArray(
                    rrIntervalsMs
                )
            )
            .put(
                "quality",
                quality.toLegacyWebQuality()
            )
            .put(
                "canonicalQuality",
                quality.name.lowercase()
            )
            .put(
                "contactStatus",
                contactStatus.name.lowercase()
            )
            .put(
                "deviceType",
                deviceType.name.lowercase()
            )
            .put(
                "deviceId",
                deviceId
            )
            .put(
                "executionId",
                executionId
            )
            .put(
                "sessionId",
                sessionId
            )
            .put(
                "recordedAt",
                Instant.ofEpochMilli(
                    recordedAtEpochMs
                        ?: receivedAtEpochMs
                ).toString()
            )

    private fun IBERFITHeartRateQuality.toLegacyWebQuality():
        String =
        when (this) {
            IBERFITHeartRateQuality.VALID ->
                "alta"

            IBERFITHeartRateQuality.ACQUIRING ->
                "limitada"

            IBERFITHeartRateQuality.POOR_CONTACT ->
                "limitada"

            IBERFITHeartRateQuality.STALE ->
                "limitada"

            IBERFITHeartRateQuality.OUT_OF_RANGE ->
                "limitada"

            IBERFITHeartRateQuality.DISCONNECTED ->
                "limitada"

            IBERFITHeartRateQuality.UNSUPPORTED ->
                "limitada"
        }

    fun destroy() {
        diagnostics.record(
            "RUNTIME_DESTROY"
        )

        generation +=
            1L

        cancelWearWatchdog()

        active =
            false

        paused =
            false

        wearSessionQueued =
            false

        bleFallbackAttempted =
            false

        bleBackgroundPrepared =
            false

        executionId =
            null

        activeSource =
            ActiveSource.NONE

        preferredBle.destroy()
        dataLayer.stopListening()
    }

    companion object {
        const val WEAR_INITIAL_SAMPLE_TIMEOUT_MS =
            30_000L

        const val WEAR_STALE_SAMPLE_TIMEOUT_MS =
            20_000L
    }
}