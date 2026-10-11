package cl.iberfit.m26.phone

/**
 * Ephemeral, one-use QA read authorization, not Health Connect OS permission.
 * Uses elapsedRealtime, never a wall-clock timestamp or a persisted grant.
 */
internal object Connected360LocalApprovalLease {
    const val MAX_AGE_MS = 120_000L

    fun isCurrent(approvedAtElapsedMs: Long?, nowElapsedMs: Long): Boolean {
        if (approvedAtElapsedMs == null || nowElapsedMs < approvedAtElapsedMs) return false
        return nowElapsedMs - approvedAtElapsedMs <= MAX_AGE_MS
    }
}
