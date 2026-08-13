package cl.iberfit.nativebridge.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Build

/**
 * Device-bound Android BLE GATT transport for the Bluetooth SIG Heart Rate
 * Service. Discovery/pairing UX is intentionally outside this class.
 */
@SuppressLint("MissingPermission")
class IBERFITAndroidBleHeartRateTransport(
    context: Context,
    private val device: BluetoothDevice,
    override val deviceId: String?
) : IBERFITBleHeartRateTransport {
    private val appContext =
        context.applicationContext

    @Volatile
    private var listener:
        IBERFITBleHeartRateTransportListener? = null

    @Volatile
    private var activeGatt: BluetoothGatt? = null

    private val callback =
        object : BluetoothGattCallback() {
            override fun onConnectionStateChange(
                gatt: BluetoothGatt,
                status: Int,
                newState: Int
            ) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    fail(
                        gatt = gatt,
                        code = "GATT_CONNECTION_FAILED",
                        message = "status=$status",
                        recoverable = true
                    )
                    return
                }

                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> {
                        emitState(
                            IBERFITBleHeartRateTransportState.DISCOVERING
                        )

                        val discoveryStarted =
                            runCatching {
                                gatt.discoverServices()
                            }.getOrElse { throwable ->
                                failSecurityOrGatt(
                                    gatt = gatt,
                                    throwable = throwable,
                                    fallbackCode =
                                        "GATT_SERVICE_DISCOVERY_FAILED"
                                )
                                false
                            }

                        if (!discoveryStarted) {
                            fail(
                                gatt = gatt,
                                code =
                                    "GATT_SERVICE_DISCOVERY_NOT_STARTED",
                                message = null,
                                recoverable = true
                            )
                        }
                    }

                    BluetoothProfile.STATE_DISCONNECTED -> {
                        closeGatt(gatt)
                        emitState(
                            IBERFITBleHeartRateTransportState.DISCONNECTED
                        )
                    }
                }
            }

            override fun onServicesDiscovered(
                gatt: BluetoothGatt,
                status: Int
            ) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    fail(
                        gatt = gatt,
                        code = "GATT_SERVICE_DISCOVERY_FAILED",
                        message = "status=$status",
                        recoverable = true
                    )
                    return
                }

                val service =
                    gatt.getService(
                        IBERFITBleHeartRateProtocol
                            .HEART_RATE_SERVICE_UUID
                    )

                if (service == null) {
                    fail(
                        gatt = gatt,
                        code = "HEART_RATE_SERVICE_NOT_FOUND",
                        message = null,
                        recoverable = false
                    )
                    return
                }

                val characteristic =
                    service.getCharacteristic(
                        IBERFITBleHeartRateProtocol
                            .HEART_RATE_MEASUREMENT_UUID
                    )

                if (characteristic == null) {
                    fail(
                        gatt = gatt,
                        code =
                            "HEART_RATE_MEASUREMENT_NOT_FOUND",
                        message = null,
                        recoverable = false
                    )
                    return
                }

                if (
                    (
                        characteristic.properties and
                            BluetoothGattCharacteristic.PROPERTY_NOTIFY
                    ) == 0
                ) {
                    fail(
                        gatt = gatt,
                        code =
                            "HEART_RATE_MEASUREMENT_NOT_NOTIFIABLE",
                        message = null,
                        recoverable = false
                    )
                    return
                }

                enableMeasurementNotifications(
                    gatt = gatt,
                    characteristic = characteristic
                )
            }

            override fun onDescriptorWrite(
                gatt: BluetoothGatt,
                descriptor: BluetoothGattDescriptor,
                status: Int
            ) {
                if (
                    descriptor.uuid !=
                        IBERFITBleHeartRateProtocol
                            .CLIENT_CHARACTERISTIC_CONFIGURATION_UUID
                ) {
                    return
                }

                if (status == BluetoothGatt.GATT_SUCCESS) {
                    emitState(
                        IBERFITBleHeartRateTransportState.READY
                    )
                } else {
                    fail(
                        gatt = gatt,
                        code = "CCCD_WRITE_FAILED",
                        message = "status=$status",
                        recoverable = true
                    )
                }
            }

            @Suppress("DEPRECATION")
            override fun onCharacteristicChanged(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic
            ) {
                val value =
                    characteristic.value
                        ?.copyOf()
                        ?: return

                handleNotification(
                    characteristic = characteristic,
                    value = value
                )
            }

            override fun onCharacteristicChanged(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray
            ) {
                handleNotification(
                    characteristic = characteristic,
                    value = value.copyOf()
                )
            }
        }

    override fun setListener(
        listener: IBERFITBleHeartRateTransportListener?
    ) {
        this.listener = listener
    }

    override fun connect() {
        if (activeGatt != null) return

        emitState(
            IBERFITBleHeartRateTransportState.CONNECTING
        )

        try {
            val gatt =
                device.connectGatt(
                    appContext,
                    false,
                    callback,
                    BluetoothDevice.TRANSPORT_LE
                )

            if (gatt == null) {
                emitError(
                    code = "GATT_CONNECT_RETURNED_NULL",
                    message = null,
                    recoverable = true
                )
                emitState(
                    IBERFITBleHeartRateTransportState.DISCONNECTED
                )
                return
            }

            activeGatt = gatt
        } catch (throwable: Throwable) {
            failSecurityOrGatt(
                gatt = null,
                throwable = throwable,
                fallbackCode = "GATT_CONNECT_FAILED"
            )
        }
    }

    override fun disconnect() {
        val gatt = activeGatt
        activeGatt = null

        if (gatt != null) {
            runCatching {
                gatt.disconnect()
            }

            runCatching {
                gatt.close()
            }
        }

        emitState(
            IBERFITBleHeartRateTransportState.DISCONNECTED
        )
    }

    private fun enableMeasurementNotifications(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic
    ) {
        val localNotificationEnabled =
            runCatching {
                gatt.setCharacteristicNotification(
                    characteristic,
                    true
                )
            }.getOrElse { throwable ->
                failSecurityOrGatt(
                    gatt = gatt,
                    throwable = throwable,
                    fallbackCode =
                        "LOCAL_NOTIFICATION_ENABLE_FAILED"
                )
                false
            }

        if (!localNotificationEnabled) {
            fail(
                gatt = gatt,
                code = "LOCAL_NOTIFICATION_ENABLE_FAILED",
                message = null,
                recoverable = true
            )
            return
        }

        val descriptor =
            characteristic.getDescriptor(
                IBERFITBleHeartRateProtocol
                    .CLIENT_CHARACTERISTIC_CONFIGURATION_UUID
            )

        if (descriptor == null) {
            fail(
                gatt = gatt,
                code = "CCCD_NOT_FOUND",
                message = null,
                recoverable = false
            )
            return
        }

        emitState(
            IBERFITBleHeartRateTransportState.SUBSCRIBING
        )

        val writeStarted =
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    gatt.writeDescriptor(
                        descriptor,
                        BluetoothGattDescriptor
                            .ENABLE_NOTIFICATION_VALUE
                    ) == BluetoothStatusCodes.SUCCESS
                } else {
                    writeDescriptorLegacy(
                        gatt = gatt,
                        descriptor = descriptor
                    )
                }
            } catch (throwable: Throwable) {
                failSecurityOrGatt(
                    gatt = gatt,
                    throwable = throwable,
                    fallbackCode = "CCCD_WRITE_FAILED"
                )
                false
            }

        if (!writeStarted) {
            fail(
                gatt = gatt,
                code = "CCCD_WRITE_NOT_STARTED",
                message = null,
                recoverable = true
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun writeDescriptorLegacy(
        gatt: BluetoothGatt,
        descriptor: BluetoothGattDescriptor
    ): Boolean {
        descriptor.value =
            BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE

        return gatt.writeDescriptor(descriptor)
    }

    private fun handleNotification(
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray
    ) {
        if (
            characteristic.uuid !=
                IBERFITBleHeartRateProtocol
                    .HEART_RATE_MEASUREMENT_UUID
        ) {
            return
        }

        listener?.onHeartRateMeasurement(
            value = value,
            receivedAtEpochMs = System.currentTimeMillis()
        )
    }

    private fun failSecurityOrGatt(
        gatt: BluetoothGatt?,
        throwable: Throwable,
        fallbackCode: String
    ) {
        val securityFailure =
            throwable is SecurityException

        fail(
            gatt = gatt,
            code =
                if (securityFailure) {
                    "BLUETOOTH_CONNECT_PERMISSION_REQUIRED"
                } else {
                    fallbackCode
                },
            message =
                throwable.javaClass.simpleName,
            recoverable = true
        )
    }

    private fun fail(
        gatt: BluetoothGatt?,
        code: String,
        message: String?,
        recoverable: Boolean
    ) {
        closeGatt(gatt)

        emitError(
            code = code,
            message = message,
            recoverable = recoverable
        )

        emitState(
            IBERFITBleHeartRateTransportState.DISCONNECTED
        )
    }

    private fun closeGatt(
        gatt: BluetoothGatt?
    ) {
        if (gatt == null) return

        runCatching {
            gatt.close()
        }

        if (activeGatt === gatt) {
            activeGatt = null
        }
    }

    private fun emitState(
        state: IBERFITBleHeartRateTransportState
    ) {
        listener?.onTransportStateChanged(state)
    }

    private fun emitError(
        code: String,
        message: String?,
        recoverable: Boolean
    ) {
        listener?.onTransportError(
            code = code,
            message = message,
            recoverable = recoverable
        )
    }
}