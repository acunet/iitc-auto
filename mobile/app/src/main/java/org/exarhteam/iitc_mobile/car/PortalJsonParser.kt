// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

import org.json.JSONObject

/** Result of parsing a bridge payload. */
sealed class ParseResult {
    data class Success(val snapshot: PortalSnapshot) : ParseResult()
    data class Failure(val reason: String) : ParseResult()
}

/**
 * Parser for payloads from the userscript bridge (format v1, see spec §4):
 * { "v":1, "ts":<ms>, "bbox":[s,w,n,e], "portals":[{"g","n","lat","lng","t","l","hp"}, ...] }
 *
 * All validation gates live here so the JSInterface stays thin and the parser can be tested
 * separately, without Android.
 */
object PortalJsonParser {

    const val SUPPORTED_VERSION = 1
    const val MAX_PAYLOAD_CHARS = 256 * 1024
    const val MAX_PORTALS = 300

    fun parse(json: String?, receivedAtMs: Long = System.currentTimeMillis()): ParseResult {
        if (json.isNullOrBlank()) return ParseResult.Failure("empty payload")
        if (json.length > MAX_PAYLOAD_CHARS) {
            return ParseResult.Failure("payload of ${json.length} chars exceeds the $MAX_PAYLOAD_CHARS limit")
        }
        val root = try {
            JSONObject(json)
        } catch (t: Throwable) {
            return ParseResult.Failure("invalid JSON: ${t.message}")
        }

        val version = root.optInt("v", -1)
        if (version != SUPPORTED_VERSION) {
            return ParseResult.Failure("payload version $version is not supported (expected $SUPPORTED_VERSION)")
        }

        val array = root.optJSONArray("portals")
            ?: return ParseResult.Failure("missing the 'portals' field")

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

    /** Portals with no guid or with nonsensical coordinates are dropped instead of failing the whole payload. */
    private fun parsePortal(obj: JSONObject): Portal? {
        val guid = obj.optString("g", "").ifBlank { return null }
        val lat = obj.optDouble("lat", Double.NaN)
        val lng = obj.optDouble("lng", Double.NaN)
        if (lat.isNaN() || lng.isNaN() || lat !in -90.0..90.0 || lng !in -180.0..180.0) return null

        return Portal(
            guid = guid,
            name = obj.optString("n", "(unnamed)"),
            lat = lat,
            lng = lng,
            faction = Faction.fromCode(obj.optString("t", "")),
            level = obj.optInt("l", 0).coerceIn(0, 8),
            health = if (obj.has("hp")) obj.optInt("hp") else null,
        )
    }
}
