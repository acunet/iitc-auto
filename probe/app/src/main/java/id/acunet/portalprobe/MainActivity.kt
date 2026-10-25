// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package id.acunet.portalprobe

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Exists only so the APK has a phone-side entry point (handy when debugging sideload installs). */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            TextView(this).apply {
                text = "Portal Probe — install OK.\n\n" +
                    "Open it through Android Auto in the car.\n" +
                    "If it does not show up in the AA launcher: enable Developer mode + Unknown sources " +
                    "in the Android Auto settings, then Customize launcher."
                textSize = 16f
                setPadding(48, 96, 48, 48)
            }
        )
    }
}
