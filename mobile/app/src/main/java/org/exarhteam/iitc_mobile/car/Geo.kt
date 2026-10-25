package org.exarhteam.iitc_mobile.car

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/** Hitungan jarak + pemilihan portal yang ditampilkan. Murni, jadi bisa diuji di JVM. */
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
 * Portal yang tampil: semua portal target ops (apa pun jaraknya) + [maxNearby] portal terdekat
 * dari titik acuan. Dipakai supaya daftar di layar mobil tetap glance-able dan nggak kebanjiran
 * portal yang nggak relevan.
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
