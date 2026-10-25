// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

/*
 * IITC Auto — Android Auto bridge
 *
 * Injected automatically by the app once IITC has finished booting (IITC_JSInterface.injectAutoBridge),
 * so there is no need to install a plugin by hand. It can also be installed as a regular userscript
 * if you want to use it with another IITC version.
 *
 * It has exactly one job: every time IITC finishes refreshing map data, send the list of portals
 * that are ALREADY loaded in the viewport to native via `app.sendPortals(json)`.
 *
 * Why it is safe regarding intel rate limits: the data sent is exactly the data IITC already
 * fetched for the user. This bridge never requests data on its own and never moves the map.
 */
(function () {
    'use strict';

    var CONFIG = {
        version: 1,
        minIntervalMs: 15000, // at least 15 seconds between sends
        maxPortals: 300       // max number of portals per payload
    };

    if (window.__iitcAutoBridgeInstalled) return;
    window.__iitcAutoBridgeInstalled = true;

    // ---------- pure logic (unit-tested via node, see mobile/tests) ----------

    function toNumber(value) {
        var n = typeof value === 'string' ? parseFloat(value) : value;
        return typeof n === 'number' && isFinite(n) ? n : null;
    }

    function factionCode(team) {
        if (team === 0) return 'N';
        if (team === 1 || team === '1') return 'R';
        if (team === 2 || team === '2') return 'E';
        if (team === 3 || team === '3') return 'M';
        if (typeof team === 'string' && team.length) return team.toUpperCase().charAt(0);
        return 'N';
    }

    /**
     * One IITC portal -> a compact object for the app.
     * Accepts several data shapes at once (latE6/lngE6, lat/lng, or a Leaflet layer),
     * so the bridge does not break easily when IITC changes its internal shape.
     */
    function portalToPayload(guid, layer) {
        var data = (layer && layer.options && layer.options.data) || null;
        var lat = null;
        var lng = null;

        if (data) {
            if (data.latE6 !== undefined && data.lngE6 !== undefined) {
                lat = toNumber(data.latE6) / 1e6;
                lng = toNumber(data.lngE6) / 1e6;
            } else if (data.lat !== undefined && data.lng !== undefined) {
                lat = toNumber(data.lat);
                lng = toNumber(data.lng);
            }
        }
        if ((lat === null || lng === null) && layer && typeof layer.getLatLng === 'function') {
            var ll = layer.getLatLng();
            lat = toNumber(ll.lat);
            lng = toNumber(ll.lng);
        }
        if (lat === null || lng === null) return null;

        var level = toNumber(data && data.level);
        var health = toNumber(data && data.health);

        return {
            g: String(guid),
            n: (data && data.title) ? String(data.title) : '',
            lat: lat,
            lng: lng,
            t: factionCode(data && data.team),
            l: level === null ? 0 : Math.max(0, Math.min(8, Math.round(level))),
            hp: health === null ? undefined : Math.round(health)
        };
    }

    /** Pick the portals closest to the map center, capped at maxPortals. */
    function collectPortals(portalMap, centerLat, centerLng, maxPortals) {
        var entries = [];
        var keys = Object.keys(portalMap || {});
        for (var i = 0; i < keys.length; i++) {
            var p = portalToPayload(keys[i], portalMap[keys[i]]);
            if (!p) continue;
            var dLat = p.lat - centerLat;
            var dLng = p.lng - centerLng;
            p._d = dLat * dLat + dLng * dLng;
            entries.push(p);
        }
        entries.sort(function (a, b) { return a._d - b._d; });
        var limited = entries.slice(0, maxPortals);
        for (var j = 0; j < limited.length; j++) delete limited[j]._d;
        return limited;
    }

    /** Throttle + send only when the content changed. Its state is kept in this object. */
    function shouldSend(state, nowMs, payloadJson) {
        if (payloadJson === state.lastPayload) return false;
        if (state.lastSentMs !== 0 && nowMs - state.lastSentMs < CONFIG.minIntervalMs) return false;
        return true;
    }

    function buildPayload(portals, bbox, nowMs) {
        return JSON.stringify({
            v: CONFIG.version,
            ts: nowMs,
            bbox: bbox,
            portals: portals
        });
    }

    // ---------- part that runs inside IITC ----------

    var state = { lastSentMs: 0, lastPayload: null };

    function currentBbox() {
        try {
            var bounds = window.map.getBounds();
            return [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()];
        } catch (e) {
            return null;
        }
    }

    function onMapDataRefreshEnd() {
        try {
            if (typeof app === 'undefined' || !app.sendPortals) return;
            if (!window.portals) return;

            var center = window.map.getCenter();
            var portals = collectPortals(window.portals, center.lat, center.lng, CONFIG.maxPortals);
            if (!portals.length) return;

            var payload = buildPayload(portals, currentBbox(), Date.now());
            if (!shouldSend(state, Date.now(), payload)) return;

            app.sendPortals(payload);
            state.lastSentMs = Date.now();
            state.lastPayload = payload;
        } catch (e) {
            console.log('[IITC Auto bridge] failed to send portal data: ' + e);
        }
    }

    // Exposed for the node unit tests (mobile/tests) — not used by IITC.
    window.__iitcAutoBridge = {
        CONFIG: CONFIG,
        portalToPayload: portalToPayload,
        collectPortals: collectPortals,
        shouldSend: shouldSend,
        buildPayload: buildPayload,
        onMapDataRefreshEnd: onMapDataRefreshEnd,
        state: state
    };

    if (typeof window.addHook === 'function') {
        window.addHook('mapDataRefreshEnd', onMapDataRefreshEnd);
        console.log('[IITC Auto bridge] on: portal data will be sent to the car screen');
    }
})();
