package cl.iberfit.m26.phone

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import cl.iberfit.healthconnect.dayWindow
import java.time.ZonedDateTime

/**
 * DEBUG-only, ephemeral, local Health Connect heart-rate availability proof.
 *
 * Samsung Health may expose HeartRateRecord without RestingHeartRateRecord.
 * General pulse (including exercise/sleep samples) is NEVER resting pulse.
 * No raw series, account identity, network transport, persistence or upload.
 */
internal class Connected360GeneralHeartRateDiagnostic(
    private val client: HealthConnectClient,
) {
    data class DailyHeartRateRange(
        val date: String,
        val measurements: Long,
        val minBpm: Long?,
        val maxBpm: Long?,
    )

    companion object {
        const val LOOKBACK_DAYS = 7
        val permission: String = HealthPermission.getReadPermission(HeartRateRecord::class)

        // Keep the initial single-aggregate QA diagnostic contract for existing tests.
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

        fun dailyText(rows: List<DailyHeartRateRange>): String {
            val valid = rows.filter { it.measurements > 0L }
            if (valid.isEmpty()) return resultText(null)
            val total = valid.sumOf { it.measurements }
            val detail = valid.sortedByDescending { it.date }.joinToString("\n") { item ->
                val range = if (item.minBpm != null && item.maxBpm != null &&
                    item.minBpm > 0 && item.maxBpm >= item.minBpm) {
                    " · FC general observada ${item.minBpm}–${item.maxBpm} lpm"
                } else {
                    " · rango no disponible"
                }
                "${item.date}: ${item.measurements} mediciones$range"
            }
            // Sampling density varies by manufacturer and battery settings;
            // never present aggregate averages as resting HR or clinical trends.
            return "$total mediciones de frecuencia cardíaca GENERAL en los últimos 7 días " +
                "(${valid.size} días con registros).\n$detail\n" +
                "Estos rangos pueden incluir sueño, movimiento y entrenamiento; " +
                "NO son frecuencia cardíaca en reposo. " +
                "No se han enviado datos a IBERFIT."
        }
    }

    private suspend fun requirePermission() {
        check(client.permissionController.getGrantedPermissions().contains(permission)) {
            "M26_HEALTH_GENERAL_HEART_RATE_PERMISSION_REQUIRED"
        }
    }

    /** Preserved for the earlier one-shot count-only QA contract. */
    suspend fun countMeasurements(): Long? {
        val context = ZonedDateTime.now()
        val start = dayWindow(context.toLocalDate().minusDays((LOOKBACK_DAYS - 1).toLong()), context.zone).first
        val end = dayWindow(context.toLocalDate(), context.zone).second
        requirePermission()
        val result = client.aggregate(
            AggregateRequest(
                metrics = setOf(HeartRateRecord.MEASUREMENTS_COUNT),
                timeRangeFilter = TimeRangeFilter.between(start, end),
            )
        )
        return result[HeartRateRecord.MEASUREMENTS_COUNT]
    }

    /** Up to 7 daily, bounded aggregate requests; no raw beat samples. */
    suspend fun readDailyRanges(): List<DailyHeartRateRange> {
        val context = ZonedDateTime.now()
        val today = context.toLocalDate()
        val zone = context.zone
        requirePermission()
        val daily = mutableListOf<DailyHeartRateRange>()
        for (offset in (LOOKBACK_DAYS - 1) downTo 0) {
            val date = today.minusDays(offset.toLong())
            val (start, end) = dayWindow(date, zone)
            val result = client.aggregate(
                AggregateRequest(
                    metrics = setOf(
                        HeartRateRecord.MEASUREMENTS_COUNT,
                        HeartRateRecord.BPM_MIN,
                        HeartRateRecord.BPM_MAX,
                    ),
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                )
            )
            val count = result[HeartRateRecord.MEASUREMENTS_COUNT] ?: 0L
            if (count > 0L) {
                daily += DailyHeartRateRange(
                    date = date.toString(),
                    measurements = count,
                    minBpm = result[HeartRateRecord.BPM_MIN],
                    maxBpm = result[HeartRateRecord.BPM_MAX],
                )
            }
        }
        return daily
    }
}
