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

/**
 * Layar peta portal di Android Auto (mode nyetir).
 *
 * Batasan host yang harus dipatuhi (ketemu dari error asli di emulator AAOS):
 * - row non-browsable WAJIB punya DistanceSpan,
 * - marker di peta berasal dari Row metadata -> Place,
 * - setAnchor() minta Place (bukan CarLocation),
 * - setCurrentLocationEnabled(true) menuntut izin lokasi (sudah ada di manifest IITC Mobile).
 */
class PortalMapScreen(carContext: CarContext) : Screen(carContext) {

    private val targetStore = OpsTargetStore(carContext)

    init {
        // Setiap kiriman data baru dari WebView -> gambar ulang template.
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
                text = "Belum ada data portal.\n\nBuka IITC Auto di HP, login Ingress, lalu geser peta ke area ops."
            )

        if (snapshot.portals.isEmpty()) {
            return message("IITC Auto", "Data terakhir nggak punya portal di area itu. Geser peta IITC di HP dan tunggu peta ke-load.")
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
                val title = SpannableString(portal.name)
                title.setSpan(
                    DistanceSpan.create(Distance.create(distanceM, Distance.UNIT_METERS)),
                    0,
                    title.length,
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
                )
                addItem(
                    Row.Builder()
                        .setTitle(CarText.create(title))
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
     * Titik acuan buat hitung jarak: pusat area yang dikirim IITC.
     * (Versi GPS-asli dari mobilnya bisa ditambahkan tanpa mengubah template.)
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
                    .setColor(colorFor(portal.faction))
                    .setLabel(portal.faction.code)
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

    private fun textFor(portal: Portal, isTarget: Boolean): String {
        val level = if (portal.level > 0) "L${portal.level}" else "L?"
        val health = portal.health?.let { " · HP $it%" } ?: ""
        val mark = if (isTarget) " · TARGET" else ""
        return "$level · ${portal.faction.name.lowercase()}$health$mark"
    }

    private fun titleFor(snapshot: PortalSnapshot): String =
        if (snapshot.isStale()) {
            "Portal sekitar · data ${snapshot.ageSeconds() / 60} menit lalu"
        } else {
            "Portal sekitar"
        }

    private fun message(title: String, text: String): Template =
        MessageTemplate.Builder(text)
            .setTitle(title)
            .setHeaderAction(Action.APP_ICON)
            .build()

    companion object {
        /** Host membatasi jumlah baris per halaman; 6 aman dan tetap glance-able. */
        const val MAX_ROWS = 6
        const val MAX_NEARBY = 5
    }
}
