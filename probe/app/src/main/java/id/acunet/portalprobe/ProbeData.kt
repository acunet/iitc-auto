// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package id.acunet.portalprobe

/**
 * Dummy data for Gate 0a (does the head unit want to show a sideloaded AA app or not).
 * Throwaway: delete once the gate has passed.
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
    // Three points around Monas / Central Jakarta — enough to check markers + faction colours.
    val PROBE_PORTALS = listOf(
        ProbePortal("Probe · Monas Selatan", -6.17650, 106.82710, "R", 8, 210),
        ProbePortal("Probe · Gambir Station", -6.17670, 106.83070, "E", 6, 640),
        ProbePortal("Probe · Istiqlal", -6.17020, 106.83120, "N", 1, 980),
    )
}
