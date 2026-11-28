package cl.iberfit.m26.phone

import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import cl.iberfit.healthconnect.dayWindow
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime

/**
 * Bounded, explicitly user-authorized, local-only workout evidence.
 * Health Connect exercise windows are NOT IBERFIT coaching session matches.
 * No raw GPS, pulse series, source package, secrets or network/database writes.
 */
internal class Connected360WorkoutReadOnlyQa(private val client: HealthConnectClient) {
    data class LocalWorkout(
        val exerciseType: String,
        val startAt: String,
        val endAt: String,
        val durationMinutes: Long,
        val heartRateSamples: Long?,
        val heartRateAverage: Long?,
        val heartRateMin: Long?,
        val heartRateMax: Long?,
        val distanceKm: Double?,
        val steps: Long?,
        val caloriesKcal: Double?,
        // Opaque stable record pseudonym for QA idempotence, NEVER raw Health Connect ID.
        val observationKey: String? = null,
        val sport: String = "other",
    )
    data class HistoryPage(val start: Instant, val end: Instant, val pageToken: String)
    data class ReadResult(
        val workouts: List<LocalWorkout>,
        val truncated: Boolean,
        val scopesGranted: Set<String>,
        val nextPage: HistoryPage? = null,
    )

    companion object {
        const val DAYS = 7
        const val MAX_WORKOUTS = 10
        const val PRODUCTION_MAX_WORKOUTS = 20
        private const val PAGE_SIZE = 50
        val requiredPermission = HealthPermission.getReadPermission(ExerciseSessionRecord::class)
        val permissions = linkedMapOf(
            "exercise" to requiredPermission,
            "heartRate" to HealthPermission.getReadPermission(HeartRateRecord::class),
            "distance" to HealthPermission.getReadPermission(DistanceRecord::class),
            "steps" to HealthPermission.getReadPermission(StepsRecord::class),
            "calories" to HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        )

        fun label(type: Int): String = when(type) {
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Carrera"
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIIT"
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Ciclismo"
            ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Caminata"
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Natación"
            ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Fuerza"
            else -> "Otro entrenamiento"
        }

        fun sport(type: Int): String = when(type) {
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"
            ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "swimming"
            ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "strength"
            else -> "other"
        }

        // Same-origin distance and elapsed interval only: do not imply moving
        // time, pool lengths, or a sensor-provided pace.
        fun elapsedSwimPaceSeconds(workout: LocalWorkout): Long? {
            if(workout.sport != "swimming") return null
            val meters=workout.distanceKm?.times(1000.0) ?: return null
            if(!meters.isFinite() || meters < 100.0 || meters > 500000.0) return null
            val start=runCatching { Instant.parse(workout.startAt) }.getOrNull() ?: return null
            val end=runCatching { Instant.parse(workout.endAt) }.getOrNull() ?: return null
            val duration=Duration.between(start,end)
            if(duration.isZero || duration.isNegative || duration > Duration.ofHours(24)) return null
            val pace=Math.round(duration.toMillis().toDouble()/1000.0*100.0/meters)
            return pace.takeIf { it in 15L..1200L }
        }

        fun opaqueRecordKey(recordId: String): String? {
            if(recordId.isBlank() || recordId.length > 256) return null
            val bytes = MessageDigest.getInstance("SHA-256").digest(
                ("iberfit:health-connect:exercise:v46:" + recordId).toByteArray(Charsets.UTF_8)
            )
            return bytes.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2,'0') }
        }

        fun render(result: ReadResult): String {
            if(result.workouts.isEmpty()) return "Sin sesiones deportivas registradas en Health Connect durante los últimos 7 días. " +
                "Comprueba la sincronización de ejercicios en Samsung Health. " +
                "No se han enviado datos a IBERFIT."
            val rows = result.workouts.joinToString("\n\n") { w ->
                val distance=w.distanceKm?.let { " · " +
                    String.format(java.util.Locale.US,"%.2f",it)+" km" } ?: ""
                val kcal=w.caloriesKcal?.let { " · "+it.toInt().toString()+" kcal" } ?: ""
                val swimPace=elapsedSwimPaceSeconds(w)?.let {
                    " · ritmo total estimado "+String.format(java.util.Locale.US,"%d:%02d",it/60,it%60)+" min/100 m"
                } ?: ""
                val pulse=if(w.heartRateSamples!=null&&w.heartRateSamples>0L)
                    "FC general: "+(w.heartRateAverage?.toString()?:"media no disponible")+
                    " media, "+(w.heartRateMax?.toString()?:"máxima no disponible")+
                    " máxima, "+w.heartRateSamples.toString()+" muestras"
                    else "FC general: sin registros de la misma fuente"
                w.exerciseType+": "+w.durationMinutes.toString()+" min"+distance+kcal+swimPace+"\n"+
                    w.startAt+" → "+w.endAt+"\n"+pulse
            }
            val limited=if(result.truncated) "\n\nExisten más sesiones fuera del límite de esta prueba." else ""
            return "Sesiones detectadas SOLO en el teléfono:\n"+rows+limited+
                "\n\nNo implica que estén asociadas a un entrenamiento IBERFIT. " +
                "FC general NO es FC en reposo. No se han enviado datos a IBERFIT."
        }
    }

    suspend fun read(
        includeHeartRate: Boolean = true,
        maxWorkouts: Int = MAX_WORKOUTS,
        historyDays: Int? = null,
        continuation: HistoryPage? = null,
    ): ReadResult {
        require(historyDays == null || historyDays in setOf(7, 30))
        require(continuation == null || historyDays != null)
        require(maxWorkouts in 1..PRODUCTION_MAX_WORKOUTS) { "M26_HEALTH_WORKOUT_BATCH_INVALID" }
        val granted = client.permissionController.getGrantedPermissions()
        check(requiredPermission in granted) { "M26_HEALTH_EXERCISE_PERMISSION_REQUIRED" }
        // A separate remote grant is still required to export pulse data: never read
        // optional pulse aggregates merely because Android previously granted permission.
        val grantedScopes = permissions.filterValues { it in granted }.keys.toSet()
        val scopes = if (includeHeartRate) grantedScopes else grantedScopes - "heartRate"
        val clock=ZonedDateTime.now()
        val end=continuation?.end ?: clock.toInstant()
        val start=continuation?.start ?: if(historyDays != null)
            end.minus(Duration.ofDays(historyDays.toLong()))
        else dayWindow(clock.toLocalDate().minusDays((DAYS-1).toLong()),clock.zone).first
        require(start.isBefore(end) && !end.isAfter(clock.toInstant()))
        // Continuation always reuses the same interval and system page token.
        // A paginated page must fit the ingestion batch; never discard a tail
        // and advance a cursor beyond records that were not considered.
        if(historyDays != null) {
            require(Duration.between(start,end) == Duration.ofDays(historyDays.toLong()))
            require(Duration.between(start,clock.toInstant()) < Duration.ofDays(31))
        }
        val page=client.readRecords(
            ReadRecordsRequest(
                recordType=ExerciseSessionRecord::class,
                timeRangeFilter=TimeRangeFilter.between(start,end),
                // Health Connect defaults to ascending start time; taking one
                // page in that order can permanently hide the newest activities.
                ascendingOrder=false,
                pageSize=if(historyDays == null) PAGE_SIZE else maxWorkouts,
                pageToken=continuation?.pageToken,
            )
        )
        if(historyDays != null) check(page.records.size <= maxWorkouts) { "M26_HEALTH_WORKOUT_PAGE_OVERFLOW" }
        val exercises=page.records
            .filter { it.endTime.isAfter(it.startTime) && !it.endTime.isAfter(end) &&
                Duration.between(it.startTime,it.endTime) <= Duration.ofHours(24) &&
                opaqueRecordKey(it.metadata.id) != null &&
                (historyDays == null || !it.startTime.isBefore(start)) }
            .sortedByDescending { it.endTime }
        val truncated=!page.pageToken.isNullOrEmpty()||exercises.size>maxWorkouts
        val found=mutableListOf<LocalWorkout>()
        for(exercise in exercises.distinctBy { it.metadata.id }.take(maxWorkouts)){
            val elapsed=Duration.between(exercise.startTime,exercise.endTime)
            if(elapsed.isZero||elapsed.isNegative||elapsed.toHours()>24L)continue
            val fields=buildSet<androidx.health.connect.client.aggregate.AggregateMetric<*>> {
                if("heartRate" in scopes){
                    add(HeartRateRecord.MEASUREMENTS_COUNT)
                    add(HeartRateRecord.BPM_AVG)
                    add(HeartRateRecord.BPM_MIN)
                    add(HeartRateRecord.BPM_MAX)
                }
                if("distance" in scopes)add(DistanceRecord.DISTANCE_TOTAL)
                if("steps" in scopes)add(StepsRecord.COUNT_TOTAL)
                if("calories" in scopes)add(TotalCaloriesBurnedRecord.ENERGY_TOTAL)
            }
            val summary=if(fields.isEmpty())null else client.aggregate(
                AggregateRequest(
                    metrics=fields,
                    timeRangeFilter=TimeRangeFilter.between(exercise.startTime,exercise.endTime),
                    // Prevent unrelated app/watch activity entering this session.
                    dataOriginFilter=setOf(exercise.metadata.dataOrigin),
                )
            )
            found+=LocalWorkout(
                exerciseType=label(exercise.exerciseType),
                startAt=exercise.startTime.toString(),
                endAt=exercise.endTime.toString(),
                durationMinutes=elapsed.toMinutes(),
                heartRateSamples=summary?.get(HeartRateRecord.MEASUREMENTS_COUNT),
                heartRateAverage=summary?.get(HeartRateRecord.BPM_AVG),
                heartRateMin=summary?.get(HeartRateRecord.BPM_MIN),
                heartRateMax=summary?.get(HeartRateRecord.BPM_MAX),
                distanceKm=summary?.get(DistanceRecord.DISTANCE_TOTAL)?.inMeters?.div(1000.0),
                steps=summary?.get(StepsRecord.COUNT_TOTAL),
                caloriesKcal=summary?.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL)?.inKilocalories,
                observationKey=opaqueRecordKey(exercise.metadata.id),
                sport=sport(exercise.exerciseType),
            )
        }
        val nextPage=if(historyDays != null) page.pageToken?.takeIf { it.isNotEmpty() }?.let {
            check(it != continuation?.pageToken) { "M26_HEALTH_V46_CURSOR_INVALID" }
            HistoryPage(start,end,it)
        } else null
        return ReadResult(found,truncated,scopes,nextPage)
    }
}
