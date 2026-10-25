package org.exarhteam.iitc_mobile.car

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tests the bridge payload parser + portal selection logic + source validation. */
class PortalBridgeTest {

    private val validPayload = """
        {
          "v": 1,
          "ts": 1761300000000,
          "bbox": [-6.20, 106.80, -6.15, 106.85],
          "portals": [
            {"g":"guid-r","n":"Monas Selatan","lat":-6.17650,"lng":106.82710,"t":"R","l":8,"hp":87},
            {"g":"guid-e","n":"Gambir","lat":-6.17670,"lng":106.83070,"t":"E","l":6,"hp":100},
            {"g":"guid-n","n":"Istiqlal","lat":-6.17020,"lng":106.83120,"t":"N","l":1}
          ]
        }
    """.trimIndent()

    @Test
    fun `valid payload is parsed in full`() {
        val result = PortalJsonParser.parse(validPayload, receivedAtMs = 42L)
        assertTrue(result is ParseResult.Success)
        val snapshot = (result as ParseResult.Success).snapshot

        assertEquals(42L, snapshot.receivedAtMs)
        assertEquals(1761300000000L, snapshot.capturedAtMs)
        assertEquals(3, snapshot.portals.size)
        assertEquals(Faction.RESISTANCE, snapshot.portals[0].faction)
        assertEquals(Faction.ENLIGHTENED, snapshot.portals[1].faction)
        assertEquals(Faction.NEUTRAL, snapshot.portals[2].faction)
        assertEquals(8, snapshot.portals[0].level)
        assertEquals(87, snapshot.portals[0].health)
        assertNull("a portal without hp must be null", snapshot.portals[2].health)
        assertNotNull(snapshot.bbox)
        assertEquals(-6.175, snapshot.bbox!!.centerLat, 0.0001)
    }

    @Test
    fun `empty or null payload is rejected`() {
        assertTrue(PortalJsonParser.parse(null) is ParseResult.Failure)
        assertTrue(PortalJsonParser.parse("") is ParseResult.Failure)
        assertTrue(PortalJsonParser.parse("   ") is ParseResult.Failure)
    }

    @Test
    fun `malformed json is rejected without throwing an exception`() {
        val result = PortalJsonParser.parse("{ this is not json")
        assertTrue(result is ParseResult.Failure)
    }

    @Test
    fun `a different payload version is rejected`() {
        val result = PortalJsonParser.parse("""{"v":99,"portals":[]}""")
        assertTrue(result is ParseResult.Failure)
        assertTrue((result as ParseResult.Failure).reason.contains("version"))
    }

    @Test
    fun `oversized payload is rejected before parsing`() {
        val huge = "x".repeat(PortalJsonParser.MAX_PAYLOAD_CHARS + 1)
        val result = PortalJsonParser.parse(huge)
        assertTrue(result is ParseResult.Failure)
        assertTrue((result as ParseResult.Failure).reason.contains("exceeds"))
    }

    @Test
    fun `broken portals are dropped but the rest still get through`() {
        val payload = """
            {"v":1,"portals":[
              {"g":"ok","n":"Bagus","lat":-6.2,"lng":106.8,"t":"R","l":5},
              {"n":"no guid","lat":-6.2,"lng":106.8},
              {"g":"koordinat-ngawur","lat":999,"lng":999},
              {"g":"ok2","n":"Bagus 2","lat":-6.21,"lng":106.81,"t":"E","l":3}
            ]}
        """.trimIndent()
        val snapshot = (PortalJsonParser.parse(payload) as ParseResult.Success).snapshot
        assertEquals(2, snapshot.portals.size)
        assertEquals("ok", snapshot.portals[0].guid)
        assertEquals("ok2", snapshot.portals[1].guid)
    }

    @Test
    fun `levels outside 1-8 are clamped, an unknown faction becomes UNKNOWN`() {
        val payload = """{"v":1,"portals":[{"g":"a","n":"x","lat":-6.2,"lng":106.8,"t":"Z","l":42}]}"""
        val portal = (PortalJsonParser.parse(payload) as ParseResult.Success).snapshot.portals.first()
        assertEquals(8, portal.level)
        assertEquals(Faction.UNKNOWN, portal.faction)
    }

    @Test
    fun `snapshot goes stale after 120 seconds`() {
        val snapshot = PortalSnapshot(receivedAtMs = 1_000_000L, capturedAtMs = 0L, bbox = null, portals = emptyList())
        assertFalse(snapshot.isStale(nowMs = 1_000_000L + 119_000L))
        assertTrue(snapshot.isStale(nowMs = 1_000_000L + 120_000L))
    }

    @Test
    fun `ops targets are always kept even when far, the rest are the N nearest`() {
        val portals = listOf(
            portal("near-1", -6.2000, 106.8000),
            portal("near-2", -6.2010, 106.8010),
            portal("far-target", -6.9000, 106.9000),
            portal("medium", -6.2500, 106.8500),
        )
        val selected = selectPortalsForDisplay(
            portals = portals,
            targets = setOf("far-target"),
            refLat = -6.2,
            refLng = 106.8,
            maxNearby = 2,
        )
        assertEquals(listOf("far-target", "near-1", "near-2"), selected.map { it.guid })
    }

    @Test
    fun `haversine distance is plausible`() {
        // Monas to Gambir is roughly 400 m
        val meters = Geo.distanceMeters(-6.17650, 106.82710, -6.17670, 106.83070)
        assertTrue("distance is $meters m", meters in 350.0..450.0)
    }

    @Test
    fun `only intel pages are treated as trusted sources`() {
        assertTrue(PortalBridge.isTrustedSource("https://intel.ingress.com/intel?ll=-6.2,106.8"))
        assertTrue(PortalBridge.isTrustedSource("https://intel.ingress.com"))
        assertFalse(PortalBridge.isTrustedSource("https://example.com/intel.ingress.com"))
        assertFalse(PortalBridge.isTrustedSource("http://evil-ingress.com/"))
        assertFalse(PortalBridge.isTrustedSource(null))
    }

    @Test
    fun `a push from another page is rejected even when the payload is valid`() {
        PortalBridge.clear()
        val accepted = PortalBridge.accept(validPayload, "https://example.com/")
        assertFalse(accepted)
        assertNull(PortalBridge.snapshot.value)
    }

    @Test
    fun `a push from the intel map is accepted and fills the snapshot`() {
        PortalBridge.clear()
        val accepted = PortalBridge.accept(validPayload, "https://intel.ingress.com/intel")
        assertTrue(accepted)
        assertEquals(3, PortalBridge.snapshot.value?.portals?.size)
        assertNull(PortalBridge.lastRejection.value)
    }

    private fun portal(guid: String, lat: Double, lng: Double) = Portal(
        guid = guid,
        name = guid,
        lat = lat,
        lng = lng,
        faction = Faction.RESISTANCE,
        level = 8,
        health = 100,
    )
}
