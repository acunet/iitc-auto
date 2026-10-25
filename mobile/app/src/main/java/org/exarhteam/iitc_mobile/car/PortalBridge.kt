// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

package org.exarhteam.iitc_mobile.car

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Meeting point between the phone side (IITC WebView) and the car side (CarAppService).
 *
 * The flow is in-process and never goes through a file/IPC: the userscript inside the WebView calls
 * `app.sendPortals(json)` -> IITC_JSInterface -> [accept] -> StateFlow -> car screen.
 * Since it is all one process, no storage permission is needed and no extra request is made
 * to intel.ingress.com.
 */
object PortalBridge {

    private val _snapshot = MutableStateFlow<PortalSnapshot?>(null)

    /** Last valid push; null = no data at all yet. */
    val snapshot: StateFlow<PortalSnapshot?> = _snapshot.asStateFlow()

    /**
     * Current WebView page URL, cached from the UI thread (IITC_WebViewClient.onPageFinished).
     * Deliberately stored instead of read from the WebView when the bridge is called: WebView APIs
     * must not be called from the JS bridge thread (deadlock).
     */
    @Volatile
    private var currentUrl: String? = null

    fun setCurrentUrl(url: String?) {
        currentUrl = url
    }

    fun getCurrentUrl(): String? = currentUrl

    private val _lastRejection = MutableStateFlow<String?>(null)

    /** Reason for the last rejection (for debugging / on-screen status). */
    val lastRejection: StateFlow<String?> = _lastRejection.asStateFlow()

    /**
     * Called from the WebView. Rejected (returns false) when the payload is invalid or comes from
     * a page that is not the intel map.
     */
    fun accept(json: String?, sourceUrl: String?): Boolean {
        if (!isTrustedSource(sourceUrl)) {
            _lastRejection.value = "rejected: source is not intel.ingress.com (${sourceUrl ?: "null"})"
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

    private val _targetsRevision = MutableStateFlow(0)

    /**
     * Bumped when the ops-target list changes from outside the car screen (the agent taps the target
     * button on the phone). No new portal data arrives in that case, so the snapshot flow would not
     * fire and an open car screen would keep showing the old list.
     */
    val targetsRevision: StateFlow<Int> = _targetsRevision.asStateFlow()

    fun notifyTargetsChanged() {
        _targetsRevision.value += 1
    }

    /**
     * Only intel map pages may push data. The host match must be exactly "ingress.com" or one of
     * its subdomains — "evil-ingress.com" also ends with "ingress.com", and that kind of lax
     * matching is what lets a bridge be abused.
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
