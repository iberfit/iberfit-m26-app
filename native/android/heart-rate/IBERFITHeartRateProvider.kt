package cl.iberfit.nativebridge.heartrate

interface IBERFITHeartRateProviderListener {
    fun onProviderStateChanged(snapshot: IBERFITHeartRateProviderSnapshot)
    fun onHeartRateSample(sample: IBERFITHeartRateSample)
    fun onProviderError(error: IBERFITHeartRateProviderError)
}

interface IBERFITHeartRateProvider {
    val descriptor: IBERFITHeartRateProviderDescriptor

    fun snapshot(): IBERFITHeartRateProviderSnapshot

    fun setListener(listener: IBERFITHeartRateProviderListener?)

    fun start(context: IBERFITHeartRateSessionContext)

    fun pause()

    fun resume()

    fun stop()
}

interface IBERFITHeartRateSessionListener {
    fun onPrimaryProviderChanged(change: IBERFITHeartRateProviderChange)
    fun onProviderStateChanged(snapshot: IBERFITHeartRateProviderSnapshot)
    fun onHeartRateSample(sample: IBERFITHeartRateSample)
    fun onProviderError(error: IBERFITHeartRateProviderError)
}