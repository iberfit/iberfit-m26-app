package cl.iberfit.nativebridge.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.round

class IBERFITHealthConnectHistoricalReader(
    private val context: Context,
    private val zoneId: ZoneId = ZoneId.systemDefault()
) {
    companion object {
        const val MAX_LOOKBACK_DAYS = 30

        val SUPPORTED_METRICS: Set<String> =
            linkedSetOf(
                "steps",
                "sleepMinutes",
                "restingHeartRate",
                "hrvMs",
                "activeEnergyKcal",
                "workoutMinutes"
            )

        fun permissionForMetric(metric: String): String =
            when (metric) {
                "steps" ->
                    HealthPermission.getReadPermission(
                        StepsRecord::class
                    )

                "sleepMinutes" ->
                    HealthPermission.getReadPermission(
                        SleepSessionRecord::class
                    )

                "restingHeartRate" ->
                    HealthPermission.getReadPermission(
                        RestingHeartRateRecord::class
                    )

                "hrvMs" ->
                    HealthPermission.getReadPermission(
                        HeartRateVariabilityRmssdRecord::class
                    )

                "activeEnergyKcal" ->
                    HealthPermission.getReadPermission(
                        ActiveCaloriesBurnedRecord::class
                    )

                "workoutMinutes" ->
                    HealthPermission.getReadPermission(
                        ExerciseSessionRecord::class
                    )

                else ->
                    throw IllegalArgumentException(
                        "M26_HEALTH_CONNECT_METRIC_UNSUPPORTED"
                    )
            }

        fun permissionsForMetrics(
            metrics: Collection<String>
        ): Set<String> =
            metrics
                .filter { it in SUPPORTED_METRICS }
                .map(::permissionForMetric)
                .toSet()
    }

    private fun healthConnectClient(): HealthConnectClient {
        val status =
            HealthConnectClient.getSdkStatus(context)

        if (status != HealthConnectClient.SDK_AVAILABLE) {
            throw IllegalStateException(
                "M26_HEALTH_CONNECT_SDK_UNAVAILABLE:$status"
            )
        }

        return HealthConnectClient.getOrCreate(context)
    }

    suspend fun grantedMetrics(
        requestedMetrics: Collection<String>
    ): Set<String> {
        val requested =
            requestedMetrics
                .filter { it in SUPPORTED_METRICS }
                .toSet()

        val granted =
            healthConnectClient()
                .permissionController
                .getGrantedPermissions()

        return requested
            .filter { permissionForMetric(it) in granted }
            .toSet()
    }

    suspend fun readDailySummaries(
        clientId: String,
        startDate: String,
        endDate: String,
        requestedMetrics: Collection<String>
    ): JSONArray {
        require(
            clientId.matches(
                Regex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$")
            )
        ) {
            "M26_HEALTH_CONNECT_CLIENT_INVALID"
        }

        val start =
            runCatching {
                LocalDate.parse(startDate)
            }.getOrElse {
                throw IllegalArgumentException(
                    "M26_HEALTH_CONNECT_START_DATE_INVALID"
                )
            }

        val end =
            runCatching {
                LocalDate.parse(endDate)
            }.getOrElse {
                throw IllegalArgumentException(
                    "M26_HEALTH_CONNECT_END_DATE_INVALID"
                )
            }

        val dayCount =
            ChronoUnit.DAYS.between(
                start,
                end
            ) + 1

        require(dayCount in 1..MAX_LOOKBACK_DAYS) {
            "M26_HEALTH_CONNECT_LOOKBACK_EXCEEDS_30_DAYS"
        }

        val selected =
            requestedMetrics
                .filter { it in SUPPORTED_METRICS }
                .toSet()

        require(selected.isNotEmpty()) {
            "M26_HEALTH_CONNECT_SCOPE_REQUIRED"
        }

        val granted =
            grantedMetrics(selected)

        require(granted.isNotEmpty()) {
            "M26_HEALTH_CONNECT_PERMISSION_REQUIRED"
        }

        val client =
            healthConnectClient()

        val rows =
            JSONArray()

        var day =
            start

        while (!day.isAfter(end)) {
            val startInstant =
                day
                    .atStartOfDay(zoneId)
                    .toInstant()

            val endInstant =
                day
                    .plusDays(1)
                    .atStartOfDay(zoneId)
                    .toInstant()

            val aggregateMetrics =
                linkedSetOf<AggregateMetric<*>>()

            if ("steps" in granted) {
                aggregateMetrics.add(
                    StepsRecord.COUNT_TOTAL
                )
            }

            if ("sleepMinutes" in granted) {
                aggregateMetrics.add(
                    SleepSessionRecord.SLEEP_DURATION_TOTAL
                )
            }

            if ("restingHeartRate" in granted) {
                aggregateMetrics.add(
                    RestingHeartRateRecord.BPM_AVG
                )
            }

            if ("activeEnergyKcal" in granted) {
                aggregateMetrics.add(
                    ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                )
            }

            if ("workoutMinutes" in granted) {
                aggregateMetrics.add(
                    ExerciseSessionRecord.EXERCISE_DURATION_TOTAL
                )
            }

            val aggregate =
                if (aggregateMetrics.isEmpty()) {
                    null
                } else {
                    client.aggregate(
                        AggregateRequest(
                            metrics = aggregateMetrics,
                            timeRangeFilter =
                                TimeRangeFilter.between(
                                    startInstant,
                                    endInstant
                                )
                        )
                    )
                }

            val hrv =
                if ("hrvMs" in granted) {
                    val records =
                        client.readRecords(
                            ReadRecordsRequest(
                                recordType =
                                    HeartRateVariabilityRmssdRecord::class,
                                timeRangeFilter =
                                    TimeRangeFilter.between(
                                        startInstant,
                                        endInstant
                                    )
                            )
                        ).records

                    if (records.isEmpty()) {
                        null
                    } else {
                        round(
                            records
                                .map {
                                    it.heartRateVariabilityMillis
                                }
                                .average() * 10.0
                        ) / 10.0
                    }
                } else {
                    null
                }

            val row =
                JSONObject()
                    .put(
                        "clientId",
                        clientId
                    )
                    .put(
                        "provider",
                        "health_connect"
                    )
                    .put(
                        "date",
                        day.toString()
                    )
                    .put(
                        "quality",
                        "media"
                    )
                    .put(
                        "sourceUpdatedAt",
                        endInstant.toString()
                    )
                    .put(
                        "sourceRecordCount",
                        1
                    )

            if ("steps" in granted) {
                aggregate
                    ?.get(StepsRecord.COUNT_TOTAL)
                    ?.let {
                        row.put(
                            "steps",
                            it
                        )
                    }
            }

            if ("sleepMinutes" in granted) {
                aggregate
                    ?.get(
                        SleepSessionRecord.SLEEP_DURATION_TOTAL
                    )
                    ?.let {
                        row.put(
                            "sleepMinutes",
                            it.toMinutes()
                        )
                    }
            }

            if ("restingHeartRate" in granted) {
                aggregate
                    ?.get(
                        RestingHeartRateRecord.BPM_AVG
                    )
                    ?.let {
                        row.put(
                            "restingHeartRate",
                            it
                        )
                    }
            }

            if ("hrvMs" in granted && hrv != null) {
                row
                    .put(
                        "hrvMs",
                        hrv
                    )
                    .put(
                        "vfcMethod",
                        "rmssd"
                    )
            }

            if ("activeEnergyKcal" in granted) {
                aggregate
                    ?.get(
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                    )
                    ?.let {
                        row.put(
                            "activeEnergyKcal",
                            round(
                                it.inKilocalories * 10.0
                            ) / 10.0
                        )
                    }
            }

            if ("workoutMinutes" in granted) {
                aggregate
                    ?.get(
                        ExerciseSessionRecord.EXERCISE_DURATION_TOTAL
                    )
                    ?.let {
                        row.put(
                            "workoutMinutes",
                            it.toMinutes()
                        )
                    }
            }

            if (
                row.has("steps")
                ||row.has("sleepMinutes")
                ||row.has("restingHeartRate")
                ||row.has("hrvMs")
                ||row.has("activeEnergyKcal")
                ||row.has("workoutMinutes")
            ) {
                rows.put(row)
            }

            day =
                day.plusDays(1)
        }

        return rows
    }
}