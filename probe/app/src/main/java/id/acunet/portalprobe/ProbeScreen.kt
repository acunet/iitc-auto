// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package id.acunet.portalprobe

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
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template

private fun colorFor(team: String): CarColor = when (team) {
    "R" -> CarColor.BLUE
    "E" -> CarColor.GREEN
    "M" -> CarColor.RED
    else -> CarColor.DEFAULT
}

private fun toPlace(portal: ProbePortal): Place =
    Place.Builder(CarLocation.create(portal.lat, portal.lng))
        .setMarker(
            PlaceMarker.Builder()
                .setColor(colorFor(portal.team))
                .setLabel(portal.team)
                .build()
        )
        .build()

class ProbeScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val portals = ProbeData.PROBE_PORTALS
        val places = portals.map(::toPlace)

        val rows = ItemList.Builder().apply {
            portals.forEachIndexed { i, p ->
                // The host rejects a non-browsable row without a distance span. The span is attached
                // through SpannableString (CarSpan is a CharacterStyle); CarText.create(CharSequence)
                // extracts it. CarText has no varargs-span overload of its own.
                val titleText = SpannableString(p.name)
                titleText.setSpan(
                    DistanceSpan.create(
                        Distance.create(p.distanceM.toDouble(), Distance.UNIT_METERS)
                    ),
                    0,
                    titleText.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                addItem(
                    Row.Builder()
                        .setTitle(CarText.create(titleText))
                        .addText("L${p.level} · ${p.team}")
                        // Markers on the host map come from Metadata -> Place, not from the list itself.
                        .setMetadata(Metadata.Builder().setPlace(places[i]).build())
                        .build()
                )
            }
        }.build()

        return PlaceListMapTemplate.Builder()
            .setTitle("Portal Probe")
            .setHeaderAction(Action.APP_ICON)
            .setCurrentLocationEnabled(true)
            // Note: in Car App 1.7 setAnchor() wants a Place (not a CarLocation).
            .setAnchor(places.first())
            .setItemList(rows)
            .build()
    }
}
