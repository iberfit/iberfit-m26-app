package cl.iberfit.m26.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360ProductionOriginGateTest {
    @Test fun releaseUsesOnlyExactProductionHostAndItsOwnBridge() {
        assertEquals("https://app.iberfit.cl",Connected360OriginGate.origin(true))
        assertEquals("IBERFIT_CONNECTED360_NATIVE",Connected360OriginGate.channel(true))
        assertEquals("https://m26-canary.iberfit.cl",Connected360OriginGate.origin(false))
        assertEquals("IBERFIT_CONNECTED360_QA",Connected360OriginGate.channel(false))
        assertTrue(Connected360OriginGate.trusted(
            "https","app.iberfit.cl",-1,null,true,true))
        assertTrue(Connected360OriginGate.trusted(
            "https","app.iberfit.cl",443,null,true,true))
    }

    @Test fun releaseRejectsQAAndExternalHostsAndNavigationEscapes() {
        val blocked=listOf(
            "m26-canary.iberfit.cl", "coach.iberfit.cl",
            "evil.app.iberfit.cl", "app.iberfit.cl.attacker.tld",
            "pjhmrhejsoofmouedavw.supabase.co"
        )
        blocked.forEach {
            assertFalse(Connected360OriginGate.trusted("https",it,-1,null,true,true))
        }
        assertFalse(Connected360OriginGate.trusted(
            "http","app.iberfit.cl",-1,null,true,true))
        assertFalse(Connected360OriginGate.trusted(
            "https","app.iberfit.cl",8443,null,true,true))
        assertFalse(Connected360OriginGate.trusted(
            "https","app.iberfit.cl",-1,"attacker",true,true))
        assertFalse(Connected360OriginGate.trusted(
            "https","app.iberfit.cl",-1,null,false,true))
    }

    @Test fun QAChannelNeverTrustsReleaseOrigin() {
        assertFalse(Connected360OriginGate.trusted(
            "https","app.iberfit.cl",-1,null,true,false))
        assertTrue(Connected360OriginGate.trusted(
            "https","m26-canary.iberfit.cl",-1,null,true,false))
    }
}
