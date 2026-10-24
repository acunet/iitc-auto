package id.acunet.portalprobe

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarLocation
import androidx.car.app.model.ItemList
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

class ProbeScreen(carContext: CarContext) : Screen(carContext) {
    override fun onGetTemplate(): Template {
        val portals = ProbeData.PROBE_PORTALS

        val rows = ItemList.Builder().apply {
            portals.forEach { p ->
                // Marker di peta host berasal dari Row.setMetadata(Place),
                // bukan cuma dari daftar item-nya.
                val place = Place.Builder(CarLocation.create(p.lat, p.lng))
                    .setMarker(
                        PlaceMarker.Builder()
                            .setColor(colorFor(p.team))
                            .setLabel(p.team)
                            .build()
                    )
                    .build()

                addItem(
                    Row.Builder()
                        .setTitle(p.name)
                        .addText("L${p.level} · ${p.team} · ${p.distanceM} m")
                        .setMetadata(place)
                        .build()
                )
            }
        }.build()

        return PlaceListMapTemplate.Builder()
            .setTitle("Portal Probe")
            .setHeaderAction(Action.APP_ICON)
            .setCurrentLocationEnabled(true)
            .setAnchor(CarLocation.create(portals[0].lat, portals[0].lng))
            .setItemList(rows)
            .build()
    }
}
