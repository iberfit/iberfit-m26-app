package cl.iberfit.nativebridge.wear

import android.content.Context
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.DataType

/**
 * Wear OS reference adapter boundary for IBERFIT.
 * Wire this class to ExerciseClient callbacks in the actual Wear OS target.
 */
class IBERFITWearHealthServicesBridge(context: Context) {
    val exerciseClient = HealthServices.getClient(context).exerciseClient
    val requestedDataTypes = setOf(DataType.HEART_RATE_BPM)

    data class Sample(
        val type: String = "sample",
        val provider: String = "wear_os_health_services",
        val heartRateBpm: Double,
        val quality: String = "alta",
        val recordedAt: String
    )

    fun validateHeartRate(bpm: Double): Double? =
        bpm.takeIf { it in 25.0..240.0 }

    // The host app owns ExerciseClient lifecycle and runtime permissions.
}
