package cl.iberfit.nativebridge.ble

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Bluetooth SIG Heart Rate Measurement (0x2A37) parser.
 *
 * The parser preserves protocol-valid raw values. Physiological plausibility
 * belongs to the canonical heart-rate layer, not to the BLE packet decoder.
 */
object IBERFITBleHeartRateParser {
    data class Sample(
        val heartRateBpm: Int,
        val sensorContactDetected: Boolean?,
        val energyExpended: Int?,
        val rrIntervalsMs: List<Double>
    ) {
        /**
         * Temporary compatibility surface for the pre-RC57 Android web runtime.
         * These are derived views only; parsing remains protocol-truth preserving.
         */
        val provider: String
            get() = "bluetooth_hrs"

        val quality: String
            get() =
                when {
                    heartRateBpm !in 25..240 ->
                        "out_of_range"

                    sensorContactDetected == false ->
                        "poor_contact"

                    else ->
                        "valid"
                }
    }

    fun parse(value: ByteArray): Sample? {
        if (value.isEmpty()) return null

        val flags = value[0].toInt() and 0xFF
        val heartRateIsUInt16 = flags and HEART_RATE_FORMAT_UINT16 != 0
        val sensorContactSupported =
            flags and SENSOR_CONTACT_SUPPORTED != 0
        val sensorContactDetected =
            if (sensorContactSupported) {
                flags and SENSOR_CONTACT_DETECTED != 0
            } else {
                null
            }
        val energyPresent = flags and ENERGY_EXPENDED_PRESENT != 0
        val rrPresent = flags and RR_INTERVAL_PRESENT != 0

        var offset = 1

        val bpm =
            if (heartRateIsUInt16) {
                readUInt16LittleEndian(value, offset)
                    ?.also { offset += 2 }
                    ?: return null
            } else {
                readUInt8(value, offset)
                    ?.also { offset += 1 }
                    ?: return null
            }

        val energyExpended =
            if (energyPresent) {
                readUInt16LittleEndian(value, offset)
                    ?.also { offset += 2 }
                    ?: return null
            } else {
                null
            }

        val rrIntervalsMs = mutableListOf<Double>()

        if (rrPresent) {
            if ((value.size - offset) % 2 != 0) {
                return null
            }

            while (value.size >= offset + 2) {
                val raw =
                    readUInt16LittleEndian(value, offset)
                        ?: return null

                offset += 2
                rrIntervalsMs += raw * 1000.0 / 1024.0
            }
        }

        return Sample(
            heartRateBpm = bpm,
            sensorContactDetected = sensorContactDetected,
            energyExpended = energyExpended,
            rrIntervalsMs = rrIntervalsMs
        )
    }

    private fun readUInt8(
        value: ByteArray,
        offset: Int
    ): Int? =
        value.getOrNull(offset)
            ?.toInt()
            ?.and(0xFF)

    private fun readUInt16LittleEndian(
        value: ByteArray,
        offset: Int
    ): Int? {
        if (value.size < offset + 2) return null

        return ByteBuffer
            .wrap(value, offset, 2)
            .order(ByteOrder.LITTLE_ENDIAN)
            .short
            .toInt() and 0xFFFF
    }

    private const val HEART_RATE_FORMAT_UINT16 = 0x01
    private const val SENSOR_CONTACT_DETECTED = 0x02
    private const val SENSOR_CONTACT_SUPPORTED = 0x04
    private const val ENERGY_EXPENDED_PRESENT = 0x08
    private const val RR_INTERVAL_PRESENT = 0x10
}