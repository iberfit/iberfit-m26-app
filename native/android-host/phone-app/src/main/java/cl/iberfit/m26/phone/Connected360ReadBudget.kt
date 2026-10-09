package cl.iberfit.m26.phone

import kotlinx.coroutines.withTimeout

/**
 * Bounds a Health Connect operation without counting the time a person
 * spends on an Android OS permission prompt (which is a separate callback).
 *
 * JS QA times out at 30s, so the native operation needs an earlier deadline
 * to release readInFlight before the user is invited to retry.
 */
internal object Connected360ReadBudget {
    const val MAX_WAIT_MS = 20_000L

    suspend fun <T> run(
        timeoutMs: Long = MAX_WAIT_MS,
        operation: suspend () -> T,
    ): T {
        require(timeoutMs > 0L) { "Health Connect timeout must be positive" }
        return withTimeout(minOf(timeoutMs, MAX_WAIT_MS)) {
            operation()
        }
    }
}
