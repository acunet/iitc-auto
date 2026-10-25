// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

import android.text.SpannableString
import android.text.Spanned
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
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
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.exarhteam.iitc_mobile.R

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

                // The portal name is the TITLE (plain text) and the DistanceSpan goes on the first text row.
                // Previously the span was set on the title and the host rendered the distance as the title —
                // as a result the portal name vanished from the car screen (found while testing on the AAOS emulator).
                val distanceText = SpannableString("${distanceM.toInt()} m")
                distanceText.setSpan(
                    DistanceSpan.create(Distance.create(distanceM, Distance.UNIT_METERS)),
                    0,
                    distanceText.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )

                addItem(
                    Row.Builder()
                        .setTitle(portal.name)
                        .addText(CarText.create(distanceText))
                        .addText(textFor(portal, isTarget = portal.guid in targets))
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

    private fun toPlace(portal: Portal): Place {
        val marker = PlaceMarker.Builder().setColor(colorFor(portal.faction))
        if (portal.faction == Faction.NEUTRAL || portal.faction == Faction.UNKNOWN) {
            // Minimal marker. Without a label the host still draws a full balloon and puts the list
            // index in it, so neutral portals get the smallest marker the API offers instead: a dot.
            marker.setIcon(
                CarIcon.Builder(IconCompat.createWithResource(carContext, R.drawable.ic_portal_neutral)).build(),
                PlaceMarker.TYPE_ICON,
            )
        } else {
            // Faction portals keep the letter: colour + letter is what tells you whose area this is.
            marker.setLabel(portal.faction.code)
        }
        return Place.Builder(CarLocation.create(portal.lat, portal.lng))
            .setMarker(marker.build())
            .build()
    }

    private fun colorFor(faction: Faction): CarColor = when (faction) {
        Faction.RESISTANCE -> CarColor.BLUE
        Faction.ENLIGHTENED -> CarColor.GREEN
        Faction.MACHINA -> CarColor.RED
        Faction.NEUTRAL -> CarColor.DEFAULT
        Faction.UNKNOWN -> CarColor.DEFAULT
    }

    private fun textFor(portal: Portal, isTarget: Boolean): String {
        val level = if (portal.level > 0) "L${portal.level}" else "L?"
        // HP is only relevant for portals owned by a faction; neutral portals are always 0% and that is just noise.
        val hp = portal.health
        val health = if (hp != null && hp > 0 && portal.faction != Faction.NEUTRAL && portal.faction != Faction.UNKNOWN) {
            " · HP $hp%"
        } else {
            ""
        }
        val mark = if (isTarget) " · TARGET" else ""
        return "$level · ${portal.faction.name.lowercase()}$health$mark"
    }

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
