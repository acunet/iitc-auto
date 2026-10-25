package org.exarhteam.iitc_mobile.car

/**
 * Model data portal yang dipakai layar Android Auto.
 * Semua kelas di file ini murni (tanpa dependency Android) supaya bisa diuji di JVM.
 */

/** Faksi portal; kode mentahnya datang dari data IITC ('R'/'E'/'M'/'N'). */
enum class Faction(val code: String) {
    RESISTANCE("R"),
    ENLIGHTENED("E"),
    MACHINA("M"),
    NEUTRAL("N"),
    UNKNOWN("?");

    companion object {
        fun fromCode(code: String?): Faction = when (code?.trim()?.uppercase()) {
            "R" -> RESISTANCE
            "E" -> ENLIGHTENED
            "M" -> MACHINA
            "N" -> NEUTRAL
            else -> UNKNOWN
        }
    }
}

data class BoundingBox(
    val south: Double,
    val west: Double,
    val north: Double,
    val east: Double,
) {
    val centerLat: Double get() = (south + north) / 2.0
    val centerLng: Double get() = (west + east) / 2.0

    fun contains(lat: Double, lng: Double): Boolean =
        lat in south..north && lng in west..east

    companion object {
        /** Terima array [south, west, north, east] dari payload; null kalau bentuknya salah. */
        fun fromArray(values: List<Double>?): BoundingBox? {
            if (values == null || values.size != 4) return null
            val (s, w, n, e) = values
            if (s > n) return null
            return BoundingBox(s, w, n, e)
        }
    }
}

data class Portal(
    val guid: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    val faction: Faction,
    val level: Int,
    val health: Int?,
)

/**
 * Satu kiriman data dari WebView IITC.
 * `receivedAtMs` = kapan app menerimanya (dipakai buat nandain data basi),
 * `capturedAtMs` = kapan IITC mengambil datanya (informasi dari payload).
 */
data class PortalSnapshot(
    val receivedAtMs: Long,
    val capturedAtMs: Long,
    val bbox: BoundingBox?,
    val portals: List<Portal>,
) {
    fun ageSeconds(nowMs: Long = System.currentTimeMillis()): Long =
        ((nowMs - receivedAtMs) / 1000L).coerceAtLeast(0L)

    fun isStale(nowMs: Long = System.currentTimeMillis()): Boolean =
        ageSeconds(nowMs) >= STALE_AFTER_SECONDS

    companion object {
        /** Setelah 2 menit tanpa kiriman baru, data dianggap basi dan ditandai di layar. */
        const val STALE_AFTER_SECONDS = 120L
    }
}
