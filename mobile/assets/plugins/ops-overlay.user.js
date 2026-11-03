// ==UserScript==
// @id             iitc-plugin-ops-overlay
// @name           IITC plugin: Ops Overlay
// @category       Misc
// @version        0.1.0
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

  var VERSION = '0.1.0';
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
    var stats = { fetches: 0, fail: 0, lastError: '', lastOk: 0, targets: 0, tandem: 0, activity: 0, pressure: 0, beacons: 0 };
    var markers = []; // {marker, target, name} for countdown updates
    var lastBody = null; // last good payload, so a map refresh can re-anchor without another poll
    var refreshTimer = null;

    var layer = L.layerGroup();
    window.layerChooser.addOverlay(layer, LAYER_NAME);

    function send(path) {
      return fetch(String(cfg.apiBase).replace(/\/+$/, '') + path, {
        headers: { 'X-Ops-Token': cfg.token },
        credentials: 'omit',
        cache: 'no-store',
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
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
      stats.targets = 0;
      stats.tandem = 0;
      stats.activity = 0;
      stats.pressure = 0;
      stats.beacons = 0;
      var nowMs = Date.now();

      var pressure = (body && body.pressure) || [];
      if (cfg.showPressure) {
        for (var c = 0; c < pressure.length; c++) {
          var cell = pressure[c];
          if (cell.lat == null || cell.lng == null) continue;
          L.circle([cell.lat, cell.lng], {
            radius: Math.min(600, 120 + (Number(cell.total) || 0) * 8),
            color: teamColor(cell.dominant),
            weight: 1,
            opacity: 0.7,
            fillColor: teamColor(cell.dominant),
            fillOpacity: 0.15,
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
        var query = '/v1/overlay?bbox=' + bboxOf(bounds) + '&since=' + cfg.sinceMinutes + '&min_hits=' + cfg.minHits;
        stats.fetches++;
        send(query)
          .then(function (body) {
            render(body);
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
        ['Polls', stats.fetches + ' (failed ' + stats.fail + ')'],
        ['Last ok', stats.lastOk ? new Date(stats.lastOk).toLocaleTimeString() : '—'],
        ['Last error', stats.lastError || '—'],
      ];
      var html = '<table style="width:100%">';
      for (var i = 0; i < rows.length; i++) {
        html += '<tr><th style="text-align:left">' + rows[i][0] + '</th><td>' + esc(rows[i][1]) + '</td></tr>';
      }
      return html + '</table>';
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
    if (window.app && window.app.addPane) {
      try {
        window.app.addPane('ops-overlay', 'Ops Layer', 'ic_action_layers');
        window.addHook('paneChanged', function (pane) {
          if (pane === 'ops-overlay') openConfig();
        });
      } catch (e) {
        /* desktop */
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
