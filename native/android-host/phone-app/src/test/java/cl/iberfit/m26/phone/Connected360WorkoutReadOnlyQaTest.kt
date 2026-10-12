package cl.iberfit.m26.phone

import androidx.health.connect.client.records.ExerciseSessionRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360WorkoutReadOnlyQaTest {
    @Test fun runningTreadmillHiitAndCyclingUseCorrectLabels() {
        assertEquals("Carrera", Connected360WorkoutReadOnlyQa.label(
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING))
        assertEquals("Carrera", Connected360WorkoutReadOnlyQa.label(
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL))
        assertEquals("HIIT", Connected360WorkoutReadOnlyQa.label(
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING))
        assertEquals("Ciclismo", Connected360WorkoutReadOnlyQa.label(
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING))
        assertEquals("Otro entrenamiento", Connected360WorkoutReadOnlyQa.label(
            ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT))
    }

    @Test fun aRealRunShowsObservedDistanceAndGeneralPulseButNeverRestingHeartRate() {
        val w=Connected360WorkoutReadOnlyQa.LocalWorkout(
            exerciseType="Carrera",
            startAt="2026-10-11T10:00:00Z",endAt="2026-10-11T10:50:00Z",
            durationMinutes=50,heartRateSamples=240,heartRateAverage=150,
            heartRateMin=95,heartRateMax=181,distanceKm=10.0,
            steps=8741,caloriesKcal=580.0
        )
        val text=Connected360WorkoutReadOnlyQa.render(
            Connected360WorkoutReadOnlyQa.ReadResult(listOf(w),false,setOf("exercise","heartRate"))
        )
        assertTrue(text.contains("Carrera: 50 min · 10.00 km · 580 kcal"))
        assertTrue(text.contains("150 media, 181 máxima, 240 muestras"))
        assertTrue(text.contains("FC general NO es FC en reposo"))
        assertTrue(text.contains("No se han enviado datos a IBERFIT"))
        assertFalse(text.contains("FC reposo:"))
    }

    @Test fun missingHeartRateDoesNotInventZeroOrAttributeUnrelatedSamples() {
        val w=Connected360WorkoutReadOnlyQa.LocalWorkout(
            exerciseType="HIIT",startAt="2026-10-11T11:00:00Z",
            endAt="2026-10-11T11:30:00Z",durationMinutes=30,
            heartRateSamples=null,heartRateAverage=null,heartRateMin=null,
            heartRateMax=null,distanceKm=null,steps=null,caloriesKcal=null
        )
        val text=Connected360WorkoutReadOnlyQa.render(
            Connected360WorkoutReadOnlyQa.ReadResult(listOf(w),false,setOf("exercise"))
        )
        assertTrue(text.contains("HIIT: 30 min"))
        assertTrue(text.contains("FC general: sin registros de la misma fuente"))
        assertFalse(text.contains("FC general: 0"))
    }

    @Test fun zeroSessionsExplainsProviderSyncWithoutClaimingAnIberfitSession() {
        val text=Connected360WorkoutReadOnlyQa.render(
            Connected360WorkoutReadOnlyQa.ReadResult(emptyList(),false,setOf("exercise"))
        )
        assertTrue(text.contains("Sin sesiones deportivas"))
        assertTrue(text.contains("Samsung Health"))
        assertTrue(text.contains("No se han enviado datos"))
    }

    @Test fun incompletePaginationIsExplicitNotMislabeledComplete() {
        val w=Connected360WorkoutReadOnlyQa.LocalWorkout(
            exerciseType="Caminata",startAt="2026-10-11T09:00:00Z",
            endAt="2026-10-11T09:30:00Z",durationMinutes=30,
            heartRateSamples=null,heartRateAverage=null,heartRateMin=null,heartRateMax=null,
            distanceKm=null,steps=null,caloriesKcal=null
        )
        val text=Connected360WorkoutReadOnlyQa.render(
            Connected360WorkoutReadOnlyQa.ReadResult(listOf(w),true,setOf("exercise"))
        )
        assertTrue(text.contains("más sesiones fuera del límite"))
        assertEquals(7,Connected360WorkoutReadOnlyQa.DAYS)
        assertEquals(10,Connected360WorkoutReadOnlyQa.MAX_WORKOUTS)
        assertTrue(Connected360WorkoutReadOnlyQa.requiredPermission.contains("READ_EXERCISE"))
    }
}
