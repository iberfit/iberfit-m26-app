package cl.iberfit.nativebridge.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import java.security.MessageDigest

enum class IBERFITBleDiscoveryState {
    IDLE,
    SCANNING,
    FINISHED,
    BLUETOOTH_DISABLED,
    UNSUPPORTED,
    ERROR
}

data class IBERFITBleDiscoveredDevice internal constructor(
    val stableId: String,
    val displayName: String,
    val signalLabel: String,
    internal val bluetoothDevice: BluetoothDevice
)

interface IBERFITBleDeviceDiscoveryListener {
    fun onDiscoveryStateChanged(
        state: IBERFITBleDiscoveryState
    )

    fun onDeviceFound(
        device: IBERFITBleDiscoveredDevice
    )

    fun onDiscoveryError(
        code: String
    )
}

/**
 * User-initiated, time-bounded discovery for standard Bluetooth SIG HRS
 * peripherals. It exposes friendly device metadata and never exposes a MAC
 * address to presentation code.
 */
class IBERFITBleDeviceDiscoveryManager(
    context: Context,
    private val listener: IBERFITBleDeviceDiscoveryListener,
    private val scanTimeoutMs: Long = DEFAULT_SCAN_TIMEOUT_MS
) {
    private val appContext =
        context.applicationContext

    private val handler =
        Handler(Looper.getMainLooper())

    private val bluetoothManager =
        appContext.getSystemService(
            BluetoothManager::class.java
        )

    private val adapter:
        BluetoothAdapter?
        get() = bluetoothManager?.adapter

    private var activeScanner:
        BluetoothLeScanner? = null

    private val seenAddresses =
        linkedSetOf<String>()

    private val timeoutRunnable =
        Runnable {
            stopScan(
                notifyFinished = true
            )
        }

    private val scanCallback =
        object : ScanCallback() {
            override fun onScanResult(
                callbackType: Int,
                result: ScanResult
            ) {
                publish(result)
            }

            override fun onScanFailed(
                errorCode: Int
            ) {
                stopScan(
                    notifyFinished = false
                )

                listener.onDiscoveryStateChanged(
                    IBERFITBleDiscoveryState.ERROR
                )

                listener.onDiscoveryError(
                    code = "BLE_SCAN_FAILED_$errorCode"
                )
            }
        }

    @SuppressLint("MissingPermission")
    fun startScan() {
        stopScan(
            notifyFinished = false
        )

        val hasBle =
            appContext.packageManager
                .hasSystemFeature(
                    PackageManager.FEATURE_BLUETOOTH_LE
                )

        if (!hasBle) {
            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.UNSUPPORTED
            )
            return
        }

        val currentAdapter =
            adapter

        if (currentAdapter == null) {
            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.UNSUPPORTED
            )
            return
        }

        if (!currentAdapter.isEnabled) {
            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.BLUETOOTH_DISABLED
            )
            return
        }

        val scanner =
            currentAdapter.bluetoothLeScanner

        if (scanner == null) {
            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.UNSUPPORTED
            )
            return
        }

        seenAddresses.clear()
        activeScanner = scanner

        val filter =
            ScanFilter.Builder()
                .setServiceUuid(
                    ParcelUuid(
                        IBERFITBleHeartRateProtocol
                            .HEART_RATE_SERVICE_UUID
                    )
                )
                .build()

        val settings =
            ScanSettings.Builder()
                .setScanMode(
                    ScanSettings.SCAN_MODE_LOW_LATENCY
                )
                .build()

        listener.onDiscoveryStateChanged(
            IBERFITBleDiscoveryState.SCANNING
        )

        try {
            scanner.startScan(
                listOf(filter),
                settings,
                scanCallback
            )
        } catch (_: SecurityException) {
            activeScanner = null

            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.ERROR
            )

            listener.onDiscoveryError(
                code = "BLUETOOTH_PERMISSION_REQUIRED"
            )

            return
        } catch (_: IllegalStateException) {
            activeScanner = null

            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.ERROR
            )

            listener.onDiscoveryError(
                code = "BLUETOOTH_SCANNER_UNAVAILABLE"
            )

            return
        }

        handler.postDelayed(
            timeoutRunnable,
            scanTimeoutMs
        )
    }

    fun stopScan() {
        stopScan(
            notifyFinished = true
        )
    }

    @SuppressLint("MissingPermission")
    private fun stopScan(
        notifyFinished: Boolean
    ) {
        handler.removeCallbacks(
            timeoutRunnable
        )

        val scanner =
            activeScanner

        activeScanner = null

        if (scanner != null) {
            runCatching {
                scanner.stopScan(
                    scanCallback
                )
            }
        }

        if (notifyFinished) {
            listener.onDiscoveryStateChanged(
                IBERFITBleDiscoveryState.FINISHED
            )
        }
    }

    @SuppressLint("MissingPermission")
    private fun publish(
        result: ScanResult
    ) {
        val device =
            result.device

        val address =
            runCatching {
                device.address
            }.getOrNull()
                ?: return

        if (!seenAddresses.add(address)) {
            return
        }

        val advertisedName =
            result.scanRecord
                ?.deviceName
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        val bondedName =
            runCatching {
                device.name
            }.getOrNull()
                ?.trim()
                ?.takeIf {
                    it.isNotEmpty()
                }

        val displayName =
            advertisedName
                ?: bondedName
                ?: "Pulsómetro Bluetooth"

        listener.onDeviceFound(
            IBERFITBleDiscoveredDevice(
                stableId =
                    stableIdForAddress(
                        address
                    ),
                displayName =
                    displayName,
                signalLabel =
                    signalLabelForRssi(
                        result.rssi
                    ),
                bluetoothDevice =
                    device
            )
        )
    }

    private fun stableIdForAddress(
        address: String
    ): String {
        val digest =
            MessageDigest
                .getInstance("SHA-256")
                .digest(
                    address.toByteArray(
                        Charsets.UTF_8
                    )
                )

        return digest
            .joinToString(
                separator = ""
            ) { byte ->
                "%02x".format(
                    byte.toInt() and 0xFF
                )
            }
            .take(16)
    }

    private fun signalLabelForRssi(
        rssi: Int
    ): String =
        when {
            rssi >= -60 ->
                "Señal excelente"

            rssi >= -75 ->
                "Señal buena"

            else ->
                "Señal disponible"
        }

    companion object {
        const val DEFAULT_SCAN_TIMEOUT_MS =
            12_000L
    }
}