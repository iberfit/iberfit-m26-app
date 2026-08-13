package cl.iberfit.nativebridge.wear

import android.content.Context
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
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

class IBERFITWearHealthServicesBridge(
    context: Context
) : IBERFITHeartRateProvider {
    private val appContext = context.applicationContext
    private val mainExecutor = appContext.mainExecutor

    val exerciseClient =
        HealthServices.getClient(appContext).exerciseClient

    val requestedDataTypes = setOf(DataType.HEART_RATE_BPM)

    override val descriptor = IBERFITHeartRateProviderDescriptor(
        providerId = PROVIDER_ID,
        displayName = "Wear OS Health Services",
        transportFamily = "wear_os",
        priority = 100
    )

    private val providerCapabilities =
        IBERFITHeartRateProviderCapabilities(
            supportsLiveHeartRate = true,
            supportsContactStatus = false,
            supportsRrIntervals = false,
            supportsPauseResume = true,
            supportsBackgroundStreaming = false
        )

    private var listener: IBERFITHeartRateProviderListener? = null
    private var providerState = IBERFITHeartRateProviderState.IDLE
    private var sessionContext: IBERFITHeartRateSessionContext? = null
    private var callbackRegistered = false
    private var pendingStart = false
    private var exerciseStarted = false
    private var closed = false

    private val exerciseCallback = object : ExerciseUpdateCallback {
        override fun onRegistered() {
            callbackRegistered = true
            emitSnapshot()
            if (pendingStart) beginExerciseIfReady()
        }

        override fun onRegistrationFailed(throwable: Throwable) {
            callbackRegistered = false
            pendingStart = false
            setState(IBERFITHeartRateProviderState.ERROR)
            emitError(
                code = "CALLBACK_REGISTRATION_FAILED",
                throwable = throwable,
                recoverable = true
            )
        }

        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val state = update.exerciseStateInfo.state

            if (state.isEnded) {
                exerciseStarted = false
                pendingStart = false
                sessionContext = null
                setState(IBERFITHeartRateProviderState.IDLE)
                return
            }

            val context = sessionContext ?: return
            val heartRatePoints =
                update.latestMetrics.getData(DataType.HEART_RATE_BPM)

            heartRatePoints.forEach { point ->
                val bpm = point.value
                val quality =
                    if (
                        bpm in
                            IBERFITHeartRateSample.MIN_PLAUSIBLE_BPM..
                                IBERFITHeartRateSample.MAX_PLAUSIBLE_BPM
                    ) {
                        IBERFITHeartRateQuality.VALID
                    } else {
                        IBERFITHeartRateQuality.OUT_OF_RANGE
                    }

                listener?.onHeartRateSample(
                    IBERFITHeartRateSample(
                        bpm = bpm,
                        recordedAtEpochMs = null,
                        receivedAtEpochMs = System.currentTimeMillis(),
                        providerId = descriptor.providerId,
                        deviceId = null,
                        deviceType = IBERFITHeartRateDeviceType.WATCH,
                        quality = quality,
                        contactStatus =
                            IBERFITHeartRateContactStatus.UNKNOWN,
                        executionId = context.executionId,
                        sessionId = context.sessionId
                    )
                )
            }
        }

        override fun onLapSummaryReceived(
            lapSummary: ExerciseLapSummary
        ) {
            // IBERFIT heart-rate sessions do not use lap summaries.
        }

        override fun onAvailabilityChanged(
            dataType: androidx.health.services.client.data.DataType<*, *>,
            availability: Availability
        ) {
            if (dataType == DataType.HEART_RATE_BPM) {
                emitSnapshot()
            }
        }
    }

    init {
        exerciseClient.setUpdateCallback(exerciseCallback)
    }

    override fun snapshot(): IBERFITHeartRateProviderSnapshot =
        IBERFITHeartRateProviderSnapshot(
            descriptor = descriptor,
            capabilities = providerCapabilities,
            state = providerState,
            available =
                !closed &&
                    providerState !=
                        IBERFITHeartRateProviderState.UNSUPPORTED &&
                    providerState != IBERFITHeartRateProviderState.ERROR,
            connected = exerciseStarted,
            lastUpdatedAtEpochMs = System.currentTimeMillis()
        )

    override fun setListener(
        listener: IBERFITHeartRateProviderListener?
    ) {
        this.listener = listener
        listener?.onProviderStateChanged(snapshot())
    }

    override fun start(context: IBERFITHeartRateSessionContext) {
        if (closed) {
            emitError(
                code = "PROVIDER_CLOSED",
                message = "Wear Health Services provider is closed.",
                recoverable = false
            )
            return
        }

        sessionContext = context
        pendingStart = true
        setState(IBERFITHeartRateProviderState.CONNECTING)

        if (callbackRegistered) {
            beginExerciseIfReady()
        }
    }

    override fun pause() {
        if (!exerciseStarted) {
            emitError(
                code = "PAUSE_WITHOUT_ACTIVE_EXERCISE",
                message = "No active Health Services exercise.",
                recoverable = true
            )
            return
        }

        val future = exerciseClient.pauseExerciseAsync()
        future.addListener({
            try {
                future.get()
                setState(IBERFITHeartRateProviderState.PAUSED)
            } catch (throwable: Throwable) {
                emitError(
                    code = "PAUSE_FAILED",
                    throwable = throwable,
                    recoverable = true
                )
            }
        }, mainExecutor)
    }

    override fun resume() {
        if (!exerciseStarted) {
            emitError(
                code = "RESUME_WITHOUT_ACTIVE_EXERCISE",
                message = "No active Health Services exercise.",
                recoverable = true
            )
            return
        }

        val future = exerciseClient.resumeExerciseAsync()
        future.addListener({
            try {
                future.get()
                setState(IBERFITHeartRateProviderState.ACTIVE)
            } catch (throwable: Throwable) {
                emitError(
                    code = "RESUME_FAILED",
                    throwable = throwable,
                    recoverable = true
                )
            }
        }, mainExecutor)
    }

    override fun stop() {
        pendingStart = false
        sessionContext = null

        if (!exerciseStarted) {
            setState(IBERFITHeartRateProviderState.IDLE)
            return
        }

        val future = exerciseClient.endExerciseAsync()
        future.addListener({
            try {
                future.get()
                exerciseStarted = false
                setState(IBERFITHeartRateProviderState.IDLE)
            } catch (throwable: Throwable) {
                emitError(
                    code = "STOP_FAILED",
                    throwable = throwable,
                    recoverable = true
                )
            }
        }, mainExecutor)
    }

    fun close() {
        if (closed) return

        pendingStart = false
        sessionContext = null

        if (exerciseStarted) {
            exerciseClient.endExerciseAsync()
            exerciseStarted = false
        }

        exerciseClient.clearUpdateCallbackAsync(exerciseCallback)
        closed = true
        providerState = IBERFITHeartRateProviderState.IDLE
        listener = null
    }

    private fun beginExerciseIfReady() {
        val context = sessionContext ?: return
        if (!pendingStart || !callbackRegistered || exerciseStarted) return

        setState(IBERFITHeartRateProviderState.ACQUIRING)

        val capabilitiesFuture =
            exerciseClient.getCapabilitiesAsync()

        capabilitiesFuture.addListener({
            try {
                val capabilities = capabilitiesFuture.get()

                if (
                    ExerciseType.WORKOUT !in
                        capabilities.supportedExerciseTypes
                ) {
                    pendingStart = false
                    setState(
                        IBERFITHeartRateProviderState.UNSUPPORTED
                    )
                    emitError(
                        code = "WORKOUT_UNSUPPORTED",
                        message =
                            "Health Services does not support WORKOUT.",
                        recoverable = false
                    )
                    return@addListener
                }

                val workoutCapabilities =
                    capabilities.getExerciseTypeCapabilities(
                        ExerciseType.WORKOUT
                    )

                if (
                    DataType.HEART_RATE_BPM !in
                        workoutCapabilities.supportedDataTypes
                ) {
                    pendingStart = false
                    setState(
                        IBERFITHeartRateProviderState.UNSUPPORTED
                    )
                    emitError(
                        code = "HEART_RATE_UNSUPPORTED",
                        message =
                            "Health Services does not support HEART_RATE_BPM.",
                        recoverable = false
                    )
                    return@addListener
                }

                if (!pendingStart || sessionContext != context) {
                    return@addListener
                }

                val config = ExerciseConfig(
                    exerciseType = ExerciseType.WORKOUT,
                    dataTypes = requestedDataTypes,
                    isAutoPauseAndResumeEnabled = false,
                    isGpsEnabled = false
                )

                val startFuture =
                    exerciseClient.startExerciseAsync(config)

                startFuture.addListener({
                    try {
                        startFuture.get()

                        if (!pendingStart || sessionContext != context) {
                            exerciseClient.endExerciseAsync()
                            return@addListener
                        }

                        pendingStart = false
                        exerciseStarted = true
                        setState(
                            IBERFITHeartRateProviderState.ACTIVE
                        )
                    } catch (throwable: Throwable) {
                        pendingStart = false
                        exerciseStarted = false
                        setState(
                            IBERFITHeartRateProviderState.ERROR
                        )
                        emitError(
                            code = "START_FAILED",
                            throwable = throwable,
                            recoverable = true
                        )
                    }
                }, mainExecutor)
            } catch (throwable: Throwable) {
                pendingStart = false
                setState(IBERFITHeartRateProviderState.ERROR)
                emitError(
                    code = "CAPABILITIES_FAILED",
                    throwable = throwable,
                    recoverable = true
                )
            }
        }, mainExecutor)
    }

    private fun setState(state: IBERFITHeartRateProviderState) {
        providerState = state
        emitSnapshot()
    }

    private fun emitSnapshot() {
        listener?.onProviderStateChanged(snapshot())
    }

    private fun emitError(
        code: String,
        message: String? = null,
        throwable: Throwable? = null,
        recoverable: Boolean
    ) {
        listener?.onProviderError(
            IBERFITHeartRateProviderError(
                providerId = descriptor.providerId,
                code = code,
                message =
                    message ?:
                        throwable?.let { rootCauseName(it) },
                recoverable = recoverable
            )
        )
    }

    private fun rootCauseName(throwable: Throwable): String {
        var current = throwable
        while (current.cause != null && current.cause !== current) {
            current = current.cause!!
        }
        return current.javaClass.simpleName
    }

    companion object {
        const val PROVIDER_ID = "wear_os_health_services"
    }
}