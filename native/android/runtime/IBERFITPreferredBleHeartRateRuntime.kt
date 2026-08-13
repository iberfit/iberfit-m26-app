package cl.iberfit.nativebridge.runtime

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.Context
import cl.iberfit.nativebridge.ble.IBERFITAndroidBleHeartRateTransport
import cl.iberfit.nativebridge.ble.IBERFITBleHeartRateProvider
import cl.iberfit.nativebridge.ble.IBERFITBlePreferredDeviceStore
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderChange
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderError
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateProviderSnapshot
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSample
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionContext
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionListener
import cl.iberfit.nativebridge.heartrate.IBERFITHeartRateSessionManager

/**
 * Runtime connector for the explicitly preferred Bluetooth HRS device.
 *
 * Important: this class never scans. Device discovery is a separate,
 * user-initiated UX. Runtime sessions reconnect only to the device the user
 * has already tested and saved as preferred.
 */
class IBERFITPreferredBleHeartRateRuntime(
    context: Context,
    private val onSample: (IBERFITHeartRateSample) -> Unit,
    private val onProviderError: (IBERFITHeartRateProviderError) -> Unit =
        {}
) : IBERFITHeartRateSessionListener {
    private val appContext =
        context.applicationContext

    private val preferredStore =
        IBERFITBlePreferredDeviceStore(
            appContext
        )

    private val bluetoothManager =
        appContext.getSystemService(
            BluetoothManager::class.java
        )

    private var sessionManager:
        IBERFITHeartRateSessionManager? = null

    private var activeExecutionId:
        String? = null

    fun hasPreferredDevice(): Boolean =
        preferredStore.load() != null

    @SuppressLint("MissingPermission")
    fun start(
        executionId: String
    ): Boolean {
        if (executionId.isBlank()) {
            return false
        }

        if (
            activeExecutionId == executionId &&
            sessionManager
                ?.currentPrimaryProviderId() != null
        ) {
            return true
        }

        stop()

        val preferred =
            preferredStore.load()
                ?: return false

        val adapter =
            bluetoothManager
                ?.adapter
                ?: return false

        val bluetoothEnabled =
            try {
                adapter.isEnabled
            } catch (_: SecurityException) {
                false
            }

        if (!bluetoothEnabled) {
            return false
        }

        val device =
            try {
                adapter.getRemoteDevice(
                    preferred.address
                )
            } catch (_: SecurityException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            }
                ?: return false

        val transport =
            IBERFITAndroidBleHeartRateTransport(
                context = appContext,
                device = device,
                deviceId = preferred.stableId
            )

        val provider =
            IBERFITBleHeartRateProvider(
                transport = transport
            )

        val manager =
            IBERFITHeartRateSessionManager(
                providers =
                    listOf(provider)
            )

        val context =
            IBERFITHeartRateSessionContext(
                sessionId =
                    "android-ble-$executionId",
                executionId =
                    executionId,
                startedAtEpochMs =
                    System.currentTimeMillis()
            )

        sessionManager =
            manager

        activeExecutionId =
            executionId

        val started =
            manager.start(
                context = context,
                listener = this,
                preferredProviderId =
                    IBERFITBleHeartRateProvider.PROVIDER_ID
            )

        if (!started) {
            stop()
        }

        return started
    }

    fun pause() {
        sessionManager
            ?.pause()
    }

    fun resume() {
        sessionManager
            ?.resume()
    }

    fun stop() {
        sessionManager
            ?.stop()

        sessionManager =
            null

        activeExecutionId =
            null
    }

    override fun onPrimaryProviderChanged(
        change: IBERFITHeartRateProviderChange
    ) {
        Unit
    }

    override fun onProviderStateChanged(
        snapshot: IBERFITHeartRateProviderSnapshot
    ) {
        Unit
    }

    override fun onHeartRateSample(
        sample: IBERFITHeartRateSample
    ) {
        val expectedExecutionId =
            activeExecutionId
                ?: return

        if (
            sample.executionId !=
                expectedExecutionId
        ) {
            return
        }

        onSample(
            sample
        )
    }

    override fun onProviderError(
        error: IBERFITHeartRateProviderError
    ) {
        onProviderError.invoke(
            error
        )
    }
}