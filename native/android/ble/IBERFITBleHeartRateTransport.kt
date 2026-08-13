package cl.iberfit.nativebridge.ble

enum class IBERFITBleHeartRateTransportState {
    IDLE,
    CONNECTING,
    DISCOVERING,
    SUBSCRIBING,
    READY,
    DISCONNECTED
}

interface IBERFITBleHeartRateTransportListener {
    fun onTransportStateChanged(
        state: IBERFITBleHeartRateTransportState
    )

    fun onHeartRateMeasurement(
        value: ByteArray,
        receivedAtEpochMs: Long
    )

    fun onTransportError(
        code: String,
        message: String?,
        recoverable: Boolean
    )
}

interface IBERFITBleHeartRateTransport {
    /**
     * Stable logical identifier supplied by the caller/device registry.
     * The transport deliberately does not expose a Bluetooth MAC address.
     */
    val deviceId: String?

    fun setListener(
        listener: IBERFITBleHeartRateTransportListener?
    )

    fun connect()

    fun disconnect()
}