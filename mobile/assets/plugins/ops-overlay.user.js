// ==UserScript==
// @id             iitc-plugin-ops-overlay
// @name           IITC plugin: Ops Overlay
// @category       Misc
// @version        0.3.3
// @namespace      https://github.com/acunet/iitc-plugins-enl
// @description    Draw what the ops backend knows onto the map: battle-beacon countdowns and portals with recent tandem (bag-account) patterns.
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

// Ops Overlay — read-only map layer fed by iitc-ops-server (GET /v1/overlay).
// No requests to intel.ingress.com; the only traffic is to your own backend. Nothing is fetched until
// an endpoint and token are configured.

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};
  var thisPlugin = (window.plugin.opsOverlay = function () {});

  var VERSION = '0.3.3';
  var LS_KEY = 'plugin-ops-overlay-settings';
  var LAYER_NAME = 'Ops Overlay';
  var started = false;

  var DEFAULTS = {
    enabled: true,
    apiBase: 'https://ops.example.com',
    token: '',
    refreshSeconds: 60,
    sinceMinutes: 60, // how far back the backend looks for beacons and tandem hits
    minHits: 3, // a single 30 s coincidence is not a badge
    showBeacons: false, // nothing reports beacons any more (tactical-relay is COMM-only)
    showTandem: true,
    showTargets: true,
    showActivity: true, // dot per portal with recent activity
    showPressure: true, // one circle per ~1.1 km cell, coloured by the dominant faction
    agents: '', // comma-separated allow-list; empty = every agent the relays ever saw
    targetColor: '#4fc3f7',
    beaconColor: '#ff5c5c',
    tandemColor: '#ffb020',
  };

  // ------------------------------------------------------------------ pure (unit-tested) ---

  function loadSettings() {
    var cfg = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      var saved = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}');
      for (var k in saved) if (saved.hasOwnProperty(k)) cfg[k] = saved[k];
    } catch (e) {
      /* corrupt storage must not break the plugin */
    }
    return cfg;
  }

  function mmss(ms) {
    if (ms == null || isNaN(ms)) return '';
    var s = Math.round(ms / 1000);
    if (s <= 0) return 'DUE';
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function bboxOf(bounds) {
    // Leaflet's getBounds() gives west/south/east/north; the API wants minLng,minLat,maxLng,maxLat.
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
      .map(function (v) {
        return Number(v).toFixed(6);
      })
      .join(',');
  }

  function labelHtml(text, color) {
    return (
      '<span style="display:inline-block;padding:1px 4px;border:1px solid ' + color + ';border-radius:3px;' +
      'background:rgba(0,0,0,.65);color:' + color + ';font:11px/1.3 sans-serif;white-space:nowrap">' + text + '</span>'
    );
  }

  var TEAM_COLORS = { ENLIGHTENED: '#4caf50', RESISTANCE: '#2196f3' };

  function teamColor(team) {
    return TEAM_COLORS[team] || '#9e9e9e';
  }

  function dotHtml(color) {
    return (
      '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + color +
      ';border:1px solid rgba(0,0,0,.7)"></span>'
    );
  }

  function ago(then, now) {
    var s = Math.round((now - then) / 1000);
    if (isNaN(s)) return '';
    if (s < 90) return s + 's ago';
    if (s < 5400) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ------------------------------------------------------------------------------- setup ---

  thisPlugin.setup = function () {
    if (started) return; // bootPlugins + iitcLoaded can both fire
    started = true;

    var cfg = loadSettings();
    var stats = { fetches: 0, fail: 0, renders: 0, skipped: 0, notModified: 0, lastError: '', lastOk: 0, targets: 0, tandem: 0, activity: 0, pressure: 0, beacons: 0, relaysAlive: 0, relaysSeen: 0 };
    var markers = []; // {marker, target, name} for countdown updates
    var lastBody = null; // last good payload, so a map refresh can re-anchor without another poll
    var lastDigest = null; // payload identity, so an unchanged poll does not rebuild every marker
    var refreshTimer = null;
    var lastEtag = '';

    var layer = L.layerGroup();
    window.layerChooser.addOverlay(layer, LAYER_NAME);

    function send(path) {
      var headers = { 'X-Ops-Token': cfg.token };
      // `cache: 'no-store'` stops the browser from revalidating on its own, so the ETag is sent by hand:
      // an unchanged poll then costs headers instead of the whole payload.
      if (lastEtag) headers['If-None-Match'] = lastEtag;
      return fetch(String(cfg.apiBase).replace(/\/+$/, '') + path, {
        headers: headers,
        credentials: 'omit',
        cache: 'no-store',
      }).then(function (res) {
        if (res.status === 304) return { notModified: true };
        if (!res.ok) throw new Error('HTTP ' + res.status);
        lastEtag = (res.headers && res.headers.get && res.headers.get('ETag')) || '';
        return res.json().then(function (body) {
          return { body: body };
        });
      });
    }

    function clear() {
      layer.clearLayers();
      markers = [];
    }

    // watch rows only carry a portal name; the map is where the coordinates live
    function portalByName() {
      var out = {};
      var portals = window.portals || {};
      for (var guid in portals) {
        if (!portals.hasOwnProperty(guid)) continue;
        var data = portals[guid] && portals[guid].options && portals[guid].options.data;
        if (data && data.title) out[data.title] = portals[guid];
      }
      return out;
    }

    function popup(lines) {
      return lines.filter(Boolean).map(esc).join('<br>');
    }

    function render(body) {
      lastBody = body;
      clear();
      // relay liveness: 15 min of silence reads as down, because a relay beats every 5 min
      var relays = (body && body.relays) || [];
      stats.relaysSeen = relays.length;
      stats.relaysAlive = relays.filter(function (r) {
        return Number(r.silent_seconds) <= 900;
      }).length;
      stats.targets = 0;
      stats.tandem = 0;
      stats.activity = 0;
      stats.pressure = 0;
      stats.beacons = 0;
      var nowMs = Date.now();

      var pressure = (body && body.pressure) || [];
      if (cfg.showPressure) {
        // Intensity is relative to the busiest cell on screen: a fixed 15% fill made every cell an
        // identical faint ring, which read as "no heat map at all".
        var maxTotal = 1;
        for (var m = 0; m < pressure.length; m++) maxTotal = Math.max(maxTotal, Number(pressure[m].total) || 0);
        for (var c = 0; c < pressure.length; c++) {
          var cell = pressure[c];
          if (cell.lat == null || cell.lng == null) continue;
          var heat = Math.min(1, Math.sqrt((Number(cell.total) || 0) / maxTotal)); // sqrt: area, not radius, tracks the count
          var radius = 150 + 900 * heat;
          var colour = teamColor(cell.dominant);
          // a soft halo under a brighter core: two overlapping fills read as a heat blob, one flat
          // circle reads as a drawn ring
          L.circle([cell.lat, cell.lng], {
            radius: radius * 1.7,
            stroke: false,
            fillColor: colour,
            fillOpacity: 0.08 + 0.22 * heat,
            interactive: false,
          }).addTo(layer);
          L.circle([cell.lat, cell.lng], {
            radius: radius,
            stroke: false,
            fillColor: colour,
            fillOpacity: 0.18 + 0.5 * heat,
            interactive: true,
          })
            .addTo(layer)
            .bindPopup(popup(['pressure: ' + (cell.dominant || 'NEUTRAL'), 'ENL ' + (cell.enl || 0) + ' · RES ' + (cell.res || 0), 'total actions ' + (cell.total || 0)]));
          stats.pressure++;
        }
      }

      var activity = (body && body.activity) || [];
      if (cfg.showActivity) {
        for (var a = 0; a < activity.length; a++) {
          var ev = activity[a];
          if (ev.lat == null || ev.lng == null) continue;
          var when = Date.parse(ev.recorded_at);
          L.marker([ev.lat, ev.lng], {
            icon: L.divIcon({ className: 'ops-overlay-dot', html: dotHtml(teamColor(ev.team)), iconSize: null }),
            interactive: true,
            keyboard: false,
          })
            .addTo(layer)
            .bindPopup(popup([ev.portal_name, String(ev.action_type || '').toUpperCase() + ' — ' + (ev.agent_name || '?'), ago(when, nowMs) + (isNaN(when) ? '' : ' · ' + new Date(when).toLocaleTimeString())]));
          stats.activity++;
        }
      }

      var targets = (body && body.targets) || [];
      if (cfg.showTargets) {
        var byName = portalByName();
        for (var t = 0; t < targets.length; t++) {
          var tgt = targets[t];
          var pm = byName[tgt.match_name];
          if (!pm) continue; // the watch name is not on screen: nothing to anchor a marker to
          var ll = pm.getLatLng();
          var tm = L.marker([ll.lat, ll.lng], {
            icon: L.divIcon({ className: 'ops-overlay-icon', html: labelHtml('◎ ' + tgt.ops_name, cfg.targetColor), iconSize: null }),
            interactive: true,
            keyboard: false,
          }).addTo(layer);
          tm.bindPopup(popup([tgt.match_name, 'ops: ' + tgt.ops_name, (tgt.action_types || []).join(', ') || 'all actions']));
          stats.targets++;
        }
      }

      var beacons = (body && body.beacons) || [];
      if (cfg.showBeacons) {
        for (var i = 0; i < beacons.length; i++) {
          var b = beacons[i];
          if (b.lat == null || b.lng == null) continue;
          var target = b.seconds_left == null ? null : Date.now() + b.seconds_left * 1000;
          var marker = L.marker([b.lat, b.lng], {
            icon: L.divIcon({ className: 'ops-overlay-icon', html: labelHtml('BB ' + (target ? mmss(target - Date.now()) : '?'), cfg.beaconColor), iconSize: null }),
            interactive: true,
            keyboard: false,
          }).addTo(layer);
          marker.bindPopup(popup([b.portal_name || b.portal_guid, b.cluster_name, b.next_checkpoint && 'checkpoint ' + b.next_checkpoint]));
          markers.push({ marker: marker, target: target });
          stats.beacons++;
        }
      }

      var tandem = (body && body.tandem_portals) || [];
      if (cfg.showTandem) {
        for (var j = 0; j < tandem.length; j++) {
          var p = tandem[j];
          if (p.lat == null || p.lng == null) continue;
          var badge = L.marker([p.lat, p.lng], {
            icon: L.divIcon({ className: 'ops-overlay-icon', html: labelHtml('⚡' + p.hits, cfg.tandemColor), iconSize: null }),
            interactive: true,
            keyboard: false,
          }).addTo(layer);
          badge.bindPopup(popup([p.portal_name, (p.pairs || []).join(', '), 'tandem hits: ' + p.hits, p.last_seen && 'last ' + p.last_seen]));
          stats.tandem++;
        }
      }
    }

    function tick() {
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (m.target == null) continue;
        m.marker.setIcon(
          L.divIcon({ className: 'ops-overlay-icon', html: labelHtml('BB ' + mmss(m.target - Date.now()), cfg.beaconColor), iconSize: null })
        );
      }
    }

    function refresh() {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (cfg.enabled && cfg.apiBase && cfg.token) {
        var bounds = window.map.getBounds();
        var query =
          '/v1/overlay?bbox=' + bboxOf(bounds) + '&since=' + cfg.sinceMinutes + '&min_hits=' + cfg.minHits +
          '&agents=' + encodeURIComponent(cfg.agents || '');
        stats.fetches++;
        send(query)
          .then(function (result) {
            if (result.notModified) {
              stats.notModified++;
              stats.lastOk = Date.now();
              stats.lastError = '';
              return;
            }
            var body = result.body;
            // Rebuilding markers is the expensive part on a phone. The backend caches its payload, so
            // an unchanged poll comes back byte-identical: skip the redraw instead of flickering.
            var digest = JSON.stringify([body.targets, body.activity, body.pressure, body.beacons, body.tandem_portals]);
            if (digest !== lastDigest) {
              render(body);
              lastDigest = digest;
              stats.renders++;
            } else {
              lastBody = body;
              stats.skipped++;
            }
            stats.lastOk = Date.now();
            stats.lastError = '';
          })
          .catch(function (err) {
            // keep the last good markers on screen: a failed poll must not blank the map
            stats.fail++;
            stats.lastError = String((err && err.message) || err);
            console.warn('ops-overlay: refresh failed — ' + stats.lastError);
          })
          .then(function () {
            refreshTimer = setTimeout(refresh, Math.max(5, cfg.refreshSeconds) * 1000);
          });
      } else {
        refreshTimer = setTimeout(refresh, 5000); // waiting for config, do not spin
      }
    }

    setInterval(tick, 1000); // the layer holds a handful of labels; one tick per second is cheap
    window.addHook('mapDataRefreshEnd', function () {
      // a map refresh usually means new portals: re-anchor the target markers from the payload we
      // already have instead of spending another request
      if (lastBody) render(lastBody);
      else if (cfg.enabled && cfg.token) refresh();
    });
    refresh();

    // ------------------------------------------------------------------ UI ---

    function statusHtml() {
      var rows = [
        ['Endpoint', cfg.apiBase || '(empty)'],
        ['Token', cfg.token ? 'set' : 'EMPTY — nothing is fetched'],
        ['Layer', LAYER_NAME],
        ['Markers', stats.targets + ' target / ' + stats.tandem + ' tandem / ' + stats.activity + ' dot / ' + stats.pressure + ' cell / ' + stats.beacons + ' beacon'],
        ['Agents', cfg.agents ? cfg.agents : 'all (no filter)'],
        [
          'Relays',
          stats.relaysSeen
            ? stats.relaysAlive + ' alive / ' + stats.relaysSeen + ' in 30m' +
              (stats.relaysAlive < stats.relaysSeen ? ' — a silent relay means holes in the data' : '')
            : 'no heartbeat yet (needs relay 0.2.0+)',
        ],
        ['Polls', stats.fetches + ' (failed ' + stats.fail + ', 304 x' + stats.notModified + ')'],
        ['Last ok', stats.lastOk ? new Date(stats.lastOk).toLocaleTimeString() : '—'],
        ['Last error', stats.lastError || '—'],
      ];
      var html = '<table style="width:100%">';
      for (var i = 0; i < rows.length; i++) {
        html += '<tr><th style="text-align:left">' + rows[i][0] + '</th><td>' + esc(rows[i][1]) + '</td></tr>';
      }
      return html + '</table>';
    }

  // A pane switch replaces the whole screen, but a jQuery UI dialog is not tied to a pane: without
  // this the previous plugin's config stays on top and the new pane looks empty/ignored.
  function closePluginDialogs() {
    if (typeof $ !== 'function') return;
    var open = $('.ui-dialog-content');
    if (!open || !open.length) return;
    open.each(function () {
      if ($(this).data('ui-dialog')) $(this).dialog('close');
    });
  }

    function openConfig() {
      var width = window.IS_DEVICE_MOBILE ? 360 : 480;
      var html =
        '<div style="max-width:' + width + 'px">' +
        statusHtml() +
        '<p><b>Endpoint</b><br><input id="opl-api" style="width:100%" value="' + esc(cfg.apiBase) + '"></p>' +
        '<p><b>X-Ops-Token</b><br><input id="opl-token" style="width:100%" type="password" value="' + esc(cfg.token) + '"></p>' +
        '<p><b>Refresh seconds</b> <input id="opl-refresh" size="3" value="' + esc(cfg.refreshSeconds) + '"> ' +
        '<b>Lookback min</b> <input id="opl-since" size="3" value="' + esc(cfg.sinceMinutes) + '"> ' +
        '<b>Min hits</b> <input id="opl-hits" size="2" value="' + esc(cfg.minHits) + '"></p>' +
        '<p><label><input id="opl-targets" type="checkbox" ' + (cfg.showTargets ? 'checked' : '') + '> ops targets</label> ' +
        '<label><input id="opl-activity" type="checkbox" ' + (cfg.showActivity ? 'checked' : '') + '> activity dots</label> ' +
        '<label><input id="opl-pressure" type="checkbox" ' + (cfg.showPressure ? 'checked' : '') + '> pressure cells</label> ' +
        '<label><input id="opl-beacons" type="checkbox" ' + (cfg.showBeacons ? 'checked' : '') + '> beacon countdown</label> ' +
        '<label><input id="opl-tandem" type="checkbox" ' + (cfg.showTandem ? 'checked' : '') + '> tandem badges</label></p>' +
        '<p><b>Only these agents</b><br><input id="opl-agents" style="width:100%" value="' + esc(cfg.agents || '') +
        '" placeholder="Acunet, Foo — empty = every agent"><br>' +
        '<span style="opacity:.7">Filters activity dots and pressure cells on the backend. ' +
        'Clear it to see the whole city again.</span></p>' +
        '<p style="opacity:.7">Read-only: this plugin draws backend intel, it never reports anything.</p>' +
        '</div>';

      dialog({
        id: 'ops-overlay-dialog',
        title: 'Ops Overlay v' + VERSION,
        html: html,
        width: width,
        buttons: {
          save: {
            text: 'Save',
            click: function () {
              var $d = $(this).closest('.ui-dialog');
              var get = function (id) {
                return $('#' + id, $d).val();
              };
              cfg.apiBase = String(get('opl-api') || '').trim().replace(/\/+$/, '');
              cfg.token = String(get('opl-token') || '').trim();
              cfg.refreshSeconds = Math.max(5, parseInt(get('opl-refresh'), 10) || 60);
              cfg.sinceMinutes = Math.max(1, parseInt(get('opl-since'), 10) || 60);
              cfg.minHits = Math.max(1, parseInt(get('opl-hits'), 10) || 3);
              // names are comma separated; strip spaces so a paste of "A, B" works
              cfg.agents = String(get('opl-agents') || '')
                .split(/[,\s]+/)
                .filter(Boolean)
                .join(', ');
              cfg.showTargets = $('#opl-targets', $d).prop('checked');
              cfg.showActivity = $('#opl-activity', $d).prop('checked');
              cfg.showPressure = $('#opl-pressure', $d).prop('checked');
              cfg.showBeacons = $('#opl-beacons', $d).prop('checked');
              cfg.showTandem = $('#opl-tandem', $d).prop('checked');
              window.localStorage.setItem(LS_KEY, JSON.stringify(cfg));
              refresh();
              $(this).dialog('close');
            },
          },
          now: {
            text: 'Refresh now',
            click: function () {
              refresh();
            },
          },
          close: { text: 'Close', click: function () { $(this).dialog('close'); } },
        },
      });
    }

    if (window.IITC && window.IITC.toolbox && window.IITC.toolbox.addButton) {
      IITC.toolbox.addButton({ id: 'ops-overlay-btn', label: 'Ops Layer', title: LAYER_NAME, action: openConfig });
    }
    // Mobile: the app's own menu is fixed, so a drawer pane is the only entry point. Picking a pane
    // runs window.show(id) -> hideall(), which hides the map: the pane itself has no view, so the
    // plugin must draw its own UI from the paneChanged hook and then hand the screen back to the map.
    if (window.IS_DEVICE_MOBILE && window.app && typeof window.app.addPane === 'function') {
      try {
        window.app.addPane('ops-overlay', 'Ops Layer', 'layers');
        window.addHook('paneChanged', function (id) {
          if (id !== 'ops-overlay') return;
          try {
            closePluginDialogs();
            openConfig();
          } catch (e) {
            stats.lastError = 'config dialog: ' + ((e && e.message) || e);
            console.warn('ops-overlay: ' + stats.lastError);
          }
          setTimeout(function () {
            if (window.show) window.show('map');
          }, 60);
        });
      } catch (e) {
        console.warn('ops-overlay: pane registration failed — ' + ((e && e.message) || e));
      }
    }

    thisPlugin.state = function () {
      return { cfg: cfg, stats: stats, markers: markers.length };
    };
    thisPlugin.refresh = refresh;
    thisPlugin.render = render;
    thisPlugin.layer = layer;
    console.log('ops-overlay: ready (v' + VERSION + ')');
  };

  var setup = thisPlugin.setup;
  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

// bootstrap: inject the wrapper into the page context (standard IITC plugin pattern)
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
