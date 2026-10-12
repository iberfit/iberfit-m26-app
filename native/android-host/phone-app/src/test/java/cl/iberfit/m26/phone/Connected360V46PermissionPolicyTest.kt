package cl.iberfit.m26.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class Connected360V46PermissionPolicyTest {
    @Test fun acceptsOnlyKnownUniqueExplicitScopes() {
        val policy = Connected360V46PermissionPolicy
        assertEquals(setOf("generalHeartRate"),
            policy.parseScopes(listOf("generalHeartRate")))
        assertEquals(setOf("generalHeartRate", "exerciseSessions"),
            policy.parseScopes(listOf("generalHeartRate", "exerciseSessions")))
        assertNull(policy.parseScopes(null))
        assertNull(policy.parseScopes(emptyList()))
        assertNull(policy.parseScopes(listOf("generalHeartRate", "generalHeartRate")))
        assertNull(policy.parseScopes(listOf("sleepMinutes")))
        assertNull(policy.parseScopes(listOf("generalHeartRate", "exerciseSessions", "steps")))
    }

    @Test fun requestsExactlyTheOsPermissionsAssociatedWithSelectedScopes() {
        val policy = Connected360V46PermissionPolicy
        assertEquals(setOf(Connected360GeneralHeartRateDiagnostic.permission),
            policy.osPermissions(setOf("generalHeartRate")))
        assertEquals(setOf(Connected360WorkoutReadOnlyQa.requiredPermission),
            policy.osPermissions(setOf("exerciseSessions")))
        assertEquals(setOf(Connected360GeneralHeartRateDiagnostic.permission,
                Connected360WorkoutReadOnlyQa.requiredPermission),
            policy.osPermissions(setOf("generalHeartRate", "exerciseSessions")))
    }
}
