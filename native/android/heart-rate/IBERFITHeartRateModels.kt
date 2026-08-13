package cl.iberfit.nativebridge.heartrate

enum class IBERFITHeartRateDeviceType {
    WATCH,
    CHEST_STRAP,
    ARM_BAND,
    SENSOR,
    PHONE,
    UNKNOWN
}

enum class IBERFITHeartRateQuality {
    VALID,
    ACQUIRING,
    POOR_CONTACT,
    STALE,
    OUT_OF_RANGE,
    DISCONNECTED,
    UNSUPPORTED
}

enum class IBERFITHeartRateContactStatus {
    DETECTED,
    NOT_DETECTED,
    UNSUPPORTED,
    UNKNOWN
}

enum class IBERFITHeartRateProviderState {
    IDLE,
    SEARCHING,
    CONNECTING,
    ACQUIRING,
    ACTIVE,
    PAUSED,
    DISCONNECTED,
    UNSUPPORTED,
    ERROR
}

data class IBERFITHeartRateProviderDescriptor(
    val providerId: String,
    val displayName: String,
    val transportFamily: String,
    val priority: Int = 0
)

data class IBERFITHeartRateProviderCapabilities(
    val supportsLiveHeartRate: Boolean,
    val supportsContactStatus: Boolean = false,
    val supportsRrIntervals: Boolean = false,
    val supportsPauseResume: Boolean = false,
    val supportsBackgroundStreaming: Boolean = false
)

data class IBERFITHeartRateProviderSnapshot(
    val descriptor: IBERFITHeartRateProviderDescriptor,
    val capabilities: IBERFITHeartRateProviderCapabilities,
    val state: IBERFITHeartRateProviderState,
    val available: Boolean,
    val connected: Boolean,
    val lastUpdatedAtEpochMs: Long? = null
)

data class IBERFITHeartRateSessionContext(
    val sessionId: String,
    val executionId: String,
    val startedAtEpochMs: Long
)

data class IBERFITHeartRateSample(
    val bpm: Double,
    val recordedAtEpochMs: Long?,
    val receivedAtEpochMs: Long,
    val providerId: String,
    val deviceId: String?,
    val deviceType: IBERFITHeartRateDeviceType,
    val quality: IBERFITHeartRateQuality,
    val contactStatus: IBERFITHeartRateContactStatus,
    val rrIntervalsMs: List<Double> = emptyList(),
    val executionId: String? = null,
    val sessionId: String? = null
) {
    val latencyMs: Long?
        get() = recordedAtEpochMs?.let {
            (receivedAtEpochMs - it).coerceAtLeast(0L)
        }

    val isPhysiologicallyPlausible: Boolean
        get() = bpm in MIN_PLAUSIBLE_BPM..MAX_PLAUSIBLE_BPM

    companion object {
        const val MIN_PLAUSIBLE_BPM = 25.0
        const val MAX_PLAUSIBLE_BPM = 240.0
    }
}

data class IBERFITHeartRateProviderError(
    val providerId: String,
    val code: String,
    val message: String?,
    val recoverable: Boolean
)

enum class IBERFITHeartRateProviderChangeReason {
    INITIAL_SELECTION,
    USER_PREFERENCE,
    SOURCE_UNAVAILABLE,
    SOURCE_DISCONNECTED
}

data class IBERFITHeartRateProviderChange(
    val previousProviderId: String?,
    val nextProviderId: String?,
    val reason: IBERFITHeartRateProviderChangeReason
)