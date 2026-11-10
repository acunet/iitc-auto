// ==UserScript==
// @id             iitc-plugin-tactical-relay
// @name           IITC plugin: Tactical Relay
// @category       Misc
// @version        0.2.2
// @namespace      https://github.com/acunet/iitc-plugins-enl
// @description    Relay COMM activity to an ops backend. Sends nothing until a token is set (dry-run by default).
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

// Tactical Relay — client half of the ops platform (server: iitc-ops-server).
// Rules kept on purpose: no extra requests to intel.ingress.com (only forwards data IITC already
// fetched), no GM_xmlhttpRequest (not injected by IITC Mobile), token lives in localStorage.

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};
  var thisPlugin = (window.plugin.tacticalRelay = function () {});

  var VERSION = '0.2.2';
  var LS_KEY = 'plugin-tactical-relay-settings';
  // A stuck POST would keep the queue in flight forever and then every later event is dropped.
  var SEND_TIMEOUT_MS = 20000;
  var HEARTBEAT_MIN_MS = 60000; // a hand-edited value below this is clamped: no hammering the backend
  var started = false;

  // Matched against the joined TEXT markup, padded with spaces, first match wins.
  // Only events the intel map actually publishes. Recharging, hacking, upgrading a resonator and
  // anything about mods are never broadcast there (see the COMM notifications table on the Ingress
  // wiki), so matching on them would just add dead entries. Portal neutralization is its own line.
  var DEFAULT_PHRASES = {
    fracker: ['Fracker'],
    neutralize: [' neutralized '],
    capture: [' captured '],
    deploy: [' deployed '],
    destroy: [' destroyed '],
    flip: [' flipped ', 'ADA Refactor', 'JARVIS Virus'],
    link: [' linked '],
    field: [' Control Field '],
  };

  var DEFAULTS = {
    enabled: true,
    dryRun: true, // auto-off once apiBase + token are filled (see saveSettings)
    apiBase: 'https://ops.example.com',
    token: '',
    flushSeconds: 5, // batch window before the POST
    maxAgeSeconds: 300, // COMM history replayed on page load is older than this
    backgroundComm: true, // keep COMM polled while the chat tab is closed (mobile sits on map)
    dumpComm: false, // learn mode: log every parsed event verbatim
    maxQueue: 500,
    heartbeatMinutes: 5, // liveness ping; 0 disables it. Deliberately slow: it is a status row, not telemetry
    factions: 'any', // any | enl | res
    phrases: {},
  };

  // ---------------------------------------------------------------- core (pure, unit-tested) ---

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

  function saveSettings(cfg) {
    window.localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }

  function plextOf(item) {
    return item && item[2] && item[2].plext;
  }

  function entry(markup, type) {
    for (var i = 0; i < markup.length; i++) if (markup[i][0] === type) return markup[i][1];
    return null;
  }

  // Joined TEXT runs are matched with a space on both ends: the default phrases carry their own spaces
  // (' captured '), so trimming first would make them never match.
  function plainText(markup) {
    var out = '';
    for (var i = 0; i < markup.length; i++) {
      var m = markup[i];
      if (m && m[0] === 'TEXT' && m[1] && typeof m[1].plain === 'string') out += m[1].plain;
    }
    return out;
  }

  function classify(text, phrases) {
    var hay = ' ' + String(text || '') + ' ';
    var table = phrases || DEFAULT_PHRASES;
    for (var kind in table) {
      if (!table.hasOwnProperty(kind)) continue;
      var list = table[kind] || [];
      for (var i = 0; i < list.length; i++) if (list[i] && hay.indexOf(list[i]) !== -1) return kind;
    }
    return 'other';
  }

  function createQueue(opts) {
    var items = [];
    var timer = null;
    var inflight = false;

    function schedule() {
      if (timer || !items.length) return;
      timer = setTimeout(function () {
        timer = null;
        flush();
      }, opts.windowMs);
    }

    function push(ev) {
      items.push(ev);
      if (items.length > opts.max) {
        // the backend has been unreachable long enough to overflow the buffer: lose the oldest, but
        // say so — a silent splice is how "we relayed nothing for an hour" goes unnoticed
        opts.onDrop(items.length - opts.max);
        items.splice(0, items.length - opts.max);
      }
      schedule();
    }

    function flush() {
      if (inflight || !items.length) return;
      if (opts.dryRun()) {
        var held = items;
        items = [];
        opts.log('DRY-RUN ' + held.length + ' event(s): ' + held.map(function (e) { return e.agent_name + ' ' + e.action_type; }).join(', '));
        return;
      }
      var batch = items;
      items = [];
      inflight = true;
      opts
        .send(batch)
        .then(function (n) {
          opts.onSent(n);
        })
        .catch(function (err) {
          // bounded re-queue: telemetry may be late, never unbounded in memory
          if (items.length + batch.length <= opts.max) items = batch.concat(items);
          else opts.onDrop(batch.length); // the buffer is full: this batch is gone, count it
          opts.onError(err);
        })
        .then(function () {
          inflight = false;
          if (items.length) schedule();
        });
    }

    return {
      push: push,
      flush: flush,
      size: function () {
        return items.length;
      },
    };
  }

  // ------------------------------------------------------------------------------- setup ---

  thisPlugin.setup = function () {
    if (started) return; // bootPlugins + iitcLoaded can both fire; setup must run once
    started = true;
    var cfg = loadSettings();
    var stats = { parsed: 0, queued: 0, sent: 0, failed: 0, dropped: 0, lastBeat: 0, lastError: '', lastSend: 0 };
    var seen = {}; // comm guid -> ms, pruned on every hook payload
    var relayId = relayIdentity(); // stable per install: the id is what a status row is anchored to
    var heartbeatTimer = null;

    var queue = createQueue({
      windowMs: Math.max(1, cfg.flushSeconds) * 1000,
      max: cfg.maxQueue,
      dryRun: function () {
        return cfg.dryRun || !cfg.apiBase || !cfg.token;
      },
      log: function (msg) {
        console.log('tactical-relay: ' + msg);
        stats.lastError = '';
      },
      onSent: function (n) {
        stats.sent += n;
        stats.lastSend = Date.now();
      },
      onError: function (err) {
        stats.failed++;
        stats.lastError = String((err && err.message) || err);
        console.warn('tactical-relay: send failed — ' + stats.lastError);
      },
      onDrop: function (n) {
        // events that never reached the backend: the only number that matters when "data has holes"
        stats.dropped += n;
        stats.lastError = 'dropped ' + stats.dropped + ' event(s) — queue full while the backend was unreachable';
        console.warn('tactical-relay: ' + stats.lastError);
      },
      send: function (batch) {
        return sendPost('/v1/comm/batch', { events: batch }).then(function (body) {
          return body && body.inserted != null ? body.inserted : batch.length;
        });
      },
    });

    function baseUrl() {
      return String(cfg.apiBase || '').replace(/\/+$/, '');
    }

    function relayIdentity() {
      var key = 'plugin-tactical-relay-id';
      try {
        var saved = window.localStorage.getItem(key);
        if (saved) return saved;
        var made = 'r-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
        window.localStorage.setItem(key, made);
        return made;
      } catch (e) {
        return 'r-nostorage-' + Math.random().toString(36).slice(2, 8);
      }
    }

    // One small POST per `heartbeatMinutes`, no retry: if it fails, the next tick tries again. It
    // carries counters only — no agent names, no positions — so a lost ping costs nothing.
    function heartbeat() {
      var minutes = Number(cfg.heartbeatMinutes);
      if (!cfg.enabled || cfg.dryRun || !cfg.apiBase || !cfg.token) return Promise.resolve(false);
      if (!(minutes > 0)) return Promise.resolve(false);
      var body = {
        relay_id: relayId,
        version: VERSION,
        sent: stats.sent,
        dropped: stats.dropped,
        failed: stats.failed,
        queued: queue.size(),
      };
      return sendPost('/v1/relay/heartbeat', body)
        .then(function () {
          stats.lastBeat = Date.now();
          return true;
        })
        .catch(function (err) {
          // silent by design: a missing beat shows up as silence in the status list, not as an error
          console.warn('tactical-relay: heartbeat failed — ' + ((err && err.message) || err));
          return false;
        });
    }

    function scheduleHeartbeat() {
      var minutes = Number(cfg.heartbeatMinutes);
      if (!(minutes > 0) || heartbeatTimer) return;
      var every = Math.max(HEARTBEAT_MIN_MS, minutes * 60000);
      // no ping at boot: a reload must not look like a fresh relay, and the first beat is 5 minutes in
      heartbeatTimer = setInterval(heartbeat, every);
    }

    function sendPost(path, body) {
      // Without a timeout a stalled request keeps `inflight` true forever: the queue fills, then every
      // later event is dropped. Older WebViews have no AbortSignal.timeout, hence the try/catch.
      var signal;
      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) signal = AbortSignal.timeout(SEND_TIMEOUT_MS);
      } catch (e) {
        signal = undefined;
      }
      return fetch(baseUrl() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ops-Token': cfg.token },
        body: JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: signal,
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + path);
        return res.json().catch(function () {
          return {};
        });
      });
    }

    function prune(now) {
      var cutoff = now - cfg.maxAgeSeconds * 1000;
      for (var g in seen) if (seen.hasOwnProperty(g) && seen[g] < cutoff) delete seen[g];
    }

    function factionOk(team) {
      if (cfg.factions === 'enl') return team === 'ENLIGHTENED';
      if (cfg.factions === 'res') return team === 'RESISTANCE';
      return true;
    }

    thisPlugin.extractEvent = function (item) {
      var p = plextOf(item);
      if (!p || p.plextType !== 'SYSTEM_BROADCAST') return null;
      var markup = p.markup;
      if (!markup || !markup.length) return null;
      var player = entry(markup, 'PLAYER') || entry(markup, 'SENDER');
      if (!player || !player.plain) return null;
      var portal = entry(markup, 'PORTAL');
      var text = plainText(markup);
      var team = player.team || p.team || 'NEUTRAL';
      if (!factionOk(team)) return null;
      return {
        event_guid: String(item[0] || ''),
        agent_name: player.plain,
        team: team,
        action_type: classify(text, cfg.phrases && Object.keys(cfg.phrases).length ? mergePhrases(cfg.phrases) : DEFAULT_PHRASES),
        portal_name: portal ? portal.name || null : null,
        lat: portal && typeof portal.latE6 === 'number' ? portal.latE6 / 1e6 : null,
        lng: portal && typeof portal.lngE6 === 'number' ? portal.lngE6 / 1e6 : null,
        recorded_at: new Date(item[1]).toISOString(),
        raw_text: text.trim(),
      };
    };

    function mergePhrases(overrides) {
      var table = JSON.parse(JSON.stringify(DEFAULT_PHRASES));
      for (var k in overrides) if (overrides.hasOwnProperty(k)) table[k] = overrides[k];
      return table;
    }

    function onComm(data) {
      if (!cfg.enabled || !data || !data.result) return;
      var now = Date.now();
      prune(now);
      for (var i = 0; i < data.result.length; i++) {
        var ev = thisPlugin.extractEvent(data.result[i]);
        if (!ev) continue;
        if (now - Date.parse(ev.recorded_at) > cfg.maxAgeSeconds * 1000) continue; // replayed history
        if (seen[ev.event_guid]) continue;
        seen[ev.event_guid] = now;
        stats.parsed++;
        stats.queued++;
        if (cfg.dumpComm) console.log('tactical-relay DUMP ' + JSON.stringify(ev));
        queue.push(ev);
      }
    }

    window.addHook('publicChatDataAvailable', onComm);
    window.addHook('factionChatDataAvailable', onComm);
    window.addHook('alertsChatDataAvailable', onComm);

    // On mobile the operator sits on the map pane, so no COMM channel is polled unless asked for.
    if (cfg.backgroundComm && window.IITC && IITC.chat && IITC.chat.backgroundChannelData) {
      try {
        IITC.chat.backgroundChannelData('iitc-tactical-relay', 'all', true);
      } catch (e) {
        /* older IITC */
      }
    }

    scheduleHeartbeat(); // every heartbeatMinutes (min 60 s); heartbeatMinutes: 0 disables it

    // ------------------------------------------------------------------ UI ---

    function statusHtml() {
      var rows = [
        ['Endpoint', baseUrl() || '(empty)'],
        ['Token', cfg.token ? 'set (' + cfg.token.length + ' chars)' : 'EMPTY — never sends'],
        ['Mode', cfg.dryRun ? 'DRY-RUN' : 'LIVE'],
        ['Queued', queue.size() + ' / ' + cfg.maxQueue],
        ['Parsed', String(stats.parsed)],
        ['Sent', stats.sent + ' / failed ' + stats.failed + ' / dropped ' + stats.dropped],
        [
          'Heartbeat',
          Number(cfg.heartbeatMinutes) > 0
            ? cfg.heartbeatMinutes + 'm · ' + relayId + (stats.lastBeat ? ' · ok' : ' · not yet')
            : 'off',
        ],
        ['Last send', stats.lastSend ? new Date(stats.lastSend).toLocaleTimeString() : '—'],
        ['Last error', stats.lastError || '—'],
      ];
      var html = '<table style="width:100%">';
      for (var i = 0; i < rows.length; i++) html += '<tr><th style="text-align:left">' + rows[i][0] + '</th><td>' + esc(rows[i][1]) + '</td></tr>';
      return html + '</table>';
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
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
        '<p><b>Endpoint</b><br><input id="trl-api" style="width:100%" value="' + esc(cfg.apiBase) + '" placeholder="https://ops.example.com"></p>' +
        '<p><b>X-Ops-Token</b><br><input id="trl-token" style="width:100%" type="password" value="' + esc(cfg.token) + '"></p>' +
        '<p><b>Flush seconds</b> <input id="trl-flush" size="3" value="' + esc(cfg.flushSeconds) + '"> ' +
        '<label><input id="trl-dry" type="checkbox" ' + (cfg.dryRun ? 'checked' : '') + '> dry-run</label> ' +
        '<label><input id="trl-dump" type="checkbox" ' + (cfg.dumpComm ? 'checked' : '') + '> dump COMM</label></p>' +
        '<p style="opacity:.75">Faction filter: <select id="trl-factions">' +
        ['any', 'enl', 'res'].map(function (v) { return '<option value="' + v + '"' + (cfg.factions === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
        '</select></p>' +
        '</div>';

      dialog({
        id: 'tactical-relay-dialog',
        title: 'Tactical Relay v' + VERSION,
        html: html,
        width: width,
        buttons: {
          save: {
            text: 'Save',
            click: function () {
              var $d = $(this).closest('.ui-dialog');
              var get = function (id) { return $('#' + id, $d).val(); };
              cfg.apiBase = String(get('trl-api') || '').trim().replace(/\/+$/, '');
              cfg.token = String(get('trl-token') || '').trim();
              cfg.flushSeconds = Math.max(1, parseInt(get('trl-flush'), 10) || 5);
              cfg.dryRun = $('#trl-dry', $d).prop('checked');
              cfg.dumpComm = $('#trl-dump', $d).prop('checked');
              cfg.factions = get('trl-factions') || 'any';
              saveSettings(cfg);
              console.log('tactical-relay: settings saved (dryRun=' + cfg.dryRun + ')');
              $(this).dialog('close');
            },
          },
          flush: {
            text: 'Send now',
            click: function () {
              queue.flush();
              setTimeout(function () {
                $('.ui-dialog #tactical-relay-dialog').html(statusHtml());
              }, 800);
            },
          },
          close: { text: 'Close', click: function () { $(this).dialog('close'); } },
        },
      });
    }

    if (window.IITC && IITC.toolbox && IITC.toolbox.addButton) {
      IITC.toolbox.addButton({ id: 'tactical-relay-btn', label: 'Relay', title: 'Tactical Relay', action: openConfig });
    }
    // Mobile: the toolbox does not exist, so the drawer needs its own pane.
    // Mobile: the app's own menu is fixed, so a drawer pane is the only entry point. Picking a pane
    // runs window.show(id) -> hideall(), which hides the map: the pane itself has no view, so the
    // plugin must draw its own UI from the paneChanged hook and then hand the screen back to the map.
    if (window.IS_DEVICE_MOBILE && window.app && typeof window.app.addPane === 'function') {
      try {
        window.app.addPane('tactical-relay', 'Relay', 'notifications');
        window.addHook('paneChanged', function (id) {
          if (id !== 'tactical-relay') return;
try {
            closePluginDialogs();

            openConfig();
          } catch (e) {
            stats.lastError = 'config dialog: ' + ((e && e.message) || e);
            console.warn('tactical-relay: ' + stats.lastError);
          }
          setTimeout(function () {
            if (window.show) window.show('map');
          }, 60);
        });
      } catch (e) {
        console.warn('tactical-relay: pane registration failed — ' + ((e && e.message) || e));
      }
    }

    thisPlugin.state = function () {
      return { cfg: cfg, stats: stats, queue: queue.size(), relayId: relayId };
    };
    thisPlugin.heartbeat = heartbeat;
    thisPlugin.queue = queue;
    console.log('tactical-relay: ready (v' + VERSION + ')');
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
