package cl.iberfit.healthconnect

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId

class IberfitHealthConnectReaderTest {
    @Test fun civilDayRespectsDaylightSaving() {
        val zone = ZoneId.of("America/New_York")
        val spring = dayWindow(LocalDate.parse("2026-03-08"), zone)
        val autumn = dayWindow(LocalDate.parse("2026-11-01"), zone)
        assertEquals(Duration.ofHours(23), Duration.between(spring.first, spring.second))
        assertEquals(Duration.ofHours(25), Duration.between(autumn.first, autumn.second))
    }

    @Test fun ordinarySantiagoDayPreservesLocalBoundaries() {
        val zone = ZoneId.of("America/Santiago")
        val date = LocalDate.parse("2026-10-08")
        val window = dayWindow(date, zone)
        assertEquals(date, window.first.atZone(zone).toLocalDate())
        assertEquals(date.plusDays(1), window.second.atZone(zone).toLocalDate())
    }

    @Test fun readerExposesOnlyReadScopes() {
        assertEquals(setOf("steps", "sleepMinutes", "restingHeartRate"),
            IberfitHealthConnectReader.supportedMetrics)
        assertEquals(30, IberfitHealthConnectReader.MAX_INITIAL_DAYS)
        assertEquals("health_connect", IberfitHealthConnectReader.PROVIDER)
        assertTrue(IberfitHealthConnectReader.supportedMetrics.none { it.contains("WRITE") })
    }
}
