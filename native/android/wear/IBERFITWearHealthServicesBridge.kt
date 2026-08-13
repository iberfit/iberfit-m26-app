package cl.iberfit.nativebridge.wear

import android.content.Context
import android.util.Log
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
    private var startGeneration = 0L

    private val exerciseCallback = object : ExerciseUpdateCallback {
        override fun onRegistered() {
            callbackRegistered = true

            Log.i(
                TAG,
                "CALLBACK_REGISTERED"
            )

            emitSnapshot()
            if (pendingStart) reconcileThenBeginExercise()
        }

        override fun onRegistrationFailed(throwable: Throwable) {
            callbackRegistered = false
            pendingStart = false

            Log.e(
                TAG,
                "CALLBACK_REGISTRATION_FAILED rootCause=${rootCauseName(throwable)}",
                throwable
            )

            setState(IBERFITHeartRateProviderState.ERROR)
            emitError(
                code = "CALLBACK_REGISTRATION_FAILED",
                throwable = throwable,
                recoverable = true
            )
        }

        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val state = update.exerciseStateInfo.state

            Log.d(
                TAG,
                "EXERCISE_UPDATE state=$state"
            )

            if (state.isEnded) {
                exerciseStarted = false

                if (!pendingStart) {
                    sessionContext = null
                    setState(IBERFITHeartRateProviderState.IDLE)
                } else {
                    emitSnapshot()
                }
                return
            }

            val context = sessionContext ?: return
            val heartRatePoints =
                update.latestMetrics.getData(DataType.HEART_RATE_BPM)

            Log.d(
                TAG,
                "HEART_RATE_POINTS count=${heartRatePoints.size} executionId=${context.executionId}"
            )

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
            // IBERFIT heart-rate sessions do not depend on lap summaries.
        }

        override fun onAvailabilityChanged(
            dataType: androidx.health.services.client.data.DataType<*, *>,
            availability: Availability
        ) {
            if (dataType == DataType.HEART_RATE_BPM) {
                Log.i(
                    TAG,
                    "HEART_RATE_AVAILABILITY class=${availability.javaClass.simpleName} id=${availability.id} value=$availability"
                )

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

        val existingContext = sessionContext
        if (
            exerciseStarted &&
            existingContext?.executionId == context.executionId
        ) {
            emitSnapshot()
            return
        }

        if (
            exerciseStarted &&
            existingContext?.executionId != context.executionId
        ) {
            emitError(
                code = "SESSION_ALREADY_ACTIVE",
                message =
                    "A different IBERFIT heart-rate session is already active.",
                recoverable = true
            )
            return
        }

        sessionContext = context
        pendingStart = true
        startGeneration += 1L
        setState(IBERFITHeartRateProviderState.CONNECTING)

        if (callbackRegistered) {
            reconcileThenBeginExercise()
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
        startGeneration += 1L
        sessionContext = null

        val future = exerciseClient.endExerciseAsync()
        future.addListener({
            try {
                future.get()
                exerciseStarted = false
                setState(IBERFITHeartRateProviderState.IDLE)
            } catch (throwable: Throwable) {
                exerciseStarted = false
                setState(IBERFITHeartRateProviderState.IDLE)
            }
        }, mainExecutor)
    }

    fun close() {
        if (closed) return

        pendingStart = false
        startGeneration += 1L
        sessionContext = null

        exerciseClient.endExerciseAsync()
        exerciseStarted = false

        exerciseClient.clearUpdateCallbackAsync(exerciseCallback)
        closed = true
        providerState = IBERFITHeartRateProviderState.IDLE
        listener = null
    }

    private fun reconcileThenBeginExercise() {
        val context = sessionContext ?: return
        if (!pendingStart || !callbackRegistered || exerciseStarted) return

        val generation = startGeneration
        setState(IBERFITHeartRateProviderState.ACQUIRING)

        val currentInfoFuture =
            exerciseClient.getCurrentExerciseInfoAsync()

        currentInfoFuture.addListener({
            try {
                val info = currentInfoFuture.get()

                if (!isCurrentStart(generation, context)) {
                    return@addListener
                }

                if (info.exerciseType == ExerciseType.UNKNOWN) {
                    beginFreshExercise(generation, context)
                    return@addListener
                }

                val endFuture = exerciseClient.endExerciseAsync()
                endFuture.addListener({
                    try {
                        endFuture.get()

                        if (!isCurrentStart(generation, context)) {
                            return@addListener
                        }

                        beginFreshExercise(generation, context)
                    } catch (throwable: Throwable) {
                        pendingStart = false
                        setState(IBERFITHeartRateProviderState.ERROR)
                        emitError(
                            code =
                                "ACTIVE_EXERCISE_NOT_OWNED_OR_END_FAILED",
                            throwable = throwable,
                            recoverable = true
                        )
                    }
                }, mainExecutor)
            } catch (throwable: Throwable) {
                if (!isCurrentStart(generation, context)) {
                    return@addListener
                }

                pendingStart = false
                setState(IBERFITHeartRateProviderState.ERROR)
                emitError(
                    code = "CURRENT_EXERCISE_INFO_FAILED",
                    throwable = throwable,
                    recoverable = true
                )
            }
        }, mainExecutor)
    }

    private fun beginFreshExercise(
        generation: Long,
        context: IBERFITHeartRateSessionContext
    ) {
        if (!isCurrentStart(generation, context)) return

        val capabilitiesFuture =
            exerciseClient.getCapabilitiesAsync()

        capabilitiesFuture.addListener({
            try {
                val capabilities = capabilitiesFuture.get()

                if (!isCurrentStart(generation, context)) {
                    return@addListener
                }

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

                        if (!isCurrentStart(generation, context)) {
                            exerciseClient.endExerciseAsync()
                            return@addListener
                        }

                        pendingStart = false
                        exerciseStarted = true

                        Log.i(
                            TAG,
                            "EXERCISE_START_SUCCEEDED executionId=${context.executionId}"
                        )

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

    private fun isCurrentStart(
        generation: Long,
        context: IBERFITHeartRateSessionContext
    ): Boolean =
        !closed &&
            pendingStart &&
            generation == startGeneration &&
            sessionContext == context

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
        private const val TAG =
            "IBERFITHealthServices"

        const val PROVIDER_ID = "wear_os_health_services"
    }
}