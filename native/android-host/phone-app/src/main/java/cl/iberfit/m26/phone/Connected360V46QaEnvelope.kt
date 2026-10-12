package cl.iberfit.m26.phone

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Local, memory-only mapping from official Health Connect aggregate reads to the
 * separately authorized V46 QA ingest contract.
 *
 * IMPORTANT: this does not prove which physical watch produced the records;
 * does not grant remote consent; never sends credentials or network requests.
 * Calling code must recheck the authenticated owner, remote grant and Android
 * permissions before attempting an explicitly authorized QA RPC.
 */
internal object Connected360V46QaEnvelope {
    const val SCHEMA = "iberfit.connected360.qa.v46.explicit.v1"
    private val hashPattern = Regex("^[0-9a-f]{64}$")
    private val zones = Regex("^[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$")
    private val sports = setOf("running", "interval_running", "hiit", "cycling", "walking", "strength", "other")

    private fun validZone(zone: ZoneId): Boolean =
        zone.id.length in 1..80 && zones.matches(zone.id)

    private fun bpm(value: Long?): Int? =
        value?.takeIf { it in 25L..240L }?.toInt()

    private fun safeInt(value: Long?, min: Long, max: Long): Int? =
        value?.takeIf { it in min..max }?.toInt()

    private fun validDecimal(value: Double?, min: Double, max: Double): Double? =
        value?.takeIf { it.isFinite() && it >= min && it <= max }

    private fun hrRanges(min: Long?, max: Long?): Pair<Int?, Int?> {
        val lo = bpm(min)
        val hi = bpm(max)
        return if (lo != null && hi != null && lo <= hi) lo to hi else null to null
    }

    /**
     * Missing source metadata stays missing. Never construct a fictitious
     * sourceKey, restingHeartRate, sourceUpdatedAt, or device identity.
     */
    fun build(
        dailyHeartRate: List<Connected360GeneralHeartRateDiagnostic.DailyHeartRateRange>,
        workouts: List<Connected360WorkoutReadOnlyQa.LocalWorkout>,
        aggregationZone: ZoneId,
        acquiredAt: Instant,
    ): Map<String, Any> {
        require(validZone(aggregationZone)) { "M26_V46_QA_INVALID_IANA_ZONE" }
        val today = acquiredAt.atZone(aggregationZone).toLocalDate()
        val oldestDay = today.minusDays(6)
        val dailyRows = dailyHeartRate.asSequence()
            .take(7)
            .distinctBy { it.date }
            .mapNotNull { row ->
                val date = runCatching { LocalDate.parse(row.date) }.getOrNull()
                    ?: return@mapNotNull null
                if (date < oldestDay || date > today) return@mapNotNull null
                val count = safeInt(row.measurements, 1, 200000)
                    ?: return@mapNotNull null
                val start = date.atStartOfDay(aggregationZone).toInstant()
                val nextDay = date.plusDays(1).atStartOfDay(aggregationZone).toInstant()
                val end = if (nextDay.isAfter(acquiredAt)) acquiredAt else nextDay
                if (!end.isAfter(start) || Duration.between(start, end).toHours() > 25L) {
                    return@mapNotNull null
                }
                val (low, high) = hrRanges(row.minBpm, row.maxBpm)
                mutableMapOf<String, Any>(
                    "date" to date.toString(),
                    "aggregationTimeZone" to aggregationZone.id,
                    "windowStartedAt" to start.toString(),
                    "windowEndedAt" to end.toString(),
                    "acquiredAt" to acquiredAt.toString(),
                    "sampleCount" to count,
                ).apply {
                    if (low != null && high != null) {
                        put("minBpm", low)
                        put("maxBpm", high)
                    }
                }
            }.toList()

        val exercises = workouts.asSequence()
            .take(10)
            .mapNotNull { w ->
                val key = w.observationKey ?: return@mapNotNull null
                if (!hashPattern.matches(key)) return@mapNotNull null
                val start = runCatching { Instant.parse(w.startAt) }.getOrNull()
                    ?: return@mapNotNull null
                val end = runCatching { Instant.parse(w.endAt) }.getOrNull()
                    ?: return@mapNotNull null
                val duration = Duration.between(start, end)
                if (!end.isAfter(start) || duration > Duration.ofHours(24)
                    || start.isAfter(acquiredAt) || end.isAfter(acquiredAt)) {
                    return@mapNotNull null
                }
                val (lo, hi) = hrRanges(w.heartRateMin, w.heartRateMax)
                val samples = safeInt(w.heartRateSamples, 0, 200000)
                val avg = bpm(w.heartRateAverage)?.takeIf {
                    (lo == null || it >= lo) && (hi == null || it <= hi)
                }
                val mode = w.sport.takeIf { it in sports } ?: "other"
                mutableMapOf<String, Any>(
                    "observationKey" to key,
                    "sport" to mode,
                    "startedAt" to start.toString(),
                    "endedAt" to end.toString(),
                    "acquiredAt" to acquiredAt.toString(),
                ).apply {
                    if (samples != null) {
                        put("heartRateSamples", samples)
                        if (lo != null && hi != null) {
                            put("minBpm", lo)
                            put("maxBpm", hi)
                        }
                        if (avg != null) put("avgBpm", avg)
                    }
                    validDecimal(w.distanceKm?.times(1000.0), 0.0, 500000.0)
                        ?.let { put("distanceMeters", it) }
                    safeInt(w.steps, 0, 200000)?.let { put("steps", it) }
                    validDecimal(w.caloriesKcal, 0.0, 20000.0)
                        ?.let { put("caloriesKcal", it) }
                }
            }
            // Invalid or future observations must not reserve the duplicate key.
            .distinctBy { it["observationKey"] }
            .toList()

        return mapOf(
            "schema" to SCHEMA,
            "heartRateDaily" to dailyRows,
            "exerciseEvidence" to exercises,
        )
    }
}
