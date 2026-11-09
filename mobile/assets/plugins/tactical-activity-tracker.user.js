// ==UserScript==
// @id             iitc-plugin-tactical-activity-tracker
// @name           IITC plugin: Tactical Activity Tracker
// @category       Misc
// @version        0.1.0
// @namespace      https://github.com/acunet/iitc-plugins-enl
// @description    Draw one agent's activity trail from the ops backend: every action the whole team's relays captured, not just what this phone happened to see.
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

// Tactical Activity Tracker — read-only map layer fed by iitc-ops-server
// (GET /v1/intel/agent/{agent}/trail).
//
// Why a server-backed tracker instead of the community player-activity-tracker: that plugin keeps its
// own three hours of COMM in the browser and parses it a second time. Trails here come from everything
// every operator's relay has captured for the retention window, parsed once by tactical-relay.
// No requests to intel.ingress.com; the only traffic is to your own backend.

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};
  var thisPlugin = (window.plugin.tacticalActivityTracker = function () {});

  var VERSION = '0.1.0';
  var LS_KEY = 'plugin-tactical-activity-tracker-settings';
  var LAYER_NAME = 'Activity Trail';
  var started = false;

  var DEFAULTS = {
    enabled: true,
    apiBase: 'https://ops.example.com',
    token: '',
    agent: '',
    days: 7,
  };

  // triangle markers for the tail of the trail, so direction is readable without hovering
  var COLOURS = {
    ENLIGHTENED: '#03dc03',
    RESISTANCE: '#0088ff',
  };

  var cfg = {};
  var layer = null;
  var stats = { points: 0, loadedAt: null, failed: 0, lastError: '', days: 0 };

  function loadSettings() {
    var stored = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}') || {};
    } catch (e) {
      stored = {};
    }
    cfg = {};
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) cfg[k] = DEFAULTS[k];
    for (var j in stored) if (stored.hasOwnProperty(j) && cfg.hasOwnProperty(j)) cfg[j] = stored[j];
  }

  function saveSettings(patchValues) {
    for (var k in patchValues) if (patchValues.hasOwnProperty(k)) cfg[k] = patchValues[k];
    window.localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }

  function apiUrl(path, query) {
    var base = String(cfg.apiBase || '').replace(/\/+$/, '');
    if (!base) return null;
    var url = base + path;
    var parts = [];
    for (var k in query) if (query.hasOwnProperty(k)) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
    return parts.length ? url + '?' + parts.join('&') : url;
  }

  function describe(row) {
    return row.action_type + ' ' + (row.portal_name || '') + ' — ' + new Date(row.recorded_at).toLocaleString();
  }

  // A trail is only a path while the gaps are small; a two-hour hole is a different trip.
  function splitIntoSegments(rows, maxGapMs) {
    var segments = [];
    var current = [];
    var previous = null;
    rows.forEach(function (row) {
      var lat = Number(row.lat);
      var lng = Number(row.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      var at = new Date(row.recorded_at).getTime();
      if (previous !== null && at - previous > maxGapMs) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
      current.push([lat, lng]);
      previous = at;
    });
    if (current.length > 1) segments.push(current);
    return segments;
  }

  function render(rows) {
    layer.clearLayers();
    if (!rows || !rows.length) return 0;

    var drawn = 0;
    var team = (rows[rows.length - 1] || {}).team;
    var colour = COLOURS[team] || '#ffff00';

    splitIntoSegments(rows, 45 * 60 * 1000).forEach(function (segment) {
      L.polyline(segment, { color: colour, weight: 2, opacity: 0.65, dashArray: '5 5' }).addTo(layer);
    });

    rows.forEach(function (row) {
      var lat = Number(row.lat);
      var lng = Number(row.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      var hostile = row.action_type === 'destroy' || row.action_type === 'neutralize';
      L.circleMarker([lat, lng], {
        radius: hostile ? 5 : 4,
        color: hostile ? '#ff5555' : colour,
        fillColor: hostile ? '#ff5555' : colour,
        fillOpacity: 0.85,
        weight: 1,
      })
        .bindPopup(describe(row))
        .addTo(layer);
      drawn++;
    });

    // direction cue: the newest point gets a bigger halo
    var last = rows[rows.length - 1];
    if (last && isFinite(Number(last.lat))) {
      L.circleMarker([Number(last.lat), Number(last.lng)], {
        radius: 12,
        color: colour,
        weight: 2,
        fill: false,
        opacity: 0.9,
      })
        .bindPopup('last seen: ' + describe(last))
        .addTo(layer);
    }
    return drawn;
  }

  function statusLine() {
    if (!stats.loadedAt) return 'not loaded';
    var ago = Math.round((Date.now() - stats.loadedAt) / 1000);
    return stats.points + ' point(s), ' + ago + 's ago' + (stats.failed ? ', ' + stats.failed + ' failed' : '');
  }

  function load() {
    if (!cfg.apiBase || !cfg.token || !cfg.agent) return Promise.resolve(false);
    var url = apiUrl('/v1/intel/agent/' + encodeURIComponent(cfg.agent) + '/trail', { days: cfg.days });
    return fetch(url, { headers: { 'X-Ops-Token': cfg.token } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (body) {
        stats.points = render(body.trail || []);
        stats.loadedAt = Date.now();
        stats.lastError = '';
        stats.days = body.days || cfg.days;
        return true;
      })
      .catch(function (err) {
        // silent by design: the map must keep working when the backend is down
        stats.failed++;
        stats.lastError = (err && err.message) || String(err);
        console.warn('tactical-activity-tracker: ' + stats.lastError);
        return false;
      });
  }

  function openConfig() {
    var html =
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">' +
      '<label>Endpoint</label><input id="tat-api" type="text" value="' + String(cfg.apiBase).replace(/"/g, '&quot;') + '">' +
      '<label>Token</label><input id="tat-token" type="password" value="' + String(cfg.token).replace(/"/g, '&quot;') + '">' +
      '<label>Agent</label><input id="tat-agent" type="text" value="' + String(cfg.agent).replace(/"/g, '&quot;') + '">' +
      '<label>Days</label><input id="tat-days" type="number" min="1" max="90" value="' + cfg.days + '">' +
      '</div>' +
      '<p style="margin-top:8px">' +
      'Trail: ' +
      statusLine() +
      (stats.lastError ? '<br><span style="color:#c00">last error: ' + stats.lastError + '</span>' : '') +
      '</p>' +
      '<p style="opacity:.7">Reads /v1/intel/agent/{agent}/trail. Needs the relay running somewhere for the ' +
      'window you ask for; an empty trail means nobody captured that agent, not that the agent was idle.</p>';

    dialog({
      id: 'tactical-activity-tracker',
      title: 'Activity Trail v' + VERSION,
      html: html,
      width: 460,
      buttons: {
        Load: function () {
          var dlg = $(this).closest('.ui-dialog');
          saveSettings({
            apiBase: $.trim($('#tat-api', dlg).val()),
            token: $.trim($('#tat-token', dlg).val()),
            agent: $.trim($('#tat-agent', dlg).val()),
            days: parseInt($('#tat-days', dlg).val(), 10) || 7,
          });
          $(this).closest('.ui-dialog').find('.ui-dialog-content').html(html);
          load().then(function () {
            $('.ui-dialog .ui-dialog-content').last().html(html);
          });
        },
        Close: function () {
          $(this).closest('.ui-dialog').dialog('close');
        },
      },
    });
  }

  thisPlugin.setup = function () {
    if (started) return;
    started = true;
    loadSettings();

    layer = L.layerGroup();
    window.addLayerGroup(LAYER_NAME, layer, false);

    if (window.IITC && IITC.toolbox) {
      IITC.toolbox.addButton({
        label: 'Trail',
        title: 'Tactical activity tracker: draw one agent\'s trail',
        action: openConfig,
      });
    }

    if (cfg.enabled && cfg.agent && cfg.token) load();

    thisPlugin.state = function () {
      return { cfg: cfg, stats: stats };
    };
    thisPlugin.load = load;
    thisPlugin.render = render;
    thisPlugin.layer = layer;
    console.log('tactical-activity-tracker: ready (v' + VERSION + ')');
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
