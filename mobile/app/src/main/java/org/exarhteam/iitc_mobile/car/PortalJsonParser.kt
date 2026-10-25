package org.exarhteam.iitc_mobile.car

import org.json.JSONObject

/** Hasil parsing payload bridge. */
sealed class ParseResult {
    data class Success(val snapshot: PortalSnapshot) : ParseResult()
    data class Failure(val reason: String) : ParseResult()
}

/**
 * Parser payload dari userscript bridge (format v1, lihat spec §4):
 * { "v":1, "ts":<ms>, "bbox":[s,w,n,e], "portals":[{"g","n","lat","lng","t","l","hp"}, ...] }
 *
 * Semua gerbang validasi ada di sini supaya JSInterface tetap tipis dan parser bisa diuji
 * terpisah tanpa Android.
 */
object PortalJsonParser {

    const val SUPPORTED_VERSION = 1
    const val MAX_PAYLOAD_CHARS = 256 * 1024
    const val MAX_PORTALS = 300

    fun parse(json: String?, receivedAtMs: Long = System.currentTimeMillis()): ParseResult {
        if (json.isNullOrBlank()) return ParseResult.Failure("payload kosong")
        if (json.length > MAX_PAYLOAD_CHARS) {
            return ParseResult.Failure("payload ${json.length} char melebihi batas $MAX_PAYLOAD_CHARS")
        }
        val root = try {
            JSONObject(json)
        } catch (t: Throwable) {
            return ParseResult.Failure("JSON tidak valid: ${t.message}")
        }

        val version = root.optInt("v", -1)
        if (version != SUPPORTED_VERSION) {
            return ParseResult.Failure("versi payload $version tidak didukung (butuh $SUPPORTED_VERSION)")
        }

        val array = root.optJSONArray("portals")
            ?: return ParseResult.Failure("field 'portals' nggak ada")

        val portals = ArrayList<Portal>(minOf(array.length(), MAX_PORTALS))
        for (i in 0 until array.length()) {
            if (portals.size >= MAX_PORTALS) break
            val obj = array.optJSONObject(i) ?: continue
            parsePortal(obj)?.let(portals::add)
        }

        val bbox = root.optJSONArray("bbox")?.let { b ->
            val values = (0 until b.length()).map { b.optDouble(it, Double.NaN) }
            if (values.any { it.isNaN() }) null else BoundingBox.fromArray(values)
        }

        return ParseResult.Success(
            PortalSnapshot(
                receivedAtMs = receivedAtMs,
                capturedAtMs = root.optLong("ts", receivedAtMs),
                bbox = bbox,
                portals = portals,
            )
        )
    }

    /** Portal yang nggak punya guid atau koordinat wajar dibuang, bukan bikin seluruh payload gagal. */
    private fun parsePortal(obj: JSONObject): Portal? {
        val guid = obj.optString("g", "").ifBlank { return null }
        val lat = obj.optDouble("lat", Double.NaN)
        val lng = obj.optDouble("lng", Double.NaN)
        if (lat.isNaN() || lng.isNaN() || lat !in -90.0..90.0 || lng !in -180.0..180.0) return null

        return Portal(
            guid = guid,
            name = obj.optString("n", "(tanpa nama)"),
            lat = lat,
            lng = lng,
            faction = Faction.fromCode(obj.optString("t", "")),
            level = obj.optInt("l", 0).coerceIn(0, 8),
            health = if (obj.has("hp")) obj.optInt("hp") else null,
        )
    }
}
