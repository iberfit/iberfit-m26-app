package cl.iberfit.m26.phone

import cl.iberfit.m26.phone.Connected360GeneralHeartRateDiagnostic.DailyHeartRateRange
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360GeneralHeartRateDailyProfileTest {
    @Test fun realWorld7821SampleCountCanBeShownWithoutInventingRestingHeartRate() {
        val rows = listOf(
            DailyHeartRateRange("2026-10-10", 1000, 49, 143),
            DailyHeartRateRange("2026-10-11", 2821, 52, 176),
            DailyHeartRateRange("2026-10-12", 4000, 55, 160),
        )
        val text = Connected360GeneralHeartRateDiagnostic.dailyText(rows)
        assertTrue(text.contains("7821 mediciones de frecuencia cardíaca GENERAL"))
        assertTrue(text.contains("3 días con registros"))
        assertTrue(text.contains("2026-10-11: 2821 mediciones · FC general observada 52–176 lpm"))
        assertTrue(text.contains("NO son frecuencia cardíaca en reposo"))
        assertTrue(text.contains("No se han enviado datos a IBERFIT."))
        assertFalse(text.contains("FC en reposo:"))
    }

    @Test fun emptyLocalDataDoesNotConjureRecordedBeats() {
        val text = Connected360GeneralHeartRateDiagnostic.dailyText(emptyList())
        assertTrue(text.contains("No hay mediciones"))
    }

    @Test fun invalidOrMissingHeartRateRangeIsNotDisplayedAsValid() {
        val text = Connected360GeneralHeartRateDiagnostic.dailyText(listOf(
            DailyHeartRateRange("2026-10-11", 5, 150, 70),
            DailyHeartRateRange("2026-10-12", 2, null, null),
        ))
        assertTrue(text.contains("7 mediciones"))
        assertTrue(text.contains("rango no disponible"))
        assertFalse(text.contains("150–70 lpm"))
    }

    @Test fun daysWithoutMeasurementsAreIgnoredAndDaysSortedNewestFirst() {
        val text = Connected360GeneralHeartRateDiagnostic.dailyText(listOf(
            DailyHeartRateRange("2026-10-10", 3, 42, 108),
            DailyHeartRateRange("2026-10-11", 0, null, null),
            DailyHeartRateRange("2026-10-12", 4, 50, 141),
        ))
        assertTrue(text.contains("7 mediciones"))
        assertTrue(text.contains("2 días con registros"))
        assertFalse(text.contains("2026-10-11:"))
        assertTrue(text.indexOf("2026-10-12:") < text.indexOf("2026-10-10:"))
    }

    @Test fun aggregationScopeRemainsLocalAndStrictlySevenDays() {
        assertTrue(Connected360GeneralHeartRateDiagnostic.LOOKBACK_DAYS == 7)
        assertTrue(Connected360GeneralHeartRateDiagnostic.permission.contains("READ_HEART_RATE"))
    }
}
