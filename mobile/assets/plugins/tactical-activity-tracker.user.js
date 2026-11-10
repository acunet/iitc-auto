// ==UserScript==
// @id             iitc-plugin-tactical-activity-tracker
// @name           IITC plugin: Tactical Activity Tracker
// @category       Misc
// @version        0.4.3
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

  var VERSION = '0.4.3';
  var LS_KEY = 'plugin-tactical-activity-tracker-settings';
  var LAYER_NAME = 'Activity Trail';
  var started = false;

  var DEFAULTS = {
    enabled: true,
    apiBase: 'https://ops.example.com',
    token: '',
    agent: '',
    days: 7,
    faction: '', // '' = both; enl/res only narrows the picker, the trail itself is per agent
  };

  // Same look as player-activity-tracker: consecutive actions joined into one dashed path, faded and
  // thinned by age, one marker on the newest position instead of a dot per action.
  var PANE = 'activity-trail-pane';
  var AGE_BUCKETS = 4;
  var GAP_MS = 6 * 60 * 60 * 1000; // a night's sleep; a longer hole is a different trip
  var MAX_POPUP_EVENTS = 10;

  var COLOURS = {
    ENLIGHTENED: '#03dc03',
    RESISTANCE: '#0088ff',
  };
  var HOSTILE = { destroy: true, neutralize: true };

  var cfg = {};
  var layer = null;
  var drawnBounds = null;
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

  function agentOptions(rows) {
    var html = '<option value="">' + rows.length + ' agent(s) in relay</option>';
    rows.forEach(function (a) {
      var tag = a.team === 'ENLIGHTENED' ? 'ENL' : a.team === 'RESISTANCE' ? 'RES' : '?';
      html += '<option value="' + esc(a.agent_name) + '">' + esc(a.agent_name) + ' · ' + tag + ' · ' + (a.events || 0) + '</option>';
    });
    return html;
  }

  // Names come from the relay data (GET /v1/intel/agents), so the operator does not have to guess the
  // exact COMM spelling — a wrong name just returns an empty trail.
  function listAgents(faction) {
    cfg.faction = faction || '';
    var select = document.getElementById('tat-agent-list');
    if (!select || !cfg.apiBase || !cfg.token) return Promise.resolve(false);
    return fetch(apiUrl('/v1/intel/agents', { days: cfg.days, faction: cfg.faction }), {
      headers: { 'X-Ops-Token': cfg.token },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (body) {
        select.innerHTML = agentOptions(body.agents || []);
        return true;
      })
      .catch(function (err) {
        select.innerHTML = '<option value="">agent list failed: ' + esc(err.message) + '</option>';
        return false;
      });
  }

  function describe(row) {
    return row.action_type + ' ' + (row.portal_name || '') + ' — ' + new Date(row.recorded_at).toLocaleString();
  }

  // Portal level colours, highlights and field fills live in overlayPane (z 400) and markerPane (z 600).
  // The trail has to read on top of all of them, so it gets its own pane above that — but stays
  // click-through, because it is a line, not a control.
  function trailPane() {
    if (!window.map || typeof window.map.createPane !== 'function' || typeof window.map.getPane !== 'function') return undefined;
    if (!window.map.getPane(PANE)) {
      var pane = window.map.createPane(PANE);
      pane.style.zIndex = 650;
      pane.style.pointerEvents = 'none';
    }
    return PANE;
  }

  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function popupHtml(rows) {
    var html = '<b>' + esc(rows[rows.length - 1].agent_name || '') + '</b>';
    rows.slice(-MAX_POPUP_EVENTS).reverse().forEach(function (row) {
      html += '<div>' + esc(describe(row)) + '</div>';
    });
    return html;
  }

  // One path per run of consecutive actions; the run breaks on a colour change or a hole too big to be
  // one trip, and each path fades with age so the recent activity stands out from last week's.
  function render(rows, days) {
    layer.clearLayers();
    if (!rows || !rows.length) return 0;

    var now = Date.now();
    var pane = trailPane();
    var bucketMs = ((Number(days) || 1) * 86400000) / AGE_BUCKETS;
    var team = (rows[rows.length - 1] || {}).team;
    var colour = COLOURS[team] || '#ffff00';

    var runs = [];
    var run = null;
    var lastPoint = null;
    var lastAt = null;
    var drawn = 0;
    var bounds = L.latLngBounds([]); // the points as drawn: `layer.getBounds()` is unreliable on some renderers

    rows.forEach(function (row) {
      var lat = Number(row.lat);
      var lng = Number(row.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      var at = new Date(row.recorded_at).getTime();
      if (lastAt !== null && at - lastAt > GAP_MS) {
        run = null;
        lastPoint = null;
      }
      var age = Math.min(Math.max(Math.trunc((now - at) / bucketMs), 0), AGE_BUCKETS - 1);
      var hostile = HOSTILE[row.action_type] === true;
      var key = age + (hostile ? 'h' : '');
      if (!run || run.key !== key) {
        run = { key: key, age: age, hostile: hostile, points: lastPoint ? [lastPoint] : [] };
        runs.push(run);
      }
      run.points.push([lat, lng]);
      lastPoint = [lat, lng];
      lastAt = at;
      bounds.extend([lat, lng]);
      drawn++;
    });

    runs.forEach(function (r) {
      if (r.points.length < 2) return;
      var weight = 2 - 0.25 * r.age;
      // dark casing: the portal icons and level colours under this line would otherwise eat it
      L.polyline(r.points, { color: '#000000', weight: weight + 2.5, opacity: 0.35, pane: pane, interactive: false }).addTo(layer);
      L.polyline(r.points, {
        color: r.hostile ? '#ff5555' : colour,
        weight: weight,
        opacity: 1 - 0.2 * r.age,
        dashArray: '5,8',
        pane: pane,
        interactive: false,
      }).addTo(layer);
    });

    if (lastPoint) {
      L.circleMarker(lastPoint, {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 0.9,
      })
        .bindPopup(popupHtml(rows))
        .addTo(layer);
    }
    drawnBounds = bounds.isValid() ? bounds : null;
    return drawn;
  }

  function statusLine() {
    if (!stats.loadedAt) return 'not loaded';
    var ago = Math.round((Date.now() - stats.loadedAt) / 1000);
    return stats.points + ' point(s), ' + ago + 's ago' + (stats.failed ? ', ' + stats.failed + ' failed' : '');
  }

  function load(fit) {
    // The trail endpoint is per agent, so an empty Agent field is the one failure the operator hits
    // most: say it, instead of returning false and draining the dialog of any feedback.
    if (!cfg.agent) {
      stats.lastError = 'pick an agent first: a trail is one agent, faction only narrows the list';
      return Promise.resolve(false);
    }
    if (!cfg.apiBase || !cfg.token) return Promise.resolve(false);
    var url = apiUrl('/v1/intel/agent/' + encodeURIComponent(cfg.agent) + '/trail', { days: cfg.days });
    return fetch(url, { headers: { 'X-Ops-Token': cfg.token } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (body) {
        stats.days = body.days || cfg.days;
        stats.points = render(body.trail || [], stats.days);
        stats.loadedAt = Date.now();
        stats.lastError = '';
        // a load that draws nothing visible reads as a broken plugin: switch the layer on
        if (window.layerChooser && window.layerChooser.showLayer) window.layerChooser.showLayer(layer, true);
        // and a trail three districts away is equally useless: only a deliberate Load re-centres the map
        if (fit && drawnBounds && window.map && window.map.fitBounds) window.map.fitBounds(drawnBounds.pad(0.25));
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

  function configHtml() {
    return (
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">' +
      '<label>Endpoint</label><input id="tat-api" type="text" value="' + String(cfg.apiBase).replace(/"/g, '&quot;') + '">' +
      '<label>Token</label><input id="tat-token" type="password" value="' + String(cfg.token).replace(/"/g, '&quot;') + '">' +
      '<label>Agent</label><input id="tat-agent" type="text" value="' + String(cfg.agent).replace(/"/g, '&quot;') + '">' +
      '<label>Days</label><input id="tat-days" type="number" min="1" max="90" value="' + cfg.days + '">' +
      '<label>From relay</label><span><select id="tat-faction" title="narrows the list below, not the map" onchange="plugin.tacticalActivityTracker.listAgents(this.value)">' +
      '<option value=""' + (cfg.faction ? '' : ' selected') + '>ENL + RES</option>' +
      '<option value="enl"' + (cfg.faction === 'enl' ? ' selected' : '') + '>ENL only</option>' +
      '<option value="res"' + (cfg.faction === 'res' ? ' selected' : '') + '>RES only</option>' +
      '</select> ' +
      '<select id="tat-agent-list" ' +
      'onchange="var a=document.getElementById(\'tat-agent\'); if (this.value && a) a.value = this.value">' +
      '<option value="">…</option></select></span>' +
      '</div>' +
      '<p style="margin-top:8px">' +
      'Trail: ' +
      statusLine() +
      (stats.lastError ? '<br><span style="color:#c00">last error: ' + esc(stats.lastError) + '</span>' : '') +
      '</p>' +
      '<p style="opacity:.7">Faction narrows the <b>list</b>, it does not filter the map: a trail is always one ' +
      'agent\'s path (GET /v1/intel/agent/{agent}/trail). To see several agents at once use Ops Overlay. ' +
      'An empty trail means nobody relayed that agent, not that the agent was idle.</p>'
    );
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
    dialog({
      id: 'tactical-activity-tracker',
      title: 'Activity Trail v' + VERSION,
      html: configHtml(),
      width: 460,
      buttons: {
        Load: function () {
          var dlg = $(this).closest('.ui-dialog');
          saveSettings({
            apiBase: $.trim($('#tat-api', dlg).val()),
            token: $.trim($('#tat-token', dlg).val()),
            agent: $.trim($('#tat-agent', dlg).val()),
            days: parseInt($('#tat-days', dlg).val(), 10) || 7,
            faction: $('#tat-faction', dlg).val() || '',
          });
          load(true).then(function () {
            $('.ui-dialog .ui-dialog-content').last().html(configHtml());
            // re-rendering the html above resets the picker to "…": refill it, or the list looks
            // like it failed every time you press Load
            listAgents(cfg.faction);
          });
        },
        Close: function () {
          $(this).closest('.ui-dialog').dialog('close');
        },
      },
    });
    listAgents(cfg.faction);
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

    // Mobile: the app menu is fixed (the toolbox does not exist there), so a drawer pane is the only
    // way into the dialog. Picking a pane runs window.show(id) -> hideall(), and a custom pane has no
    // view of its own: the plugin has to draw its UI and then hand the screen back to the map.
    if (window.IS_DEVICE_MOBILE && window.app && typeof window.app.addPane === 'function') {
      try {
        window.app.addPane('activity-trail', 'Activity Trail', 'layers');
        window.addHook('paneChanged', function (id) {
          if (id !== 'activity-trail') return;
try {
            closePluginDialogs();

            openConfig();
          } catch (e) {
            stats.lastError = 'config dialog: ' + ((e && e.message) || e);
            console.warn('tactical-activity-tracker: ' + stats.lastError);
          }
          setTimeout(function () {
            if (window.show) window.show('map');
          }, 60);
        });
      } catch (e) {
        console.warn('tactical-activity-tracker: pane registration failed — ' + ((e && e.message) || e));
      }
    }

    if (cfg.enabled && cfg.agent && cfg.token) load();

    thisPlugin.state = function () {
      return { cfg: cfg, stats: stats };
    };
    thisPlugin.load = load;
    thisPlugin.listAgents = listAgents;
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
