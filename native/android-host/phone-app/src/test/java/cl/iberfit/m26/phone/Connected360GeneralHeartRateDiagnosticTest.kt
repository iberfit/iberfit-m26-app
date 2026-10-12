package cl.iberfit.m26.phone

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360GeneralHeartRateDiagnosticTest {
    @Test fun missingGeneralHeartRateNeverFabricatesRestingHeartRate() {
        val result = Connected360GeneralHeartRateDiagnostic.resultText(null)
        assertTrue(result.contains("No hay mediciones de frecuencia cardíaca general"))
        assertTrue(result.contains("No se han enviado datos a IBERFIT"))
        assertFalse(result.contains("FC en reposo:"))
    }

    @Test fun zeroGeneralHeartRateIsMissingAndNeverAPulseValue() {
        val result = Connected360GeneralHeartRateDiagnostic.resultText(0)
        assertTrue(result.contains("No hay mediciones"))
    }

    @Test fun oneGeneralMeasurementRemainsExplicitlyNonResting() {
        val result = Connected360GeneralHeartRateDiagnostic.resultText(1)
        assertTrue(result.contains("1 medición de frecuencia cardíaca general"))
        assertTrue(result.contains("No equivale a frecuencia cardíaca EN REPOSO"))
    }

    @Test fun hundredsOfGeneralMeasurementsCannotBeMisreportedAsRestingBpm() {
        val result = Connected360GeneralHeartRateDiagnostic.resultText(520)
        assertTrue(result.contains("520 mediciones de frecuencia cardíaca general"))
        assertTrue(result.contains("No equivalen a frecuencia cardíaca EN REPOSO"))
        assertFalse(result.contains("520 lpm"))
        assertTrue(result.contains("No se han enviado datos a IBERFIT"))
    }

    @Test fun localProbeRetainsLeastPrivilegeSingleWeek() {
        assertTrue(Connected360GeneralHeartRateDiagnostic.permission.contains("READ_HEART_RATE"))
        assertTrue(Connected360GeneralHeartRateDiagnostic.LOOKBACK_DAYS == 7)
    }
}
