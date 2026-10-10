package cl.iberfit.healthconnect

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Android-only, read-only acquisition. No credentials, network, WebView, or client identity
 * are handled here; those belong to a separately authenticated, origin-pinned bridge.
 *
 * Consent happens in the official Health Connect permission UI, not in this class.
 */
class IberfitHealthConnectReader(
    private val healthConnect: HealthConnectClient,
    // Null means resolve the device's current civil zone for EACH new read.
    // Clock.systemDefaultZone() freezes its zone at construction time.
    private val clock: Clock? = null,
) {
    companion object {
        const val MAX_INITIAL_DAYS = 30
        const val PROVIDER = "health_connect"
        val supportedMetrics = setOf("steps", "sleepMinutes", "restingHeartRate")

        private val requiredPermissions = mapOf(
            "steps" to HealthPermission.getReadPermission(StepsRecord::class),
            "sleepMinutes" to HealthPermission.getReadPermission(SleepSessionRecord::class),
            "restingHeartRate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        )
    }

    data class DailySummary(
        val provider: String,
        val date: String,
        val steps: Long?,
        val sleepMinutes: Long?,
        val restingHeartRate: Long?,
        // Read time is NOT the source measurement update time. Do not fabricate freshness.
        val acquiredAt: String,
        // Local aggregation window, NOT an event source's device time zone.
        val aggregationTimeZone: String,
        // Number of contributing Android app origins for this daily aggregate.
        // NOT a physical watch count, not a source UUID, and may be unknown.
        val contributingAppCount: Int? = null,
    )

    /**
     * User choice is granular: callers may read only categories still granted
     * by the official Android Health Connect permission controller.
     * No revoked/denied metric is silently represented as zero.
     */
    suspend fun grantedMetrics(requestedMetrics: Set<String>): Set<String> {
        require(requestedMetrics.isNotEmpty() && supportedMetrics.containsAll(requestedMetrics)) {
            "IBERFIT_HEALTH_UNSUPPORTED_METRIC"
        }
        val permissions = healthConnect.permissionController.getGrantedPermissions()
        return requestedMetrics.filterTo(linkedSetOf()) {
            permissions.contains(requiredPermissions.getValue(it))
        }
    }

    /**
     * Call only after the app's explicit permission request has completed.
     * A missing permission fails closed rather than silently fabricating a zero value.
     */
    suspend fun readDaily(
        requestedMetrics: Set<String>,
        days: Int = 7,
    ): List<DailySummary> {
        require(days in 1..MAX_INITIAL_DAYS) { "IBERFIT_HEALTH_LOOKBACK_NOT_ALLOWED" }
        require(requestedMetrics.isNotEmpty() && supportedMetrics.containsAll(requestedMetrics)) {
            "IBERFIT_HEALTH_UNSUPPORTED_METRIC"
        }
        val granted = healthConnect.permissionController.getGrantedPermissions()
        require(requestedMetrics.all { granted.contains(requiredPermissions.getValue(it)) }) {
            "IBERFIT_HEALTH_PERMISSION_REQUIRED"
        }

        // One coherent capture of date, civil zone and acquisition time;
        // changing the phone timezone between reads must not use a stale zone.
        val context = dailyReadContext(clock)
        val today = context.localDate
        val zone = context.aggregationZone
        val observedAt = context.acquiredAt
        val result = mutableListOf<DailySummary>()
        for (offset in (days - 1) downTo 0) {
            val date = today.minusDays(offset.toLong())
            val (start, end) = dayWindow(date, zone)
            val metrics = buildSet {
                if ("steps" in requestedMetrics) add(StepsRecord.COUNT_TOTAL)
                if ("sleepMinutes" in requestedMetrics) add(SleepSessionRecord.SLEEP_DURATION_TOTAL)
                if ("restingHeartRate" in requestedMetrics) add(RestingHeartRateRecord.BPM_AVG)
            }
            // Health Connect aggregation respects source priority for cumulative measures,
            // unlike summing all raw StepsRecords (which double counts overlapping watches).
            val aggregate = healthConnect.aggregate(
                AggregateRequest(
                    metrics = metrics,
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                )
            )
            val steps = if ("steps" in requestedMetrics) aggregate[StepsRecord.COUNT_TOTAL] else null
            val sleep = if ("sleepMinutes" in requestedMetrics) {
                aggregate[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes()
            } else null
            val resting = if ("restingHeartRate" in requestedMetrics) {
                aggregate[RestingHeartRateRecord.BPM_AVG]
            } else null

            // AndroidX 1.1.0 exposes contributing application origins for
            // an aggregate. It does NOT attest any physical sensor or watch.
            // An empty set is unknown provenance, never "zero apps".
            val contributingApps = aggregate.dataOrigins.size.takeIf { it > 0 }

            // Missing record remains null, never 0. Empty days are not imported.
            if (steps != null || sleep != null || resting != null) {
                result += DailySummary(
                    provider = PROVIDER,
                    date = date.toString(),
                    steps = steps,
                    sleepMinutes = sleep,
                    restingHeartRate = resting,
                    acquiredAt = observedAt,
                    aggregationTimeZone = zone.id,
                    contributingAppCount = contributingApps,
                )
            }
        }
        return result
    }
}

/**
 * A single acquisition snapshot. A supplied clock preserves deterministic
 * tests; the real phone obtains its CURRENT default timezone on every read.
 * Acquired-at is not a sensor source timestamp or an updated-at marker.
 */
internal data class DailyReadContext(
    val localDate: LocalDate,
    val aggregationZone: ZoneId,
    val acquiredAt: String,
)

internal fun dailyReadContext(overrideClock: Clock? = null): DailyReadContext {
    val currentClock = overrideClock ?: Clock.systemDefaultZone()
    val acquired = Instant.now(currentClock)
    val zone = currentClock.zone
    return DailyReadContext(
        localDate = acquired.atZone(zone).toLocalDate(),
        aggregationZone = zone,
        acquiredAt = acquired.toString(),
    )
}

/** Respects the person's local civil day, including daylight saving transitions. */
fun dayWindow(date: LocalDate, zone: ZoneId): Pair<Instant, Instant> =
    date.atStartOfDay(zone).toInstant() to date.plusDays(1).atStartOfDay(zone).toInstant()
