package cl.iberfit.nativebridge.heartrate

object IBERFITHeartRateProviderSelector {
    fun select(
        snapshots: List<IBERFITHeartRateProviderSnapshot>,
        preferredProviderId: String? = null,
        excludedProviderIds: Set<String> = emptySet()
    ): IBERFITHeartRateProviderSnapshot? {
        return snapshots
            .asSequence()
            .filter { it.descriptor.providerId !in excludedProviderIds }
            .filter { it.available }
            .filter { it.capabilities.supportsLiveHeartRate }
            .filter { it.state.isSelectable() }
            .sortedWith(
                compareByDescending<IBERFITHeartRateProviderSnapshot> {
                    preferredProviderId != null &&
                        it.descriptor.providerId == preferredProviderId
                }
                    .thenByDescending { it.connected }
                    .thenByDescending { it.descriptor.priority }
                    .thenBy { it.descriptor.providerId }
            )
            .firstOrNull()
    }

    private fun IBERFITHeartRateProviderState.isSelectable(): Boolean =
        this != IBERFITHeartRateProviderState.UNSUPPORTED &&
            this != IBERFITHeartRateProviderState.ERROR &&
            this != IBERFITHeartRateProviderState.DISCONNECTED
}