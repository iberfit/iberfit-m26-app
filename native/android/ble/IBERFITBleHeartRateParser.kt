package cl.iberfit.nativebridge.ble

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Parser for Bluetooth SIG Heart Rate Measurement characteristic (0x2A37).
 * RR intervals are preserved as raw milliseconds and are NOT converted to VFC.
 */
object IBERFITBleHeartRateParser {
    data class Sample(
        val provider: String = "ble_direct",
        val heartRateBpm: Int,
        val rrIntervalsMs: List<Double>,
        val quality: String = "alta"
    )

    fun parse(value: ByteArray): Sample? {
        if (value.isEmpty()) return null
        val flags = value[0].toInt() and 0xFF
        val heartRateIsUInt16 = flags and 0x01 != 0
        val energyPresent = flags and 0x08 != 0
        val rrPresent = flags and 0x10 != 0
        var offset = 1

        val bpm = if (heartRateIsUInt16) {
            if (value.size < offset + 2) return null
            val result = ByteBuffer.wrap(value, offset, 2)
                .order(ByteOrder.LITTLE_ENDIAN).short.toInt() and 0xFFFF
            offset += 2
            result
        } else {
            if (value.size < offset + 1) return null
            val result = value[offset].toInt() and 0xFF
            offset += 1
            result
        }
        if (bpm !in 25..240) return null

        if (energyPresent) {
            if (value.size < offset + 2) return null
            offset += 2
        }

        val rr = mutableListOf<Double>()
        if (rrPresent) {
            while (value.size >= offset + 2 && rr.size < 24) {
                val raw = ByteBuffer.wrap(value, offset, 2)
                    .order(ByteOrder.LITTLE_ENDIAN).short.toInt() and 0xFFFF
                offset += 2
                val ms = raw * 1000.0 / 1024.0
                if (ms in 250.0..2500.0) rr += ms
            }
        }
        return Sample(heartRateBpm = bpm, rrIntervalsMs = rr)
    }
}
