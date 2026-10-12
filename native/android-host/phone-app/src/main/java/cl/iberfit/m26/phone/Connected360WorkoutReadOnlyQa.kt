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
import java.time.Duration
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
    )
    data class ReadResult(
        val workouts: List<LocalWorkout>,
        val truncated: Boolean,
        val scopesGranted: Set<String>,
    )

    companion object {
        const val DAYS = 7
        const val MAX_WORKOUTS = 10
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
            ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Fuerza"
            else -> "Otro entrenamiento"
        }

        fun render(result: ReadResult): String {
            if(result.workouts.isEmpty()) return "Sin sesiones deportivas registradas en Health Connect durante los últimos 7 días. " +
                "Comprueba la sincronización de ejercicios en Samsung Health. " +
                "No se han enviado datos a IBERFIT."
            val rows = result.workouts.joinToString("\n\n") { w ->
                val distance=w.distanceKm?.let { " · " +
                    String.format(java.util.Locale.US,"%.2f",it)+" km" } ?: ""
                val kcal=w.caloriesKcal?.let { " · "+it.toInt().toString()+" kcal" } ?: ""
                val pulse=if(w.heartRateSamples!=null&&w.heartRateSamples>0L)
                    "FC general: "+(w.heartRateAverage?.toString()?:"media no disponible")+
                    " media, "+(w.heartRateMax?.toString()?:"máxima no disponible")+
                    " máxima, "+w.heartRateSamples.toString()+" muestras"
                    else "FC general: sin registros de la misma fuente"
                w.exerciseType+": "+w.durationMinutes.toString()+" min"+distance+kcal+"\n"+
                    w.startAt+" → "+w.endAt+"\n"+pulse
            }
            val limited=if(result.truncated) "\n\nExisten más sesiones fuera del límite de esta prueba." else ""
            return "Sesiones detectadas SOLO en el teléfono:\n"+rows+limited+
                "\n\nNo implica que estén asociadas a un entrenamiento IBERFIT. " +
                "FC general NO es FC en reposo. No se han enviado datos a IBERFIT."
        }
    }

    suspend fun read(): ReadResult {
        val granted = client.permissionController.getGrantedPermissions()
        check(requiredPermission in granted) { "M26_HEALTH_EXERCISE_PERMISSION_REQUIRED" }
        val scopes = permissions.filterValues { it in granted }.keys.toSet()
        val clock=ZonedDateTime.now()
        val end=clock.toInstant()
        val start=dayWindow(clock.toLocalDate().minusDays((DAYS-1).toLong()),clock.zone).first
        val page=client.readRecords(
            ReadRecordsRequest(
                recordType=ExerciseSessionRecord::class,
                timeRangeFilter=TimeRangeFilter.between(start,end),
                pageSize=PAGE_SIZE,
            )
        )
        val exercises=page.records
            .filter { it.endTime.isAfter(it.startTime) && it.startTime.isBefore(end) }
            .sortedByDescending { it.endTime }
        val truncated=page.pageToken!=null||exercises.size>MAX_WORKOUTS
        val found=mutableListOf<LocalWorkout>()
        for(exercise in exercises.take(MAX_WORKOUTS)){
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
            )
        }
        return ReadResult(found,truncated,scopes)
    }
}
