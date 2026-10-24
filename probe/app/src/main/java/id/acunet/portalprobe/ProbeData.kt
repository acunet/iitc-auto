package id.acunet.portalprobe

/**
 * Data dummy buat Gate 0a (head unit mau nampilin app AA sideload atau nggak).
 * Throwaway: dibuang setelah gate lulus.
 */
data class ProbePortal(
    val name: String,
    val lat: Double,
    val lng: Double,
    val team: String, // R / E / M / N
    val level: Int,
    val distanceM: Int,
)

object ProbeData {
    // Tiga titik di sekitar Monas / Jakarta Pusat — cukup buat ngecek marker + warna faction.
    val PROBE_PORTALS = listOf(
        ProbePortal("Probe · Monas Selatan", -6.17650, 106.82710, "R", 8, 210),
        ProbePortal("Probe · Gambir Station", -6.17670, 106.83070, "E", 6, 640),
        ProbePortal("Probe · Istiqlal", -6.17020, 106.83120, "N", 1, 980),
    )
}
