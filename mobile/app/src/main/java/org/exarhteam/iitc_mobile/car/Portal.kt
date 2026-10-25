// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

/**
 * Portal data model used by the Android Auto screens.
 * Every class in this file is pure (no Android dependency) so it can be unit tested on the JVM.
 */

/**
 * Portal faction. [code] is the raw IITC value ('R'/'E'/'M'/'N'); [tag] is the short label the
 * car screen shows ("RES", "ENL", ...).
 */
enum class Faction(val code: String, val tag: String) {
    RESISTANCE("R", "RES"),
    ENLIGHTENED("E", "ENL"),
    MACHINA("M", "MAC"),
    NEUTRAL("N", "NEU"),
    UNKNOWN("?", "UNK");

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
        /** Accepts a [south, west, north, east] array from the payload; null if the shape is wrong. */
        fun fromArray(values: List<Double>?): BoundingBox? {
            if (values == null || values.size != 4) return null
            val (s, w, n, e) = values
            if (s > n) return null
            return BoundingBox(s, w, n, e)
        }
    }
}

/** Shown when IITC has not resolved a portal name yet, which is normal right after a map move. */
const val UNKNOWN_PORTAL_NAME = "Unknown Portal"

data class Portal(
    val guid: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    val faction: Faction,
    val level: Int,
    val health: Int?,
) {
    /** "L7 " once IITC has reported a level, empty while it has not. */
    val levelTag: String get() = if (level > 0) "L$level " else ""
}

/**
 * A single data push from the IITC WebView.
 * `receivedAtMs` = when the app received it (used to flag stale data),
 * `capturedAtMs` = when IITC captured the data (comes from the payload).
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
        /** After 2 minutes with no new push, the data is considered stale and is flagged on screen. */
        const val STALE_AFTER_SECONDS = 120L
    }
}
