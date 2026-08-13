package cl.iberfit.nativebridge.ble

import java.util.UUID

object IBERFITBleHeartRateProtocol {
    const val HEART_RATE_SERVICE_ASSIGNED_NUMBER = 0x180D
    const val HEART_RATE_MEASUREMENT_ASSIGNED_NUMBER = 0x2A37
    const val CLIENT_CHARACTERISTIC_CONFIGURATION_ASSIGNED_NUMBER = 0x2902

    val HEART_RATE_SERVICE_UUID: UUID =
        UUID.fromString(
            "0000180d-0000-1000-8000-00805f9b34fb"
        )

    val HEART_RATE_MEASUREMENT_UUID: UUID =
        UUID.fromString(
            "00002a37-0000-1000-8000-00805f9b34fb"
        )

    val CLIENT_CHARACTERISTIC_CONFIGURATION_UUID: UUID =
        UUID.fromString(
            "00002902-0000-1000-8000-00805f9b34fb"
        )
}