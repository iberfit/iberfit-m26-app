package cl.iberfit.m26.phone

import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class Connected360ReadBudgetTest {
    @Test fun successfulReadingReturnsNormally() = runBlocking {
        val result = Connected360ReadBudget.run(timeoutMs = 500L) {
            delay(1L)
            "read complete"
        }
        assertEquals("read complete", result)
    }

    @Test fun stalledNativeReadTimesOutAndCancels() = runBlocking {
        var reachedAfterDelay = false
        try {
            Connected360ReadBudget.run(timeoutMs = 20L) {
                delay(10_000L)
                reachedAfterDelay = true
            }
            fail("Stalled Health Connect reads must time out")
        } catch (_: TimeoutCancellationException) {
            assertFalse("Suspended native read must not continue", reachedAfterDelay)
        }
    }

    @Test fun invalidBudgetRejectedAndDefaultIsBelowWebTimeout() {
        assertTrue(Connected360ReadBudget.MAX_WAIT_MS < 30_000L)
        assertThrows(IllegalArgumentException::class.java) {
            runBlocking {
                Connected360ReadBudget.run(timeoutMs = 0L) { "invalid" }
            }
        }
    }
}
