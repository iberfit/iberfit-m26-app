package cl.iberfit.nativebridge.heartrate

class IBERFITHeartRateSessionManager(
    providers: List<IBERFITHeartRateProvider>
) : IBERFITHeartRateProviderListener {
    private val providersById =
        providers.associateBy { it.descriptor.providerId }

    private var sessionContext: IBERFITHeartRateSessionContext? = null
    private var sessionListener: IBERFITHeartRateSessionListener? = null
    private var preferredProviderId: String? = null
    private var primaryProviderId: String? = null

    init {
        require(providersById.size == providers.size) {
            "Heart-rate providerId values must be unique"
        }

        providers.forEach { it.setListener(this) }
    }

    fun start(
        context: IBERFITHeartRateSessionContext,
        listener: IBERFITHeartRateSessionListener,
        preferredProviderId: String? = null
    ): Boolean {
        this.sessionContext = context
        this.sessionListener = listener
        this.preferredProviderId = preferredProviderId

        val selected = chooseProvider() ?: return false
        activateProvider(
            selected.descriptor.providerId,
            if (
                preferredProviderId != null &&
                selected.descriptor.providerId == preferredProviderId
            ) {
                IBERFITHeartRateProviderChangeReason.USER_PREFERENCE
            } else {
                IBERFITHeartRateProviderChangeReason.INITIAL_SELECTION
            }
        )
        return true
    }

    fun pause() {
        primaryProvider()?.pause()
    }

    fun resume() {
        primaryProvider()?.resume()
    }

    fun stop() {
        primaryProvider()?.stop()
        primaryProviderId = null
        sessionContext = null
        sessionListener = null
        preferredProviderId = null
    }

    fun currentPrimaryProviderId(): String? = primaryProviderId

    fun snapshots(): List<IBERFITHeartRateProviderSnapshot> =
        providersById.values.map { it.snapshot() }

    override fun onProviderStateChanged(
        snapshot: IBERFITHeartRateProviderSnapshot
    ) {
        sessionListener?.onProviderStateChanged(snapshot)

        if (snapshot.descriptor.providerId != primaryProviderId) return
        if (snapshot.isUsablePrimary()) return

        val reason =
            if (
                snapshot.state ==
                    IBERFITHeartRateProviderState.DISCONNECTED
            ) {
                IBERFITHeartRateProviderChangeReason.SOURCE_DISCONNECTED
            } else {
                IBERFITHeartRateProviderChangeReason.SOURCE_UNAVAILABLE
            }

        failOverFrom(snapshot.descriptor.providerId, reason)
    }

    override fun onHeartRateSample(sample: IBERFITHeartRateSample) {
        val context = sessionContext ?: return
        if (sample.providerId != primaryProviderId) return

        val canonical = sample.copy(
            quality = if (sample.isPhysiologicallyPlausible) {
                sample.quality
            } else {
                IBERFITHeartRateQuality.OUT_OF_RANGE
            },
            executionId = sample.executionId ?: context.executionId,
            sessionId = sample.sessionId ?: context.sessionId
        )

        sessionListener?.onHeartRateSample(canonical)
    }

    override fun onProviderError(error: IBERFITHeartRateProviderError) {
        sessionListener?.onProviderError(error)

        if (error.providerId == primaryProviderId && error.recoverable) {
            failOverFrom(
                error.providerId,
                IBERFITHeartRateProviderChangeReason.SOURCE_UNAVAILABLE
            )
        }
    }

    private fun chooseProvider(
        excludedProviderIds: Set<String> = emptySet()
    ): IBERFITHeartRateProviderSnapshot? =
        IBERFITHeartRateProviderSelector.select(
            snapshots = snapshots(),
            preferredProviderId = preferredProviderId,
            excludedProviderIds = excludedProviderIds
        )

    private fun activateProvider(
        providerId: String,
        reason: IBERFITHeartRateProviderChangeReason
    ) {
        val context = sessionContext ?: return
        val next = providersById[providerId] ?: return
        val previous = primaryProviderId

        if (previous == providerId) return

        previous?.let { providersById[it] }?.stop()
        primaryProviderId = providerId

        sessionListener?.onPrimaryProviderChanged(
            IBERFITHeartRateProviderChange(
                previousProviderId = previous,
                nextProviderId = providerId,
                reason = reason
            )
        )

        next.start(context)
    }

    private fun failOverFrom(
        providerId: String,
        reason: IBERFITHeartRateProviderChangeReason
    ) {
        val next = chooseProvider(
            excludedProviderIds = setOf(providerId)
        )

        if (next == null) {
            val previous = primaryProviderId
            previous?.let { providersById[it] }?.stop()
            primaryProviderId = null

            sessionListener?.onPrimaryProviderChanged(
                IBERFITHeartRateProviderChange(
                    previousProviderId = previous,
                    nextProviderId = null,
                    reason = reason
                )
            )
            return
        }

        activateProvider(next.descriptor.providerId, reason)
    }

    private fun primaryProvider(): IBERFITHeartRateProvider? =
        primaryProviderId?.let { providersById[it] }

    private fun IBERFITHeartRateProviderSnapshot.isUsablePrimary(): Boolean =
        available &&
            capabilities.supportsLiveHeartRate &&
            state != IBERFITHeartRateProviderState.UNSUPPORTED &&
            state != IBERFITHeartRateProviderState.ERROR &&
            state != IBERFITHeartRateProviderState.DISCONNECTED
}