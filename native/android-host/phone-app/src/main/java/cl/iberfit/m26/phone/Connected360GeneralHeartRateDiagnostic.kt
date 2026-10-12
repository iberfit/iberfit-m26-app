package cl.iberfit.m26.phone

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import cl.iberfit.healthconnect.dayWindow
import java.time.ZonedDateTime

/**
 * DEBUG-only, local Health Connect SOURCE diagnostic.
 *
 * Samsung Health and other providers may export generic HeartRateRecord even
 * when RestingHeartRateRecord is absent. These are DIFFERENT physiological
 * signals. Never derive or backfill restingHeartRate from generic pulse data.
 *
 * This probe only returns the COUNT of general heart-rate measurements. It
 * neither returns pulse values nor connects, persists or sends user data.
 */
internal class Connected360GeneralHeartRateDiagnostic(
    private val client: HealthConnectClient,
) {
    companion object {
        const val LOOKBACK_DAYS = 7
        val permission: String = HealthPermission.getReadPermission(HeartRateRecord::class)

        fun resultText(count: Long?): String = when {
            count == null || count <= 0L ->
                "No hay mediciones de frecuencia cardíaca general accesibles en los últimos 7 días. " +
                    "Comprueba que la aplicación del reloj comparte esa categoría con Salud conectada. " +
                    "No se han enviado datos a IBERFIT."
            count == 1L ->
                "Health Connect tiene 1 medición de frecuencia cardíaca general en los últimos 7 días. " +
                    "No equivale a frecuencia cardíaca EN REPOSO. No se han enviado datos a IBERFIT."
            else ->
                "Health Connect tiene $count mediciones de frecuencia cardíaca general en los últimos 7 días. " +
                    "No equivalen a frecuencia cardíaca EN REPOSO. No se han enviado datos a IBERFIT."
        }
    }

    suspend fun countMeasurements(): Long? {
        // One civil-day snapshot; avoids shifting the interval at UTC midnight
        // and honors short or long days during daylight-saving transitions.
        val localNow = ZonedDateTime.now()
        val date = localNow.toLocalDate()
        val zone = localNow.zone
        val start = dayWindow(date.minusDays((LOOKBACK_DAYS - 1).toLong()), zone).first
        val end = dayWindow(date, zone).second
        val permissionGranted = client.permissionController
            .getGrantedPermissions().contains(permission)
        check(permissionGranted) { "M26_HEALTH_GENERAL_HEART_RATE_PERMISSION_REQUIRED" }
        val result = client.aggregate(
            AggregateRequest(
                metrics = setOf(HeartRateRecord.HEART_MEASUREMENTS_COUNT),
                timeRangeFilter = TimeRangeFilter.between(start, end),
            )
        )
        return result[HeartRateRecord.HEART_MEASUREMENTS_COUNT]
    }
}
