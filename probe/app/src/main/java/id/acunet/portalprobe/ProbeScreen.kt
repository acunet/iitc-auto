package id.acunet.portalprobe

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarLocation
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
                addItem(
                    Row.Builder()
                        .setTitle(p.name)
                        .addText("L${p.level} · ${p.team} · ${p.distanceM} m")
                        // Marker di peta host berasal dari Metadata -> Place, bukan dari daftar itu sendiri.
                        .setMetadata(Metadata.Builder().setPlace(places[i]).build())
                        .build()
                )
            }
        }.build()

        return PlaceListMapTemplate.Builder()
            .setTitle("Portal Probe")
            .setHeaderAction(Action.APP_ICON)
            .setCurrentLocationEnabled(true)
            // Perhatian: setAnchor() minta Place (bukan CarLocation) di Car App 1.7.
            .setAnchor(places.first())
            .setItemList(rows)
            .build()
    }
}
