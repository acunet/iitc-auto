// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

import android.content.Intent
import android.util.Log
import androidx.car.app.CarAppService
import androidx.car.app.Screen
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

    override fun onCreateSession(sessionInfo: SessionInfo): Session {
        // Logged on purpose: the car screen cannot be read over adb, so this line is the only proof
        // that the car's Android Auto host really opened our app (see scripts/car-test.sh).
        Log.i(TAG, "car app session opened by the host")
        return PortalSession()
    }

    companion object {
        private const val TAG = "iitc-auto-car"
    }
}

class PortalSession : Session() {
    override fun onCreateScreen(intent: Intent): Screen {
        Log.i(IitcCarAppService.TAG, "car screen created -> the host is asking for a template")
        return PortalMapScreen(carContext)
    }
}
