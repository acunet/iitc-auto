package org.exarhteam.iitc_mobile.car

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.validation.HostValidator

/**
 * Titik masuk Android Auto buat app ini (kategori POI, lihat AndroidManifest).
 *
 * Data portal bukan berasal dari sini: WebView IITC di HP yang mengirimnya lewat
 * `app.sendPortals(json)` -> [PortalBridge]. Kelas ini cuma menyajikan template ke host mobil.
 */
class IitcCarAppService : CarAppService() {

    override fun createHostValidator(): HostValidator =
        // Build ini di-sideload, jadi host apa pun diterima. Untuk rilis Play, ganti ke
        // HostValidator.ALLOW_ALL_HOSTS_VALIDATOR -> daftar host resmi Google.
        HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

    override fun onCreateSession(sessionInfo: SessionInfo): Session = PortalSession()
}

class PortalSession : Session() {
    override fun onCreateScreen(intent: Intent) = PortalMapScreen(carContext)
}
