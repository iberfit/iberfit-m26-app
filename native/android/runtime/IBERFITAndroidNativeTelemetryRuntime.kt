package cl.iberfit.nativebridge.runtime

import android.content.Context
import android.webkit.WebView
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateContactStatus
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateDeviceType
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

    private var generation =
        0L

    private var activeSource =
        ActiveSource.NONE

    private lateinit var web:
        IBERFITAndroidWebRuntime

    private val preferredBle =
        IBERFITPreferredBleHeartRateRuntime(
            context = context,
            onSample = {
                sample ->
                val currentExecutionId =
                    executionId

                if (
                    active &&
                    currentExecutionId != null &&
                    sample.executionId ==
                        currentExecutionId
                ) {
                    web.emitSample(
                        sample.toWebSample()
                    )
                }
            }
        )

    private val dataLayer =
        IBERFITWearDataLayerRuntime(
            context,
            onSample = {
                sample ->
                val currentExecutionId =
                    executionId
                        ?: return@IBERFITWearDataLayerRuntime

                val sampleExecutionId =
                    sample.optString(
                        "executionId"
                    )

                if (
                    !active ||
                    sampleExecutionId !=
                        currentExecutionId
                ) {
                    return@IBERFITWearDataLayerRuntime
                }

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
            ) runtimeCommand@{
                action,
                payload ->

                val commandExecutionId =
                    payload.optString(
                        "executionId"
                    )
                        .trim()

                if (action == "start") {
                    if (
                        commandExecutionId.isBlank()
                    ) {
                        return@runtimeCommand
                    }

                    start(
                        commandExecutionId
                    )

                    return@runtimeCommand
                }

                val currentExecutionId =
                    executionId
                        ?: return@runtimeCommand

                if (
                    commandExecutionId.isNotBlank() &&
                    commandExecutionId !=
                        currentExecutionId
                ) {
                    return@runtimeCommand
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
    }

    private fun start(
        newExecutionId: String
    ) {
        generation +=
            1L

        val startGeneration =
            generation

        preferredBle.stop()

        executionId =
            newExecutionId

        active =
            true

        activeSource =
            ActiveSource.NONE

        dataLayer.startListening()

        dataLayer.sendCommand(
            "start",
            newExecutionId
        ) {
            sentToWatch ->

            if (
                !active ||
                generation != startGeneration ||
                executionId != newExecutionId
            ) {
                return@sendCommand
            }

            if (sentToWatch) {
                preferredBle.stop()

                activeSource =
                    ActiveSource.WEAR_OS
            } else {
                val bleStarted =
                    preferredBle.start(
                        newExecutionId
                    )

                activeSource =
                    if (bleStarted) {
                        ActiveSource.BLUETOOTH_HRS
                    } else {
                        ActiveSource.NONE
                    }
            }
        }
    }

    private fun pause(
        currentExecutionId: String
    ) {
        when (activeSource) {
            ActiveSource.WEAR_OS ->
                dataLayer.sendCommand(
                    "pause",
                    currentExecutionId
                ) {
                    _ ->
                }

            ActiveSource.BLUETOOTH_HRS ->
                preferredBle.pause()

            ActiveSource.NONE ->
                Unit
        }
    }

    private fun resume(
        currentExecutionId: String
    ) {
        when (activeSource) {
            ActiveSource.WEAR_OS ->
                dataLayer.sendCommand(
                    "resume",
                    currentExecutionId
                ) {
                    _ ->
                }

            ActiveSource.BLUETOOTH_HRS ->
                preferredBle.resume()

            ActiveSource.NONE ->
                Unit
        }
    }

    private fun stop(
        currentExecutionId: String
    ) {
        generation +=
            1L

        when (activeSource) {
            ActiveSource.WEAR_OS ->
                dataLayer.sendCommand(
                    "stop",
                    currentExecutionId
                ) {
                    _ ->
                }

            ActiveSource.BLUETOOTH_HRS ->
                preferredBle.stop()

            ActiveSource.NONE ->
                Unit
        }

        preferredBle.stop()

        activeSource =
            ActiveSource.NONE

        active =
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

        active =
            false

        executionId =
            null

        activeSource =
            ActiveSource.NONE

        preferredBle.stop()
        dataLayer.stopListening()
    }
}