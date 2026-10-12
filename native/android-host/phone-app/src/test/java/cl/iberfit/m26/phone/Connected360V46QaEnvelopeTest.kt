package cl.iberfit.m26.phone

import java.time.Instant
import java.time.ZoneId
import androidx.health.connect.client.records.ExerciseSessionRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360V46QaEnvelopeTest {
    private val zone = ZoneId.of("America/Santiago")
    private val captured = Instant.parse("2026-10-12T14:00:00Z")

    private fun workout(
        key: String? = Connected360WorkoutReadOnlyQa.opaqueRecordKey("hc-record-a"),
        sport: String = "running",
    ) = Connected360WorkoutReadOnlyQa.LocalWorkout(
        exerciseType = "Carrera",
        startAt = "2026-10-12T10:00:00Z",
        endAt = "2026-10-12T10:45:00Z",
        durationMinutes = 45,
        heartRateSamples = 120L,
        heartRateAverage = 132L,
        heartRateMin = 84L,
        heartRateMax = 174L,
        distanceKm = 7.5,
        steps = 7500L,
        caloriesKcal = 425.0,
        observationKey = key,
        sport = sport,
    )

    @Suppress("UNCHECKED_CAST")
    private fun envelope(
        daily: List<Connected360GeneralHeartRateDiagnostic.DailyHeartRateRange> = emptyList(),
        workouts: List<Connected360WorkoutReadOnlyQa.LocalWorkout> = listOf(workout()),
        now: Instant = captured,
    ): Map<String, Any> = Connected360V46QaEnvelope.build(daily, workouts, zone, now)

    @Test fun opaqueRecordKeyIsStableHexAndDoesNotRevealRawId() {
        val a = Connected360WorkoutReadOnlyQa.opaqueRecordKey("hc-record-a")
        val again = Connected360WorkoutReadOnlyQa.opaqueRecordKey("hc-record-a")
        val b = Connected360WorkoutReadOnlyQa.opaqueRecordKey("hc-record-b")
        assertTrue(a!!.matches(Regex("^[0-9a-f]{64}$")))
        assertEquals(a, again)
        assertNotEquals(a, b)
        assertFalse(a.contains("hc-record-a"))
        assertNull(Connected360WorkoutReadOnlyQa.opaqueRecordKey(""))
    }

    @Test fun sportMappingKeepsWorkoutCategoriesWithoutInferringDevice() {
        assertEquals("running", Connected360WorkoutReadOnlyQa.sport(
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL))
        assertEquals("hiit", Connected360WorkoutReadOnlyQa.sport(
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING))
        assertEquals("strength", Connected360WorkoutReadOnlyQa.sport(
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING))
    }

    @Test fun dailyCivilDayUsesLocalStartAndCurrentPartialDay() {
        val rows = listOf(
            Connected360GeneralHeartRateDiagnostic.DailyHeartRateRange(
                "2026-10-12", 7821L, 50L, 175L
            ),
            Connected360GeneralHeartRateDiagnostic.DailyHeartRateRange(
                "2026-10-11", 0L, null, null
            ),
        )
        val result = envelope(rows)
        assertEquals(Connected360V46QaEnvelope.SCHEMA, result["schema"])
        val hr = result["heartRateDaily"] as List<Map<String, Any>>
        assertEquals(1, hr.size)
        assertEquals("2026-10-12", hr[0]["date"])
        assertEquals("America/Santiago", hr[0]["aggregationTimeZone"])
        assertEquals("2026-10-12T03:00:00Z", hr[0]["windowStartedAt"])
        assertEquals(captured.toString(), hr[0]["windowEndedAt"])
        assertEquals(7821, hr[0]["sampleCount"])
        assertEquals(50, hr[0]["minBpm"])
        assertFalse(hr[0].containsKey("restingHeartRate"))
        assertFalse(hr[0].containsKey("sourceKey"))
    }

    @Test fun workoutHasCorrectV46FieldsWithoutRestingHrOrSourceIdentity() {
        val result = envelope()
        val rows = result["exerciseEvidence"] as List<Map<String, Any>>
        assertEquals(1, rows.size)
        val row = rows[0]
        assertTrue((row["observationKey"] as String).matches(Regex("^[0-9a-f]{64}$")))
        assertEquals("running", row["sport"])
        assertEquals(7500.0, row["distanceMeters"])
        assertEquals(120, row["heartRateSamples"])
        assertEquals(132, row["avgBpm"])
        assertFalse(row.containsKey("restingHeartRate"))
        assertFalse(row.containsKey("sourceUpdatedAt"))
        assertFalse(row.containsKey("sourceAppKey"))
        assertFalse(result.containsKey("clientId"))
        assertFalse(result.containsKey("token"))
    }

    @Test fun invalidOrUnverifiedActivitiesStayOutOfWriterEnvelope() {
        val old = workout(key = null)
        val future = workout().copy(
            startAt = "2026-10-13T10:00:00Z", endAt = "2026-10-13T11:00:00Z")
        val badHr = workout().copy(
            heartRateSamples = null, heartRateAverage = 132L, heartRateMin = 200L,
            heartRateMax = 80L)
        val result = envelope(workouts = listOf(old, future, badHr))
        val exercises = result["exerciseEvidence"] as List<Map<String, Any>>
        assertEquals(1, exercises.size)
        assertFalse(exercises[0].containsKey("heartRateSamples"))
        assertFalse(exercises[0].containsKey("avgBpm"))
        assertFalse(exercises[0].containsKey("minBpm"))
        assertFalse(exercises[0].containsKey("maxBpm"))
    }

    @Test fun duplicatesDoNotCauseSameTimestampConflictingWrites() {
        val result = envelope(workouts = listOf(workout(),workout()))
        assertEquals(1,(result["exerciseEvidence"] as List<*>).size)
    }
}
