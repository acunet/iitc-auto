// ==UserScript==
// @id             iitc-plugin-tactical-relay
// @name           IITC plugin: Tactical Relay
// @category       Misc
// @version        0.1.1
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

  var VERSION = '0.1.1';
  var LS_KEY = 'plugin-tactical-relay-settings';
  var started = false;

  // Matched against the joined TEXT markup, padded with spaces, first match wins.
  var DEFAULT_PHRASES = {
    fracker: ['Fracker'],
    capture: [' captured '],
    deploy: [' deployed '],
    destroy: [' destroyed '],
    flip: [' flipped ', 'ADA Refactor', 'JARVIS Virus'],
    link: [' linked '],
    field: [' Control Field '],
    recharge: [' recharged '],
    upgrade: [' upgraded '],
    hack: [' hacked '],
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
      if (items.length > opts.max) items.splice(0, items.length - opts.max);
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
    var stats = { parsed: 0, queued: 0, sent: 0, failed: 0, lastError: '', lastSend: 0 };
    var seen = {}; // comm guid -> ms, pruned on every hook payload

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
      send: function (batch) {
        return sendPost('/v1/comm/batch', { events: batch }).then(function (body) {
          return body && body.inserted != null ? body.inserted : batch.length;
        });
      },
    });

    function baseUrl() {
      return String(cfg.apiBase || '').replace(/\/+$/, '');
    }

    function sendPost(path, body) {
      return fetch(baseUrl() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Ops-Token': cfg.token },
        body: JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
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

    // ------------------------------------------------------------------ UI ---

    function statusHtml() {
      var rows = [
        ['Endpoint', baseUrl() || '(empty)'],
        ['Token', cfg.token ? 'set (' + cfg.token.length + ' chars)' : 'EMPTY — never sends'],
        ['Mode', cfg.dryRun ? 'DRY-RUN' : 'LIVE'],
        ['Queued', queue.size() + ' / ' + cfg.maxQueue],
        ['Parsed', String(stats.parsed)],
        ['Sent', stats.sent + ' / failed ' + stats.failed],
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
      return { cfg: cfg, stats: stats, queue: queue.size() };
    };
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
