package id.acunet.portalprobe

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProbeDataTest {

    @Test
    fun `tiga marker probe dengan faction berbeda`() {
        val portals = ProbeData.PROBE_PORTALS
        assertEquals(3, portals.size)
        assertEquals(setOf("R", "E", "N"), portals.map { it.team }.toSet())
    }

    @Test
    fun `level dan koordinat masuk rentang wajar`() {
        ProbeData.PROBE_PORTALS.forEach { p ->
            assertTrue("level ${p.level} di luar 1..8", p.level in 1..8)
            assertTrue("lat ${p.lat} di luar Jakarta", p.lat in -7.0..-5.5)
            assertTrue("lng ${p.lng} di luar Jakarta", p.lng in 106.0..107.5)
        }
    }
}
