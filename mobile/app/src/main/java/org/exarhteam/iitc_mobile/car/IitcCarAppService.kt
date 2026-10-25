package org.exarhteam.iitc_mobile.car

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.validation.HostValidator

/**
 * Android Auto entry point for this app (POI category, see AndroidManifest).
 *
 * Portal data does not come from here: the IITC WebView on the phone pushes it through
 * `app.sendPortals(json)` -> [PortalBridge]. This class only serves templates to the car host.
 */
class IitcCarAppService : CarAppService() {

    override fun createHostValidator(): HostValidator =
        // This build is sideloaded, so any host is accepted. For a Play release, replace
        // HostValidator.ALLOW_ALL_HOSTS_VALIDATOR with Google's official host allowlist.
        HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

    override fun onCreateSession(sessionInfo: SessionInfo): Session = PortalSession()
}

class PortalSession : Session() {
    override fun onCreateScreen(intent: Intent) = PortalMapScreen(carContext)
}
