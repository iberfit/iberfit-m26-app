package cl.iberfit.nativebridge.ble

import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateContactStatus
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateDeviceType
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProvider
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderCapabilities
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderDescriptor
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderError
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderListener
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderSnapshot
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderState
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateQuality
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionContext

/**
 * Device-agnostic Bluetooth SIG Heart Rate Service provider.
 *
 * Pause/resume is a local emission gate. The BLE connection remains established
 * because HRS itself does not define workout pause/resume semantics.
 */
class IBERFITBleHeartRateProvider(
    private val transport: IBERFITBleHeartRateTransport,
    private val deviceType: IBERFITHeartRateDeviceType =
        IBERFITHeartRateDeviceType.SENSOR
) :
    IBERFITHeartRateProvider,
    IBERFITBleHeartRateTransportListener {

    override val descriptor =
        IBERFITHeartRateProviderDescriptor(
            providerId = PROVIDER_ID,
            displayName = "Bluetooth Heart Rate",
            transportFamily = "ble",
            priority = 90
        )

    private val capabilities =
        IBERFITHeartRateProviderCapabilities(
            supportsLiveHeartRate = true,
            supportsContactStatus = true,
            supportsRrIntervals = true,
            supportsPauseResume = true,
            supportsBackgroundStreaming = false
        )

    private var listener:
        IBERFITHeartRateProviderListener? = null

    private var providerState =
        IBERFITHeartRateProviderState.IDLE

    private var transportState =
        IBERFITBleHeartRateTransportState.IDLE

    private var sessionContext:
        IBERFITHeartRateSessionContext? = null

    private var emissionPaused = false

    init {
        transport.setListener(this)
    }

    override fun snapshot(): IBERFITHeartRateProviderSnapshot =
        IBERFITHeartRateProviderSnapshot(
            descriptor = descriptor,
            capabilities = capabilities,
            state = providerState,
            available =
                providerState !=
                    IBERFITHeartRateProviderState.UNSUPPORTED &&
                    providerState !=
                    IBERFITHeartRateProviderState.ERROR,
            connected =
                transportState ==
                    IBERFITBleHeartRateTransportState.READY,
            lastUpdatedAtEpochMs =
                System.currentTimeMillis()
        )

    override fun setListener(
        listener: IBERFITHeartRateProviderListener?
    ) {
        this.listener = listener
        emitSnapshot()
    }

    override fun start(
        context: IBERFITHeartRateSessionContext
    ) {
        val existing = sessionContext

        if (
            existing != null &&
            existing.executionId == context.executionId
        ) {
            emitSnapshot()
            return
        }

        if (existing != null) {
            emitError(
                code = "SESSION_ALREADY_ACTIVE",
                message =
                    "A different Bluetooth HRS session is active.",
                recoverable = true
            )
            return
        }

        sessionContext = context
        emissionPaused = false
        providerState =
            IBERFITHeartRateProviderState.CONNECTING
        emitSnapshot()

        transport.connect()
    }

    override fun pause() {
        if (sessionContext == null) {
            emitError(
                code = "PAUSE_WITHOUT_ACTIVE_SESSION",
                message = null,
                recoverable = true
            )
            return
        }

        emissionPaused = true
        providerState =
            IBERFITHeartRateProviderState.PAUSED
        emitSnapshot()
    }

    override fun resume() {
        if (sessionContext == null) {
            emitError(
                code = "RESUME_WITHOUT_ACTIVE_SESSION",
                message = null,
                recoverable = true
            )
            return
        }

        emissionPaused = false
        providerState =
            stateForTransport(
                transportState = transportState
            )
        emitSnapshot()
    }

    override fun stop() {
        emissionPaused = false
        sessionContext = null
        transport.disconnect()
        transportState =
            IBERFITBleHeartRateTransportState.IDLE
        providerState =
            IBERFITHeartRateProviderState.IDLE
        emitSnapshot()
    }

    override fun onTransportStateChanged(
        state: IBERFITBleHeartRateTransportState
    ) {
        transportState = state

        if (sessionContext == null) {
            if (
                state ==
                    IBERFITBleHeartRateTransportState.DISCONNECTED ||
                state ==
                    IBERFITBleHeartRateTransportState.IDLE
            ) {
                providerState =
                    IBERFITHeartRateProviderState.IDLE
                emitSnapshot()
            }
            return
        }

        providerState =
            if (
                emissionPaused &&
                state ==
                    IBERFITBleHeartRateTransportState.READY
            ) {
                IBERFITHeartRateProviderState.PAUSED
            } else {
                stateForTransport(state)
            }

        emitSnapshot()
    }

    override fun onHeartRateMeasurement(
        value: ByteArray,
        receivedAtEpochMs: Long
    ) {
        val context =
            sessionContext ?: return

        if (emissionPaused) return

        val parsed =
            IBERFITBleHeartRateParser.parse(value)

        if (parsed == null) {
            emitError(
                code =
                    "MALFORMED_HEART_RATE_MEASUREMENT",
                message = null,
                recoverable = true
            )
            return
        }

        val bpm =
            parsed.heartRateBpm.toDouble()

        val contactStatus =
            when (parsed.sensorContactDetected) {
                true ->
                    IBERFITHeartRateContactStatus.DETECTED

                false ->
                    IBERFITHeartRateContactStatus.NOT_DETECTED

                null ->
                    IBERFITHeartRateContactStatus.UNSUPPORTED
            }

        val quality =
            when {
                bpm !in
                    IBERFITHeartRateSample.MIN_PLAUSIBLE_BPM..
                        IBERFITHeartRateSample.MAX_PLAUSIBLE_BPM ->
                    IBERFITHeartRateQuality.OUT_OF_RANGE

                parsed.sensorContactDetected == false ->
                    IBERFITHeartRateQuality.POOR_CONTACT

                else ->
                    IBERFITHeartRateQuality.VALID
            }

        listener?.onHeartRateSample(
            IBERFITHeartRateSample(
                bpm = bpm,
                recordedAtEpochMs = null,
                receivedAtEpochMs = receivedAtEpochMs,
                providerId = descriptor.providerId,
                deviceId = transport.deviceId,
                deviceType = deviceType,
                quality = quality,
                contactStatus = contactStatus,
                rrIntervalsMs = parsed.rrIntervalsMs,
                executionId = context.executionId,
                sessionId = context.sessionId
            )
        )
    }

    override fun onTransportError(
        code: String,
        message: String?,
        recoverable: Boolean
    ) {
        providerState =
            IBERFITHeartRateProviderState.ERROR
        emitSnapshot()

        emitError(
            code = code,
            message = message,
            recoverable = recoverable
        )
    }

    private fun stateForTransport(
        transportState: IBERFITBleHeartRateTransportState
    ): IBERFITHeartRateProviderState =
        when (transportState) {
            IBERFITBleHeartRateTransportState.IDLE ->
                IBERFITHeartRateProviderState.IDLE

            IBERFITBleHeartRateTransportState.CONNECTING,
            IBERFITBleHeartRateTransportState.DISCOVERING ->
                IBERFITHeartRateProviderState.CONNECTING

            IBERFITBleHeartRateTransportState.SUBSCRIBING ->
                IBERFITHeartRateProviderState.ACQUIRING

            IBERFITBleHeartRateTransportState.READY ->
                IBERFITHeartRateProviderState.ACTIVE

            IBERFITBleHeartRateTransportState.DISCONNECTED ->
                IBERFITHeartRateProviderState.DISCONNECTED
        }

    private fun emitSnapshot() {
        listener?.onProviderStateChanged(
            snapshot()
        )
    }

    private fun emitError(
        code: String,
        message: String?,
        recoverable: Boolean
    ) {
        listener?.onProviderError(
            IBERFITHeartRateProviderError(
                providerId = descriptor.providerId,
                code = code,
                message = message,
                recoverable = recoverable
            )
        )
    }

    companion object {
        const val PROVIDER_ID =
            "bluetooth_hrs"
    }
}