package id.acunet.portalprobe

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Cuma supaya APK punya entry point di HP (gampang dicek pas debugging sideload). */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            TextView(this).apply {
                text = "Portal Probe — install OK.\n\n" +
                    "Buka lewat Android Auto di mobil.\n" +
                    "Kalau nggak muncul di launcher AA: aktifkan Developer mode + Unknown sources " +
                    "di pengaturan Android Auto, lalu Customize launcher."
                textSize = 16f
                setPadding(48, 96, 48, 48)
            }
        )
    }
}
