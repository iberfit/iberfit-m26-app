package cl.iberfit.m26.phone

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360LocalApprovalLeaseTest {
    @Test fun exactlyTwoMinutesIsAcceptedOnce() {
        assertTrue(Connected360LocalApprovalLease.isCurrent(100L, 120_100L))
    }
    @Test fun expiredAndMissingApprovalAreRejected() {
        assertFalse(Connected360LocalApprovalLease.isCurrent(100L, 120_101L))
        assertFalse(Connected360LocalApprovalLease.isCurrent(null, 100L))
    }
    @Test fun monotonicClockResetCannotExtendAnOldApproval() {
        assertFalse(Connected360LocalApprovalLease.isCurrent(10_000L, 100L))
    }
}
