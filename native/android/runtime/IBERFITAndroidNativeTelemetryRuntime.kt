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

    /**
     * A successful MessageClient enqueue means only that the command was
     * accepted for transport. It is not proof that Health Services is already
     * producing samples, so we keep the BLE preferred device as a standby.
     */
    private var wearSessionQueued =
        false

    /**
     * One BLE failover attempt is allowed per uninterrupted Wear sample epoch.
     * A fresh Wear sample resets this guard and permits a future failover.
     */
    private var bleFallbackAttempted =
        false

    private val runtimeHandler =
        Handler(
            Looper.getMainLooper()
        )

    private var wearWatchdog:
        Runnable? = null

    private lateinit var web:
        IBERFITAndroidWebRuntime

    private val preferredBle =
        IBERFITPreferredBleHeartRateRuntime(
            context = context,
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

        cancelWearWatchdog()

        preferredBle.stop()

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

        wearSessionQueued =
            true

        bleFallbackAttempted =
            false

        if (
            activeSource ==
                ActiveSource.BLUETOOTH_HRS
        ) {
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

        web.emitSample(
            sample.toWebSample()
        )
    }

    private fun handleBleProviderError() {
        if (
            !active ||
            activeSource !=
                ActiveSource.BLUETOOTH_HRS
        ) {
            return
        }

        preferredBle.stop()

        activeSource =
            if (wearSessionQueued) {
                ActiveSource.WEAR_OS
            } else {
                ActiveSource.NONE
            }

        /**
         * Do not immediately loop back into the same BLE failure. A fresh Wear
         * sample will reset bleFallbackAttempted and arm a new stale watchdog.
         */
        cancelWearWatchdog()
    }

    private fun fallbackToPreferredBle(
        expectedExecutionId: String
    ): Boolean {
        if (
            !active ||
            paused ||
            executionId !=
                expectedExecutionId ||
            bleFallbackAttempted
        ) {
            return false
        }

        bleFallbackAttempted =
            true

        cancelWearWatchdog()

        val bleStarted =
            preferredBle.start(
                expectedExecutionId
            )

        if (bleStarted) {
            activeSource =
                ActiveSource.BLUETOOTH_HRS
        } else if (!wearSessionQueued) {
            activeSource =
                ActiveSource.NONE
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
        generation +=
            1L

        cancelWearWatchdog()

        /**
         * When BLE is active because Wear stalled, the Wear workout may still
         * exist. Always send STOP when START had previously been queued.
         */
        if (wearSessionQueued) {
            dataLayer.sendCommand(
                "stop",
                currentExecutionId
            ) {
                _ ->
            }
        }

        preferredBle.stop()

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

        executionId =
            null

        activeSource =
            ActiveSource.NONE

        preferredBle.stop()
        dataLayer.stopListening()
    }

    companion object {
        /**
         * Conservative acquisition window before assuming that a queued Wear
         * START is not yielding usable live HR.
         */
        const val WEAR_INITIAL_SAMPLE_TIMEOUT_MS =
            30_000L

        /**
         * Once Wear has emitted HR, a shorter gap is sufficient to mark the
         * live stream stale and activate the user's preferred BLE standby.
         */
        const val WEAR_STALE_SAMPLE_TIMEOUT_MS =
            20_000L
    }
}