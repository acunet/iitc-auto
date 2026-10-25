package org.exarhteam.iitc_mobile.car

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Titik temu sisi HP (WebView IITC) dan sisi mobil (CarAppService).
 *
 * Alirannya in-process dan nggak lewat file/IPC: userscript di dalam WebView memanggil
 * `app.sendPortals(json)` -> IITC_JSInterface -> [accept] -> StateFlow -> layar mobil.
 * Karena semuanya satu proses, nggak ada izin storage yang dibutuhkan dan nggak ada
 * request tambahan ke intel.ingress.com.
 */
object PortalBridge {

    private val _snapshot = MutableStateFlow<PortalSnapshot?>(null)

    /** Kiriman terakhir yang valid; null = belum ada data sama sekali. */
    val snapshot: StateFlow<PortalSnapshot?> = _snapshot.asStateFlow()

    /**
     * URL halaman WebView saat ini, di-cache dari UI thread (IITC_WebViewClient.onPageFinished).
     * Sengaja disimpan, bukan dibaca dari WebView saat bridge dipanggil: WebView API tidak boleh
     * dipanggil dari thread JS bridge (deadlock).
     */
    @Volatile
    private var currentUrl: String? = null

    fun setCurrentUrl(url: String?) {
        currentUrl = url
    }

    fun getCurrentUrl(): String? = currentUrl

    private val _lastRejection = MutableStateFlow<String?>(null)

    /** Alasan penolakan terakhir (buat debug/status di layar). */
    val lastRejection: StateFlow<String?> = _lastRejection.asStateFlow()

    /**
     * Dipanggil dari WebView. Ditolak (return false) kalau payload nggak valid / datang dari
     * halaman yang bukan intel map.
     */
    fun accept(json: String?, sourceUrl: String?): Boolean {
        if (!isTrustedSource(sourceUrl)) {
            _lastRejection.value = "ditolak: sumber bukan intel.ingress.com (${sourceUrl ?: "null"})"
            return false
        }
        return when (val result = PortalJsonParser.parse(json)) {
            is ParseResult.Success -> {
                _snapshot.value = result.snapshot
                _lastRejection.value = null
                true
            }
            is ParseResult.Failure -> {
                _lastRejection.value = result.reason
                false
            }
        }
    }

    fun clear() {
        _snapshot.value = null
    }

    /**
     * hanya halaman intel map yang boleh mengirim data. Pencocokan host harus persis
     * "ingress.com" atau subdomainnya — "evil-ingress.com" juga berakhiran "ingress.com"
     * dan itu jenis kelonggaran yang bikin bridge bisa disalahgunakan.
     */
    fun isTrustedSource(url: String?): Boolean {
        val host = url
            ?.substringAfter("://", "")
            ?.substringBefore('/')
            ?.substringBefore(':')
            ?.lowercase()
            ?.removePrefix("www.")
            ?: return false
        return host == "ingress.com" || host.endsWith(".ingress.com")
    }
}
