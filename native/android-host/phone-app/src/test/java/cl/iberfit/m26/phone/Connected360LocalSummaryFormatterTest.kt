package cl.iberfit.m26.phone

import cl.iberfit.healthconnect.IberfitHealthConnectReader.DailySummary
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360LocalSummaryFormatterTest {
    private fun row(
        day: String,
        steps: Long? = null,
        sleep: Long? = null,
        resting: Long? = null,
    ) = DailySummary(
        provider = "health_connect",
        date = day,
        steps = steps,
        sleepMinutes = sleep,
        restingHeartRate = resting,
        acquiredAt = "2026-10-11T22:00:00Z",
        aggregationTimeZone = "America/Santiago",
    )

    @Test fun olderSleepAndHeartRateAreVisibleWhenNewestDayHasStepsOnly() {
        val rows = listOf(
            row("2026-10-09", sleep = 430),
            row("2026-10-10", resting = 61),
            row("2026-10-11", steps = 2572),
        )
        val text = Connected360LocalSummaryFormatter.render(
            rows, setOf("steps", "sleepMinutes", "restingHeartRate"),
        )
        assertTrue(text.contains("Último sueño registrado: 7 h 10 min (2026-10-09)"))
        assertTrue(text.contains("Última FC en reposo registrada: 61 lpm (2026-10-10)"))
        assertTrue(text.contains("Pasos de los últimos 7 días: 2572 (1 día con registros)"))
        assertTrue(text.contains("No se han enviado datos a IBERFIT."))
    }

    @Test fun deniedMetricsNeverLookLikeMissingHealthRecords() {
        val text = Connected360LocalSummaryFormatter.render(
            listOf(row("2026-10-11", steps = 532)),
            setOf("steps"),
        )
        assertTrue(text.contains("Último sueño registrado: sin permiso de lectura"))
        assertTrue(text.contains("Última FC en reposo registrada: sin permiso de lectura"))
        assertFalse(text.contains("Último sueño registrado: sin registros accesibles"))
    }

    @Test fun authorizedButAbsentMetricsAreDistinguishedFromPermissionDenial() {
        val text = Connected360LocalSummaryFormatter.render(
            listOf(row("2026-10-11", steps = 532)),
            setOf("steps", "sleepMinutes", "restingHeartRate"),
        )
        assertTrue(text.contains("Último sueño registrado: sin registros accesibles"))
        assertTrue(text.contains("Última FC en reposo registrada: sin registros accesibles"))
    }

    @Test fun noRecordsSuggestCheckingHealthConnectWithoutClaimingSync() {
        val text = Connected360LocalSummaryFormatter.render(
            emptyList(), setOf("steps", "sleepMinutes", "restingHeartRate"),
        )
        assertTrue(text.contains("No se encontraron registros accesibles"))
        assertTrue(text.contains("Salud conectada"))
        assertTrue(text.contains("No se han enviado datos a IBERFIT"))
    }

    @Test fun actualZeroStepsCountAsRecordRatherThanAbsentData() {
        val text = Connected360LocalSummaryFormatter.render(
            listOf(row("2026-10-11", steps = 0)),
            setOf("steps"),
        )
        assertTrue(text.contains("Pasos de los últimos 7 días: 0 (1 día con registros)"))
        assertFalse(text.contains("Pasos de los últimos 7 días: sin registros"))
    }
}
