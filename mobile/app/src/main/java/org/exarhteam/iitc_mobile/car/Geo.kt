// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Distance math + selection of the portals to display. Pure, so it can be unit tested on the JVM. */
object Geo {

    private const val EARTH_RADIUS_M = 6_371_000.0

    fun distanceMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLng = Math.toRadians(lng2 - lng1)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLng / 2).pow(2)
        return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))
    }
}

/**
 * Portals to display: every ops target portal (regardless of distance) + the [maxNearby] nearest
 * portals to the reference point. Keeps the car screen list glanceable instead of flooding it
 * with irrelevant portals.
 */
fun selectPortalsForDisplay(
    portals: List<Portal>,
    targets: Set<String>,
    refLat: Double,
    refLng: Double,
    maxNearby: Int = 12,
): List<Portal> {
    val (targetPortals, others) = portals.partition { it.guid in targets }
    val nearest = others.sortedBy { Geo.distanceMeters(refLat, refLng, it.lat, it.lng) }
    return targetPortals + nearest.take(maxNearby)
}
