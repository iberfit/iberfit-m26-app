package cl.iberfit.healthconnect

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.util.TimeZone
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

    @Test fun liveCivilZoneIsReevaluatedBetweenSeparateReads() {
        val saved = TimeZone.getDefault()
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Kiritimati"))
            val early = dailyReadContext()
            assertEquals(ZoneId.of("Pacific/Kiritimati"), early.aggregationZone)
            assertEquals(
                Instant.parse(early.acquiredAt).atZone(early.aggregationZone).toLocalDate(),
                early.localDate
            )

            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Honolulu"))
            val later = dailyReadContext()
            assertEquals(ZoneId.of("Pacific/Honolulu"), later.aggregationZone)
            assertEquals(
                Instant.parse(later.acquiredAt).atZone(later.aggregationZone).toLocalDate(),
                later.localDate
            )
        } finally {
            TimeZone.setDefault(saved)
        }
    }

    @Test fun explicitClockRemainsDeterministicAtCrossZoneMidnight() {
        val instant = Instant.parse("2026-10-11T00:15:00Z")
        val santiago = dailyReadContext(Clock.fixed(instant, ZoneId.of("America/Santiago")))
        val kiritimati = dailyReadContext(Clock.fixed(instant, ZoneId.of("Pacific/Kiritimati")))
        assertEquals(LocalDate.parse("2026-10-10"), santiago.localDate)
        assertEquals(LocalDate.parse("2026-10-11"), kiritimati.localDate)
        assertEquals(instant.toString(), santiago.acquiredAt)
        assertEquals(instant.toString(), kiritimati.acquiredAt)
    }

    @Test fun aggregateDoesNotImpersonateSourceMeasurementTimestamp() {
        val summary = IberfitHealthConnectReader.DailySummary(
            provider = "health_connect",
            date = "2026-10-08",
            steps = 9000,
            sleepMinutes = null,
            restingHeartRate = null,
            acquiredAt = "2026-10-08T18:00:00Z",
            aggregationTimeZone = "America/Santiago"
        )
        assertEquals("2026-10-08T18:00:00Z", summary.acquiredAt)
        assertEquals("America/Santiago", summary.aggregationTimeZone)
        // Aggregated data has no verifiable per-source modification time.
        assertTrue(summary.javaClass.declaredFields.none { it.name == "sourceUpdatedAt" })
    }

    @Test fun readerExposesOnlyReadScopes() {
        assertEquals(setOf("steps", "sleepMinutes", "restingHeartRate"),
            IberfitHealthConnectReader.supportedMetrics)
        assertEquals(30, IberfitHealthConnectReader.MAX_INITIAL_DAYS)
        assertEquals("health_connect", IberfitHealthConnectReader.PROVIDER)
        assertTrue(IberfitHealthConnectReader.supportedMetrics.none { it.contains("WRITE") })
    }
}
