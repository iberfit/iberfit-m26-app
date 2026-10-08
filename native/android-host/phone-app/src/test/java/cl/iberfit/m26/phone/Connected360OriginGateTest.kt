package cl.iberfit.m26.phone

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class Connected360OriginGateTest {
    @Test fun acceptsOnlyExactCanaryHttpsMainFrame() {
        assertTrue(Connected360OriginGate.trusted(
            "https","m26-canary.iberfit.cl",-1,null,true,
        ))
        assertTrue(Connected360OriginGate.trusted(
            "https","m26-canary.iberfit.cl",443,null,true,
        ))
    }

    @Test fun rejectsHttpSubframesOtherPortsAndOriginSpoofing() {
        val cases = listOf(
            listOf("http","m26-canary.iberfit.cl","-1","","true"),
            listOf("https","m26-canary.iberfit.cl","8443","","true"),
            listOf("https","m26-canary.iberfit.cl","-1","","false"),
            listOf("https","evil.m26-canary.iberfit.cl","-1","","true"),
            listOf("https","m26-canary.iberfit.cl.evil.com","-1","","true"),
            listOf("https","app.iberfit.cl","-1","","true"),
            listOf("https","m26-canary.iberfit.cl","-1","attacker","true"),
            listOf("file","","-1","","true"),
            listOf("content","","-1","","true"),
        )
        cases.forEach { parts ->
            assertFalse(parts.toString(), Connected360OriginGate.trusted(
                parts[0],parts[1],parts[2].toInt(),parts[3].takeIf { it.isNotEmpty() },
                parts[4].toBoolean(),
            ))
        }
    }

    @Test fun requestIdsAreShortAndStrictlyAscii() {
        assertTrue(Connected360OriginGate.requestIdAllowed("request_20261008"))
        for (invalid in listOf("", "short", "token space",
            "a".repeat(73), "../secret12", "ábcdef123", "<script>1")) {
            assertFalse(invalid,Connected360OriginGate.requestIdAllowed(invalid))
        }
    }
}
