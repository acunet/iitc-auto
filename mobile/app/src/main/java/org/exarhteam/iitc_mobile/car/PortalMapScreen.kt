// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

import android.text.SpannableString
import android.text.Spanned
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarLocation
import androidx.car.app.model.CarText
import androidx.car.app.model.Distance
import androidx.car.app.model.DistanceSpan
import androidx.car.app.model.ItemList
import androidx.car.app.model.Metadata
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Portal map screen on Android Auto (driving mode).
 *
 * Host constraints that must be honoured (found from real errors on the AAOS emulator):
 * - a non-browsable row MUST have a DistanceSpan,
 * - markers on the map come from Row metadata -> Place,
 * - setAnchor() wants a Place (not a CarLocation),
 * - setCurrentLocationEnabled(true) requires the location permission (already present in the IITC Mobile manifest).
 */
class PortalMapScreen(carContext: CarContext) : Screen(carContext) {

    private val targetStore = OpsTargetStore(carContext)

    init {
        // Every new data push from the WebView -> redraw the template.
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onCreate(owner: LifecycleOwner) {
                lifecycleScope.launch {
                    PortalBridge.snapshot.collect { invalidate() }
                }
            }
        })
    }

    override fun onGetTemplate(): Template {
        val snapshot = PortalBridge.snapshot.value
            ?: return message(
                title = "IITC Auto",
                text = "No portal data yet.\n\nOpen IITC Auto on the phone, log into Ingress, then pan the map to the ops area."
            )

        if (snapshot.portals.isEmpty()) {
            return message("IITC Auto", "The latest data has no portals in that area. Pan the IITC map on the phone and wait for it to load.")
        }

        val targets = targetStore.targets()
        val ref = referencePoint(snapshot)
        val shown = selectPortalsForDisplay(
            portals = snapshot.portals,
            targets = targets,
            refLat = ref.first,
            refLng = ref.second,
            maxNearby = MAX_NEARBY,
        ).take(MAX_ROWS)

        val rows = ItemList.Builder().apply {
            shown.forEach { portal ->
                val distanceM = Geo.distanceMeters(ref.first, ref.second, portal.lat, portal.lng)

                // Title = portal name; the distance span lives in the subtitle, never in the title (the
                // host replaces the span with its own formatted distance and would eat the name).
                // No setImage() here: the host refuses "Rows can't have both a marker and an image",
                // and the marker is what makes the map readable — the badge rides inside it instead.
                addItem(
                    Row.Builder()
                        .setTitle(portal.name)
                        .addText(subtitleFor(portal, distanceM))
                        .apply { extraLine(portal, isTarget = portal.guid in targets)?.let { addText(it) } }
                        .setMetadata(Metadata.Builder().setPlace(toPlace(portal)).build())
                        .build()
                )
            }
        }.build()

        val anchored = shown.firstOrNull()?.let(::toPlace)

        return PlaceListMapTemplate.Builder()
            .setTitle(titleFor(snapshot))
            .setHeaderAction(Action.APP_ICON)
            .setCurrentLocationEnabled(true)
            .apply { anchored?.let { setAnchor(it) } }
            .setItemList(rows)
            .build()
    }

    /**
     * Reference point for the distance math: the center of the area sent by IITC.
     * (A real-GPS version from the car could be added without changing the template.)
     */
    private fun referencePoint(snapshot: PortalSnapshot): Pair<Double, Double> {
        val bbox = snapshot.bbox
        return if (bbox != null) bbox.centerLat to bbox.centerLng
        else snapshot.portals.first().lat to snapshot.portals.first().lng
    }

    private fun toPlace(portal: Portal): Place =
        Place.Builder(CarLocation.create(portal.lat, portal.lng))
            .setMarker(
                PlaceMarker.Builder()
                    // Colour + LABEL, never an icon: with an icon the host draws a plain white balloon
                    // and masks the bitmap to a black silhouette, so both the faction colour and the
                    // level would be lost (verified on the AAOS emulator).
                    .setColor(colorFor(portal.faction))
                    // Level inside the balloon — the number an agent actually reads. Falls back to the
                    // faction letter while IITC has not resolved the level yet.
                    .setLabel(if (portal.level > 0) portal.level.toString() else portal.faction.code)
                    .build()
            )
            .build()

    private fun colorFor(faction: Faction): CarColor = when (faction) {
        Faction.RESISTANCE -> CarColor.BLUE
        Faction.ENLIGHTENED -> CarColor.GREEN
        Faction.MACHINA -> CarColor.RED
        Faction.NEUTRAL -> CarColor.DEFAULT
        Faction.UNKNOWN -> CarColor.DEFAULT
    }

    /** "L7 RES · 95 m" — the host swaps the distance span for its own localised rendering. */
    private fun subtitleFor(portal: Portal, distanceM: Double): CarText {
        val prefix = "${portal.levelTag}${portal.faction.tag} · "
        val text = SpannableString(prefix + formatDistance(distanceM))
        text.setSpan(
            DistanceSpan.create(Distance.create(distanceM, Distance.UNIT_METERS)),
            prefix.length,
            text.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        return CarText.create(text)
    }

    /**
     * Second text line, only when there is something worth saying: neutral portals have neither HP
     * nor a target flag, so their rows stay two lines instead of three.
     */
    private fun extraLine(portal: Portal, isTarget: Boolean): String? {
        val parts = ArrayList<String>(2)
        val hp = portal.health
        if (hp != null && hp > 0 && portal.faction != Faction.NEUTRAL && portal.faction != Faction.UNKNOWN) {
            parts.add("HP $hp%")
        }
        if (isTarget) parts.add("TARGET")
        return parts.joinToString(" · ").ifEmpty { null }
    }

    private fun formatDistance(meters: Double): String =
        if (meters < 1000) "${meters.toInt()} m" else String.format(Locale.US, "%.1f km", meters / 1000)

    private fun titleFor(snapshot: PortalSnapshot): String =
        if (snapshot.isStale()) {
            "Nearby portals · data ${snapshot.ageSeconds() / 60} min old"
        } else {
            "Nearby portals"
        }

    private fun message(title: String, text: String): Template =
        MessageTemplate.Builder(text)
            .setTitle(title)
            .setHeaderAction(Action.APP_ICON)
            .build()

    companion object {
        /** The host limits the number of rows per page; 6 is safe and still glanceable. */
        const val MAX_ROWS = 6
        const val MAX_NEARBY = 5
    }
}
