package id.acunet.portalprobe

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProbeDataTest {

    @Test
    fun `three probe markers with different factions`() {
        val portals = ProbeData.PROBE_PORTALS
        assertEquals(3, portals.size)
        assertEquals(setOf("R", "E", "N"), portals.map { it.team }.toSet())
    }

    @Test
    fun `levels and coordinates stay within a plausible range`() {
        ProbeData.PROBE_PORTALS.forEach { p ->
            assertTrue("level ${p.level} is outside 1..8", p.level in 1..8)
            assertTrue("lat ${p.lat} is outside Jakarta", p.lat in -7.0..-5.5)
            assertTrue("lng ${p.lng} is outside Jakarta", p.lng in 106.0..107.5)
        }
    }
}
