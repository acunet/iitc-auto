// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package id.acunet.portalprobe

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.validation.HostValidator

class ProbeCarAppService : CarAppService() {
    // ALLOW_ALL_HOSTS_VALIDATOR is only acceptable for a debug build that gets sideloaded.
    override fun createHostValidator(): HostValidator =
        HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

    override fun onCreateSession(sessionInfo: SessionInfo): Session = ProbeSession()
}

class ProbeSession : Session() {
    override fun onCreateScreen(intent: Intent): Screen = ProbeScreen(carContext)
}
