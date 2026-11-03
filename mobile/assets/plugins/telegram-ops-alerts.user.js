// ==UserScript==
// @id             iitc-plugin-telegram-ops-alerts
// @name           IITC plugin: Telegram Ops Alerts
// @category       Anomalies
// @version        0.6.0
// @namespace      https://github.com/acunet/iitc-telegram-alerts
// @description    Relay ops COMM events and checkpoint alarms to a Telegram bot. Sends nothing until credentials are set (dry-run by default).
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

// Telegram Ops Alerts — ops alert relay. See README.md and docs/specs/.
// Rules kept on purpose: no extra requests to intel.ingress.com (only forwards data IITC already
// fetched), no GM_xmlhttpRequest (not available in IITC Mobile), credentials live in localStorage.

function wrapper(plugin_info) {
  if (typeof window.plugin !== 'function') window.plugin = function () {};
  var thisPlugin = (window.plugin.telegramOpsAlerts = function () {});

  var VERSION = '0.6.0';
  var LS_KEY = 'plugin-telegram-ops-alerts-settings';

  // Event kinds, in match order. Phrases are matched against the joined TEXT markup; a message like
  // "X destroyed the Link between A and B" therefore lands in `destroy` (first match wins).
  // 'battleBeacon' must be matched before 'beacon': a "Rare Battle Beacon" broadcast would otherwise be
  // filed as a plain beacon. 'battleResult' is the post-battle CAT message whose exact wording is not
  // documented anywhere public — dump mode (see dumpLine) exists to find it.
  var KIND_ORDER = ['battleBeacon', 'battleResult', 'capture', 'destroy', 'flip', 'deploy', 'link', 'field', 'beacon', 'fracker'];
  var DEFAULT_PHRASES = {
    battleBeacon: ['Battle Beacon'],
    battleResult: ['CAT-'],
    capture: [' captured '],
    destroy: [' destroyed '],
    // A flip means someone burned an ADA Refactor / JARVIS Virus: strong intent signal, and the portal
    // owner afterwards reads __ADA__ / __JARVIS__ depending on which faction flipped it.
    flip: [' flipped ', 'ADA Refactor', 'JARVIS Virus'],
    deploy: [' deployed '],
    link: [' linked ', ' Link '],
    field: [' Control Field '],
    beacon: ['Beacon'],
    fracker: ['Fracker'],
  };

  var DEFAULTS = {
    enabled: true,
    dryRun: true,
    botToken: '',
    chatId: '',
    topicId: '',
    flushSeconds: 15,
    useUTC: true,
    maxAgeSeconds: 300, // ignore COMM history older than this (opening IITC re-fetches recent messages)
    backgroundComm: true, // keep the COMM channels the relay needs polled (see registerBackgroundChannels)
    clockSync: true, // correct alarm time with the intel server clock (see clockSample)
    dumpComm: false, // learn mode: log every COMM message verbatim so the real wording can be found
    name: '', // ops event name, shown in the digest header (e.g. "Denpasar City")
    routing: {}, // per-kind destination override: {"battleBeacon":{"chatId":"-100…","topicId":"7"}}
    agentStats: true, // accumulate per-agent counters (activity, virus use, top portals) in localStorage
    factionFilter: 'any', // any | enl | res | machina
    priorityPlayers: '', // regex on the actor: those events are sent at once and flagged (special accounts)
    requirePortal: false,
    portalRegex: '',
    keywordRegex: '',
    center: null, // {lat, lng}
    radiusKm: 0, // 0 = no radius filter
    kinds: { battleBeacon: true, battleResult: false, capture: true, destroy: true, flip: true, deploy: false, link: true, field: true, beacon: true, fracker: true },
    alarms: { enabled: true, mode: 'interval', intervalMinutes: 5, times: '', leadMinutes: '1' },
    phrases: {}, // overrides merged over DEFAULT_PHRASES
  };

  var QUEUE_MAX = 200;
  var DIGEST_LIMIT = 3500;

  // ---------------------------------------------------------------- core (pure, unit-tested) ---

  function pick(item, type) {
    var markup = item && item[2] && item[2].plext && item[2].plext.markup;
    if (!markup || !markup.length) return null;
    for (var i = 0; i < markup.length; i++) {
      if (markup[i] && markup[i][0] === type) return markup[i][1] || {};
    }
    return null;
  }

  /**
   * Raw comm item ([guid, time, {plext}]) -> event, or null when no known phrase matched.
   * Reads plext.markup directly (same approach as the official uniques.js) so the plugin works on
   * IITC releases older than 0.39, where IITC.comm.parseMsgData does not exist yet.
   */
  function classify(item, phrases) {
    var plext = item && item[2] && item[2].plext;
    if (!plext || !plext.markup) return null;
    // only server-generated traffic is ops signal: agent chat must never be relayed, and it would
    // otherwise match loose phrases such as 'CAT-'
    if (plext.plextType === 'PLAYER_GENERATED') return null;

    var text = '';
    for (var i = 0; i < plext.markup.length; i++) {
      if (plext.markup[i][0] === 'TEXT' && plext.markup[i][1]) text += ' ' + (plext.markup[i][1].plain || '');
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    // Phrase matching runs on the space-padded text: the default phrases carry their surrounding
    // spaces (" captured ") so they cannot match inside a longer word.
    var padded = ' ' + text + ' ';
    var kind = null;
    for (var k = 0; k < KIND_ORDER.length && !kind; k++) {
      var list = phrases[KIND_ORDER[k]] || [];
      for (var j = 0; j < list.length; j++) {
        if (list[j] && padded.indexOf(list[j]) !== -1) {
          kind = KIND_ORDER[k];
          break;
        }
      }
    }
    if (!kind) return null;

    var portal = pick(item, 'PORTAL');
    var actor = pick(item, 'PLAYER') || pick(item, 'SENDER');

    return {
      guid: item[0],
      time: item[1],
      kind: kind,
      text: text,
      player: actor ? String(actor.plain || '').replace(/: $/, '') : '',
      team: actor && actor.team ? String(actor.team).toUpperCase() : String(plext.team || '').toUpperCase(),
      portal:
        portal && portal.latE6 != null
          ? { name: String(portal.name || ''), latE6: portal.latE6, lngE6: portal.lngE6 }
          : null,
    };
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    var r = 6371;
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLng = ((lng2 - lng1) * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function regexOk(pattern, value) {
    if (!pattern) return true;
    try {
      return new RegExp(pattern, 'i').test(value);
    } catch (e) {
      return true; // an invalid filter must not swallow every event
    }
  }

  /** True when the regex matches. Unlike regexOk, an empty/invalid pattern is simply "no match". */
  function matchesRegex(pattern, value) {
    if (!pattern) return false;
    try {
      return new RegExp(pattern, 'i').test(String(value == null ? '' : value));
    } catch (e) {
      return false;
    }
  }

  function shouldNotify(ev, cfg) {
    if (!ev) return false;
    if (cfg.kinds && cfg.kinds[ev.kind] === false) return false;
    if (cfg.requirePortal && !ev.portal) return false;

    if (cfg.factionFilter && cfg.factionFilter !== 'any') {
      var want = { enl: 'ENLIGHTENED', res: 'RESISTANCE', machina: 'MACHINA' }[cfg.factionFilter];
      if (want && ev.team !== want) return false;
    }
    if (!regexOk(cfg.portalRegex, ev.portal ? ev.portal.name : '')) return false;
    if (!regexOk(cfg.keywordRegex, ev.text)) return false;

    if (cfg.center && cfg.radiusKm > 0) {
      if (!ev.portal) return false;
      var d = haversineKm(cfg.center.lat, cfg.center.lng, ev.portal.latE6 / 1e6, ev.portal.lngE6 / 1e6);
      if (d > cfg.radiusKm) return false;
    }
    return true;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtTime(ms, useUTC) {
    var d = new Date(ms);
    if (useUTC) return d.toISOString().slice(11, 16);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function intelLink(portal) {
    if (!portal) return '';
    return 'https://intel.ingress.com/intel?pll=' + (portal.latE6 / 1e6).toFixed(6) + ',' + (portal.lngE6 / 1e6).toFixed(6);
  }

  function eventLine(ev, cfg) {
    var link = intelLink(ev.portal);
    var where = ev.portal ? (link ? '<a href="' + link + '">' + esc(ev.portal.name) + '</a>' : esc(ev.portal.name)) : esc(ev.text);
    var who = ev.player ? ' — ' + esc(ev.player) + (ev.team ? ' (' + esc(ev.team.slice(0, 3)) + ')' : '') : '';
    return (ev.priority ? '⚠️ ' : '') + '• <b>' + esc(ev.kind.toUpperCase()) + '</b> ' + fmtTime(ev.time, cfg.useUTC) + ' · ' + where + who;
  }

  /** One Telegram HTML message for a batch of events, truncated to DIGEST_LIMIT. */
  function formatDigest(events, cfg, title) {
    if (!events.length) return '';
    var head =
      '🌑 <b>Telegram Ops Alerts</b>' +
      (cfg.name ? ' [' + esc(cfg.name) + ']' : '') +
      ' · ' +
      events.length +
      ' event' +
      (events.length > 1 ? 's' : '') +
      ' · ' +
      fmtTime(nowMs(), cfg.useUTC) +
      ' ' +
      (cfg.useUTC ? 'UTC' : 'local');
    if (title) head += '\n' + esc(title);
    var lines = events.map(function (ev) {
      return eventLine(ev, cfg);
    });
    var out = head + '\n' + lines.join('\n');
    if (out.length > DIGEST_LIMIT) {
      var kept = [];
      var len = head.length + 1;
      for (var i = 0; i < lines.length; i++) {
        if (len + lines[i].length + 1 > DIGEST_LIMIT) break;
        kept.push(lines[i]);
        len += lines[i].length + 1;
      }
      out = head + '\n' + kept.join('\n') + '\n…+(' + (lines.length - kept.length) + ' more)';
    }
    return out;
  }

  /**
   * Buffer + rate limiter. opts: {flushMs, maxItems, format(events), send(text), now(), log(msg)}.
   * Digest flush is delay-based (Telegram allows ~20 messages/minute per chat); 429 retry_after
   * puts the batch back and blocks sending until the penalty expires.
   */
  function createQueue(opts) {
    var pending = [];
    var timer = null;
    var blockedUntil = 0;
    var inflight = false;
    var dropped = 0;
    var sent = 0;
    var now = opts.now || Date.now;

    function schedule() {
      if (timer !== null) return;
      var wait = Math.max(0, blockedUntil - now());
      timer = setTimeout(function () {
        timer = null;
        if (blockedUntil > now()) schedule();
        else flush();
      }, Math.max(opts.flushMs, wait));
    }

    function push(ev, immediate) {
      if (pending.length >= (opts.maxItems || QUEUE_MAX)) {
        pending.shift();
        dropped++;
      }
      pending.push(ev);
      if (immediate && blockedUntil <= now()) flush();
      else schedule();
    }

    function flush() {
      if (inflight || !pending.length || blockedUntil > now()) return Promise.resolve(false);
      inflight = true;
      var batch = pending;
      pending = [];
      var text = opts.format(batch);
      return Promise.resolve()
        .then(function () {
          return opts.send(text);
        })
        .then(function (res) {
          sent += batch.length;
          // the API result carries the message id, which is the only proof the ops group really got it
          opts.log('sent ' + batch.length + ' event(s)' + (res && res.message_id ? ' → msg ' + res.message_id : ''));
          inflight = false;
          if (pending.length) schedule();
          return true;
        })
        .catch(function (err) {
          inflight = false;
          blockedUntil = now() + Math.max(1, Number(err && err.retryAfter) || 5) * 1000;
          pending = batch.concat(pending).slice(-(opts.maxItems || QUEUE_MAX));
          opts.log('send failed (' + (err && err.message) + '), retry in ' + Math.round((blockedUntil - now()) / 1000) + 's');
          schedule();
          return false;
        });
    }

    return {
      push: push,
      flush: flush,
      state: function () {
        return { pending: pending.length, dropped: dropped, sent: sent, blockedFor: Math.max(0, blockedUntil - now()) };
      },
    };
  }

  // ------------------------------------------------------- checkpoint / wave alarm (time-based) --

  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
    if (!m) return null;
    var h = Number(m[1]);
    var mi = Number(m[2]);
    return h < 24 && mi < 60 ? h * 60 + mi : null;
  }

  function parseLeads(s) {
    return String(s || '')
      .split(/[\s,;]+/)
      .map(function (x) {
        return parseInt(x, 10);
      })
      .filter(function (x) {
        return !isNaN(x) && x >= 0;
      });
  }

  function dayStartFor(ms, useUTC) {
    var tz = useUTC ? 0 : -new Date(ms).getTimezoneOffset() * 60000;
    return Math.floor((ms - tz) / 86400000) * 86400000 + tz;
  }

  /** Next checkpoint in ms, or null when no schedule is configured. Interval mode aligns to the day start. */
  function nextCheckpoint(ms, cfg) {
    var out = [];
    var step = Math.max(1, Number(cfg.intervalMinutes) || 5) * 60000;
    if (cfg.mode !== 'times') {
      var base = dayStartFor(ms, cfg.useUTC);
      out.push(base + (Math.floor((ms - base) / step) + 1) * step);
    }
    if (cfg.mode !== 'interval') {
      var mins = String(cfg.times || '')
        .split(/[\s,;]+/)
        .map(parseHM)
        .filter(function (x) {
          return x !== null;
        });
      var day = dayStartFor(ms, cfg.useUTC);
      for (var i = 0; i < mins.length; i++) {
        var t = day + mins[i] * 60000;
        while (t <= ms) t += 86400000;
        out.push(t);
      }
    }
    return out.length ? Math.min.apply(null, out) : null;
  }

  /** Alarms that fall due in this tick: [{key, leadMinutes, checkpointMs}]. Pure -> unit-tested. */
  function dueAlarms(ms, cfg, firedKeys) {
    var out = [];
    if (!cfg.enabled) return out;
    var next = nextCheckpoint(ms, cfg);
    if (next === null) return out;
    var leads = parseLeads(cfg.leadMinutes);
    if (!leads.length) leads = [0];
    for (var i = 0; i < leads.length; i++) {
      var key = next + ':' + leads[i];
      if (ms >= next - leads[i] * 60000 && ms < next && firedKeys.indexOf(key) === -1) {
        out.push({ key: key, leadMinutes: leads[i], checkpointMs: next });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------- clock -------------
  // Checkpoint alarms are only as good as the device clock, and phones drift. Instead of calling an
  // NTP service (the pack's Anomaly Timer uses use.ntpjs.org), the offset is derived from data IITC
  // already fetched: every COMM message carries the intel server timestamp (item[1]).
  // shortcut: this is an arrival-time estimate, not true NTP — good to a few seconds and it only
  // updates while COMM is flowing; upgrade to real NTP only if sub-second accuracy is ever needed.
  var CLOCK_SAMPLES = 9;
  var CLOCK_LIMIT_MS = 15 * 60000; // drop samples beyond this (history re-fetch, or a clock set wildly wrong)
  var clockState = { samples: [], batches: 0, driftMs: 0 };

  function medianOffset(samples) {
    if (!samples.length) return 0;
    var s = samples.slice().sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  }

  /**
   * Feeds one clock sample per COMM batch. The first batch of a session is history fetched on load
   * (its timestamps are old by design), so it is skipped. Pure: returns the next state.
   */
  function clockSample(state, batchNewest, localNow) {
    var next = { samples: (state.samples || []).slice(), batches: (state.batches || 0) + 1, driftMs: state.driftMs || 0 };
    if (state.batches || batchNewest == null) {
      var sample = batchNewest - localNow;
      if (Math.abs(sample) <= CLOCK_LIMIT_MS) {
        next.samples.push(sample);
        while (next.samples.length > CLOCK_SAMPLES) next.samples.shift();
        next.driftMs = medianOffset(next.samples);
      }
    }
    return next;
  }

  function nowMs() {
    return Date.now() + (settings && settings.clockSync === false ? 0 : clockState.driftMs);
  }

  // ------------------------------------------------------------------------- presets -----------
  // Ops parameters are per event (radius, area, schedule, which events matter). One JSON preset per
  // event, so switching to the next anomaly is paste-and-apply instead of re-ticking ten boxes.
  var PRESET_KEYS = [
    'name',
    'center',
    'radiusKm',
    'useUTC',
    'kinds',
    'alarms',
    'factionFilter',
    'routing',
    'priorityPlayers',
    'portalRegex',
    'keywordRegex',
    'requirePortal',
  ];

  function exportPreset(cfg) {
    var out = {};
    PRESET_KEYS.forEach(function (k) {
      if (cfg[k] !== undefined) out[k] = cfg[k];
    });
    return out;
  }

  function applyPreset(cfg, preset) {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) throw new Error('preset must be a JSON object');
    PRESET_KEYS.forEach(function (k) {
      if (preset[k] === undefined) return;
      if (k === 'kinds') cfg.kinds = Object.assign({}, cfg.kinds, preset.kinds);
      else if (k === 'alarms') cfg.alarms = Object.assign({}, cfg.alarms, preset.alarms);
      else cfg[k] = preset[k];
    });
    return cfg;
  }

  // ----------------------------------------------------------------- routing / agent stats -------
  /**
   * Destination override per event kind. settings.routing = {"battleBeacon": {"chatId": "-100…",
   * "topicId": "7"}}; "*" catches everything else. Lets one ops group have a topic per event type
   * instead of a single noisy stream.
   */
  function routeFor(kind, cfg) {
    var r = cfg && cfg.routing;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    var dest = r[kind] || r['*'];
    if (!dest || typeof dest !== 'object') return null;
    if (!dest.chatId && !dest.topicId) return null;
    return dest;
  }

  function routeKey(dest) {
    return dest ? String(dest.chatId || '') + '#' + String(dest.topicId || '') : 'default';
  }

  var STATS_KEY = 'plugin-telegram-ops-alerts-stats';
  var STATS_MAX_PLAYERS = 200;
  var stats = { players: {}, savedAt: 0 };
  var statsDirty = 0;

  function loadStats() {
    try {
      var raw = window.localStorage[STATS_KEY];
      if (raw) stats = JSON.parse(raw);
    } catch (e) {
      log('agent stats unreadable, starting fresh');
    }
    if (!stats || typeof stats !== 'object' || !stats.players) stats = { players: {}, savedAt: 0 };
  }

  function saveStats() {
    try {
      window.localStorage[STATS_KEY] = JSON.stringify(stats);
    } catch (e) {
      log('cannot save agent stats: ' + e.message);
    }
  }

  /** Counters are per agent: activity, virus use and the portals they touch most (home/farm hint). */
  function noteEvent(ev, cfg) {
    if (!cfg || cfg.agentStats === false || !ev || !ev.player) return;
    var p = stats.players[ev.player] || (stats.players[ev.player] = { count: 0, kinds: {}, flips: {}, portals: {}, first: ev.time, last: ev.time });
    p.count++;
    p.kinds[ev.kind] = (p.kinds[ev.kind] || 0) + 1;
    if (ev.kind === 'flip') {
      var virus = /JARVIS/i.test(ev.text) ? 'jarvis' : /ADA/i.test(ev.text) ? 'ada' : 'unknown';
      p.flips[virus] = (p.flips[virus] || 0) + 1;
    }
    if (ev.portal && ev.portal.name) p.portals[ev.portal.name] = (p.portals[ev.portal.name] || 0) + 1;
    p.last = Math.max(p.last || 0, ev.time || 0);
    trimStats();
    statsDirty++;
    if (statsDirty >= 10 || Date.now() - (stats.savedAt || 0) > 30000) {
      stats.savedAt = Date.now();
      statsDirty = 0;
      saveStats();
    }
  }

  function trimStats() {
    var names = Object.keys(stats.players);
    if (names.length <= STATS_MAX_PLAYERS) return;
    names
      .sort(function (a, b) {
        return (stats.players[b].count || 0) - (stats.players[a].count || 0);
      })
      .slice(STATS_MAX_PLAYERS)
      .forEach(function (n) {
        delete stats.players[n];
      });
  }

  /** Top agents by activity, with their virus counts and most-touched portals (home/farm candidates). */
  function statsSummary(limit) {
    return Object.keys(stats.players)
      .map(function (name) {
        var p = stats.players[name];
        var top = Object.keys(p.portals || {})
          .sort(function (a, b) {
            return p.portals[b] - p.portals[a];
          })
          .slice(0, 3);
        return {
          name: name,
          count: p.count || 0,
          flips: (p.flips || {}).jarvis || 0,
          ada: (p.flips || {}).ada || 0,
          portals: top,
          last: p.last || 0,
        };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, limit || 10);
  }

  function statsText(limit) {
    var rows = statsSummary(limit || 12);
    if (!rows.length) return '(belum ada data)';
    // must work before setup() ran (the test harness calls it directly), so no hard dependency on settings
    var useUTC = !settings || settings.useUTC !== false;
    return rows
      .map(function (r) {
        var virus = r.flips + r.ada ? ' · virus: ' + r.flips + ' JARVIS / ' + r.ada + ' ADA' : '';
        return (
          r.name +
          ' — ' +
          r.count +
          ' event' +
          virus +
          '\n   portal tersering: ' +
          (r.portals.join(', ') || '-') +
          '\n   terakhir: ' +
          fmtTime(r.last, useUTC) +
          ' ' +
          (useUTC ? 'UTC' : 'local')
        );
      })
      .join('\n');
  }

  // ------------------------------------------------------------------------- transport ---------

  function sendTelegram(cfg, text, dest) {
    var chat = (dest && dest.chatId) || cfg.chatId;
    var topic = (dest && dest.topicId) || cfg.topicId;
    var url = 'https://api.telegram.org/bot' + cfg.botToken + '/sendMessage';
    var body = { chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (topic) body.message_thread_id = Number(topic);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (j) {
          if (!res.ok || j.ok === false) {
            var err = new Error((j && j.description) || 'HTTP ' + res.status);
            if (j && j.parameters && j.parameters.retry_after) err.retryAfter = j.parameters.retry_after;
            throw err;
          }
          return j.result || true;
        });
    });
  }

  // ----------------------------------------------------------------------- settings / log ------

  var settings = null;
  var logLines = [];
  var firedKeys = [];
  var seen = {};

  function loadSettings() {
    var cfg = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      var raw = window.localStorage[LS_KEY];
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in saved) if (Object.prototype.hasOwnProperty.call(saved, k)) cfg[k] = saved[k];
        cfg.kinds = Object.assign({}, DEFAULTS.kinds, saved.kinds || {});
        cfg.alarms = Object.assign({}, DEFAULTS.alarms, saved.alarms || {});
        cfg.phrases = Object.assign({}, DEFAULT_PHRASES, saved.phrases || {});
      }
    } catch (e) {
      log('settings unreadable, using defaults: ' + e.message);
    }
    if (!cfg.phrases || !Object.keys(cfg.phrases).length) cfg.phrases = Object.assign({}, DEFAULT_PHRASES);
    settings = cfg;
    return cfg;
  }

  function saveSettings() {
    try {
      window.localStorage[LS_KEY] = JSON.stringify(settings);
      return true;
    } catch (e) {
      log('cannot save settings: ' + e.message);
      return false;
    }
  }

  function log(msg) {
    var line = fmtTime(Date.now(), true) + ' ' + msg;
    logLines.push(line);
    if (logLines.length > 200) logLines.shift();
    if (window.console && console.log) console.log('[tg-alerts] ' + msg);
    var el = document.getElementById('ta-log');
    if (el) el.value = logLines.join('\n');
  }

  function canSend() {
    return !!(settings.botToken && settings.chatId);
  }

  function deliver(text, dest) {
    if (settings.dryRun || !canSend()) {
      var where = dest ? '[' + (dest.chatId || settings.chatId) + (dest.topicId ? '#' + dest.topicId : '') + '] ' : '';
      log('DRY-RUN ' + where + (canSend() ? '' : '(no credentials) ') + text.replace(/\n/g, ' ⏎ ').slice(0, 500));
      return Promise.resolve(true);
    }
    return sendTelegram(settings, text, dest);
  }

  var queues = {};

  /** One queue per destination: routing can send a kind to its own chat/topic. Created on demand. */
  function queueFor(dest) {
    var key = routeKey(dest);
    if (!queues[key]) {
      queues[key] = createQueue({
        flushMs: Math.max(2, Number(settings.flushSeconds) || 15) * 1000,
        maxItems: QUEUE_MAX,
        format: function (events) {
          return formatDigest(events, settings);
        },
        send: function (text) {
          return deliver(text, dest);
        },
        log: log,
      });
    }
    return queues[key];
  }

  function onCommData(data) {
    if (!settings.enabled || !data || !data.result) return;
    var now = nowMs();
    var maxAge = (Number(settings.maxAgeSeconds) || 0) * 1000;
    var newest = null;
    for (var i = 0; i < data.result.length; i++) {
      var item = data.result[i];
      if (!item || !item[0]) continue;
      if (newest === null || item[1] > newest) newest = item[1];
      if (seen[item[0]]) continue;
      seen[item[0]] = 1;
      if (Object.keys(seen).length > 5000) seen = {};
      if (maxAge && now - item[1] > maxAge) continue; // history on load must not be re-sent
      if (settings.dumpComm) log('DUMP ' + dumpLine(item));
      var ev = classify(item, settings.phrases);
      if (!ev || !shouldNotify(ev, settings)) continue;
      // special accounts (NIASection14, __ADA__, __JARVIS__, _MACHINA_) and other watched actors: relay
      // at once with a marker instead of waiting for the batch window
      ev.priority = matchesRegex(settings.priorityPlayers, ev.player);
      noteEvent(ev, settings);
      queueFor(routeFor(ev.kind, settings)).push(ev, ev.priority);
      if (ev.priority) log('PRIORITY ' + ev.kind + ' · ' + ev.player + (ev.portal ? ' @' + ev.portal.name : ''));
    }
    var before = clockState.driftMs;
    clockState = clockSample(clockState, newest, Date.now());
    if (clockState.driftMs !== before && Math.abs(clockState.driftMs) > 5000) {
      log('clock offset ' + (clockState.driftMs / 1000).toFixed(1) + 's — alarm times ' + (settings.clockSync === false ? 'not ' : '') + 'corrected');
      if (Math.abs(clockState.driftMs) > 60000) log('WARNING: device clock differs by ' + Math.round(clockState.driftMs / 1000) + 's from the intel server — fix the device clock');
    }
  }

  function tick() {
    if (!settings.enabled) return;
    var due = dueAlarms(nowMs(), settings.alarms, firedKeys);
    for (var i = 0; i < due.length; i++) {
      firedKeys.push(due[i].key);
      if (firedKeys.length > 100) firedKeys.shift();
      var when = fmtTime(due[i].checkpointMs, settings.useUTC) + (settings.useUTC ? ' UTC' : ' local');
      var txt =
        due[i].leadMinutes > 0
          ? '⏰ <b>Checkpoint in ' + due[i].leadMinutes + ' min</b> — ' + esc(when)
          : '⏰ <b>Checkpoint now</b> — ' + esc(when);
      deliver(txt).catch(function (e) {
        log('alarm send failed: ' + e.message);
      });
    }
  }

  // ------------------------------------------------------------------------------ UI ----------

  function cb(id, label, checked) {
    return (
      '<label style="display:inline-block;min-width:150px"><input type="checkbox" id="ta-' +
      id +
      '"' +
      (checked ? ' checked' : '') +
      '> ' +
      label +
      '</label>'
    );
  }

  function txt(id, value, size) {
    return '<input id="ta-' + id + '" size="' + (size || 30) + '" value="' + esc(value == null ? '' : value) + '">';
  }

  function openConfig() {
    var a = settings.alarms;
    var presetText = JSON.stringify(exportPreset(settings));
    var kindBoxes = KIND_ORDER.map(function (k) {
      return cb('kind-' + k, k, settings.kinds[k] !== false);
    }).join(' ');

    var html =
      '<style>#dialog-telegram-ops-alerts-config .ui-dialog-content{max-height:62vh;overflow-y:auto}</style>' +
      '<div style="max-width:520px">' +
      '<p><b>Telegram Ops Alerts ' +
      VERSION +
      '</b> — COMM ops events + checkpoint alarms to Telegram.' +
      (settings.dryRun ? ' <b style="color:#d80">DRY-RUN: nothing is sent.</b>' : '') +
      '</p>' +
      '<table>' +
      '<tr><td>Bot token</td><td>' +
      txt('token', settings.botToken, 40) +
      '</td></tr>' +
      '<tr><td>Chat id</td><td>' +
      txt('chat', settings.chatId, 20) +
      ' topic id ' +
      txt('topic', settings.topicId, 10) +
      '</td></tr>' +
      '<tr><td>Faction</td><td><select id="ta-faction">' +
      ['any', 'enl', 'res', 'machina']
        .map(function (f) {
          return '<option value="' + f + '"' + (settings.factionFilter === f ? ' selected' : '') + '>' + f + '</option>';
        })
        .join('') +
      '</select> portal name <code>/regex/</code> ' +
      txt('portal', settings.portalRegex, 18) +
      ' text ' +
      txt('keyword', settings.keywordRegex, 18) +
      '</td></tr>' +
      '<tr><td>Radius</td><td>' +
      txt('radius', settings.radiusKm, 6) +
      ' km from ' +
      (settings.center ? esc(settings.center.lat.toFixed(5) + ',' + settings.center.lng.toFixed(5)) : 'map center') +
      ' <a onclick="window.plugin.telegramOpsAlerts.useMapCenter();return false" href="#">use map center</a></td></tr>' +
      '<tr><td>Priority</td><td>' +
      txt('priority', settings.priorityPlayers, 34) +
      ' <span style="opacity:.7">regex on the actor — sent immediately, flagged ⚠️<br>(e.g. <code>NIASection14|ADA|JARVIS|MACHINA</code>)</span></td></tr>' +
      '<tr><td>Events</td><td>' +
      kindBoxes +
      ' ' +
      cb('reqportal', 'portal required', settings.requirePortal) +
      '</td></tr>' +
      '<tr><td>Alarms</td><td>' +
      cb('alarm-on', 'on', a.enabled !== false) +
      ' mode <select id="ta-mode">' +
      ['interval', 'times', 'both']
        .map(function (m) {
          return '<option value="' + m + '"' + (a.mode === m ? ' selected' : '') + '>' + m + '</option>';
        })
        .join('') +
      '</select> every ' +
      txt('interval', a.intervalMinutes, 4) +
      ' min, at ' +
      txt('times', a.times, 22) +
      ' lead(min) ' +
      txt('leads', a.leadMinutes, 8) +
      '</td></tr>' +
      '<tr><td>Event name</td><td>' +
      txt('name', settings.name, 24) +
      ' <span style="opacity:.7">shown in the digest header</span></td></tr>' +
      '<tr><td>Batch</td><td>' +
      txt('flush', settings.flushSeconds, 5) +
      ' s · ' +
      cb('utc', 'UTC times', settings.useUTC) +
      ' ' +
      cb('bgcomm', 'COMM in background', settings.backgroundComm !== false) +
      ' ' +
      cb('clocksync', 'clock sync', settings.clockSync !== false) +
      ' ' +
      cb('dumpcomm', 'dump COMM to log', settings.dumpComm === true) +
      ' ' +
      cb('dry', 'dry-run', settings.dryRun) +
      ' ' +
      cb('enabled', 'plugin enabled', settings.enabled) +
      '</td></tr>' +
      '</table>' +
      '<p><b>Phrase overrides</b> (JSON, empty = defaults; use dry-run to discover the real strings):<br>' +
      '<textarea id="ta-phrases" style="width:100%;height:55px">' +
      esc(JSON.stringify(settings.phrases)) +
      '</textarea></p>' +
      '<p><b>Ops preset</b> (JSON per event: name, center, radiusKm, useUTC, kinds, alarms, filters):<br>' +
      '<textarea id="ta-preset" style="width:100%;height:55px">' +
      esc(presetText) +
      '</textarea><br>' +
      '<button onclick="window.plugin.telegramOpsAlerts.applyPresetFromForm();return false">Apply preset</button> ' +
      '<button onclick="window.plugin.telegramOpsAlerts.exportPresetToForm();return false">Fill from current</button></p>' +
      '<p><b>Routing</b> (JSON: kind → destination; <code>"*"</code> = catch-all; use <code>topicId</code> for a forum topic):<br>' +
      '<textarea id="ta-routing" style="width:100%;height:45px">' +
      esc(JSON.stringify(settings.routing || {})) +
      '</textarea></p>' +
      '<p><b>Agent stats</b> (top actors, virus use, most-touched portals = home/farm hint):<br>' +
      '<textarea id="ta-stats" readonly style="width:100%;height:95px;font-family:monospace">' +
      esc(statsText(8)) +
      '</textarea><br>' +
      '<button onclick="window.plugin.telegramOpsAlerts.sendStats();return false">Send stats</button> ' +
      '<button onclick="window.plugin.telegramOpsAlerts.resetStats();return false">Reset stats</button></p>' +
      '<p><b>Log</b><br><textarea id="ta-log" readonly style="width:100%;height:80px;font-family:monospace">' +
      esc(logLines.join('\n')) +
      '</textarea></p>' +
      '</div>';

    dialog({
      html: html,
      id: 'telegram-ops-alerts-config',
      title: 'Telegram Ops Alerts — ops alert relay',
      width: window.IS_DEVICE_MOBILE ? 360 : 560,
      buttons: {
        Save: function () {
          readForm();
          if (saveSettings()) log('settings saved');
          $(this).dialog('close');
        },
        'Send test': function () {
          readForm();
          saveSettings();
          deliver('🌑 <b>Telegram Ops Alerts test</b> — relay is wired up.').then(
            function () {
              log(canSend() && !settings.dryRun ? 'test sent' : 'test logged (dry-run or no credentials)');
            },
            function (e) {
              log('test failed: ' + e.message);
            }
          );
        },
        'Clear log': function () {
          logLines = [];
          document.getElementById('ta-log').value = '';
        },
        Close: function () {
          $(this).dialog('close');
        },
      },
    });
  }

  function readForm() {
    var val = function (id) {
      var el = document.getElementById('ta-' + id);
      return el ? el.value : '';
    };
    var chk = function (id) {
      var el = document.getElementById('ta-' + id);
      return !!(el && el.checked);
    };
    settings.name = val('name').trim();
    settings.botToken = val('token').trim();
    settings.chatId = val('chat').trim();
    settings.topicId = val('topic').trim();
    settings.factionFilter = val('faction');
    settings.portalRegex = val('portal').trim();
    settings.keywordRegex = val('keyword').trim();
    settings.priorityPlayers = val('priority').trim();
    settings.radiusKm = Number(val('radius')) || 0;
    settings.flushSeconds = Math.max(2, Number(val('flush')) || 15);
    settings.useUTC = chk('utc');
    settings.backgroundComm = chk('bgcomm');
    settings.clockSync = chk('clocksync');
    settings.dumpComm = chk('dumpcomm');
    settings.dryRun = chk('dry');
    settings.enabled = chk('enabled');
    settings.requirePortal = chk('reqportal');
    KIND_ORDER.forEach(function (k) {
      settings.kinds[k] = chk('kind-' + k);
    });
    settings.alarms = {
      enabled: chk('alarm-on'),
      mode: val('mode'),
      intervalMinutes: Number(val('interval')) || 5,
      times: val('times').trim(),
      leadMinutes: val('leads').trim() || '0',
    };
    try {
      var p = JSON.parse(val('phrases').trim() || '{}');
      settings.phrases = Object.assign({}, DEFAULT_PHRASES, p);
    } catch (e) {
      log('invalid phrase JSON, keeping current phrases');
    }
    try {
      var r = JSON.parse(val('routing').trim() || '{}');
      settings.routing = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
    } catch (e) {
      log('invalid routing JSON, keeping current routing');
    }
  }

  function sendStats() {
    if (!Object.keys(stats.players).length) {
      log('no agent stats yet');
      return;
    }
    var msg =
      '📊 <b>Telegram Ops Alerts</b>' +
      (settings.name ? ' [' + esc(settings.name) + ']' : '') +
      ' · ringkasan agen\n<pre>' +
      esc(statsText(12)) +
      '</pre>';
    deliver(msg).then(
      function () {
        log('agent summary sent');
      },
      function (e) {
        log('agent summary failed: ' + e.message);
      }
    );
  }

  function resetStats() {
    stats = { players: {}, savedAt: 0 };
    saveStats();
    writeForm();
    log('agent stats cleared');
  }

  /** Mirrors readForm: writes the current settings back into the form (used after applying a preset). */
  function writeForm() {
    var set = function (id, value) {
      var el = document.getElementById('ta-' + id);
      if (el) el.value = value == null ? '' : value;
    };
    var chk = function (id, on) {
      var el = document.getElementById('ta-' + id);
      if (el) el.checked = !!on;
    };
    set('token', settings.botToken);
    set('chat', settings.chatId);
    set('topic', settings.topicId);
    set('name', settings.name);
    set('faction', settings.factionFilter);
    set('portal', settings.portalRegex);
    set('keyword', settings.keywordRegex);
    set('priority', settings.priorityPlayers);
    set('radius', settings.radiusKm);
    set('flush', settings.flushSeconds);
    set('interval', settings.alarms.intervalMinutes);
    set('times', settings.alarms.times);
    set('leads', settings.alarms.leadMinutes);
    set('mode', settings.alarms.mode);
    chk('utc', settings.useUTC);
    chk('bgcomm', settings.backgroundComm !== false);
    chk('clocksync', settings.clockSync !== false);
    chk('dumpcomm', settings.dumpComm === true);
    chk('dry', settings.dryRun);
    chk('enabled', settings.enabled);
    chk('reqportal', settings.requirePortal);
    chk('alarm-on', settings.alarms.enabled);
    KIND_ORDER.forEach(function (k) {
      chk('kind-' + k, settings.kinds[k]);
    });
    var phrases = document.getElementById('ta-phrases');
    if (phrases) phrases.value = JSON.stringify(settings.phrases);
    var routingEl = document.getElementById('ta-routing');
    if (routingEl) routingEl.value = JSON.stringify(settings.routing || {});
    var statsEl = document.getElementById('ta-stats');
    if (statsEl) statsEl.value = statsText(8);
  }

  function applyPresetFromForm() {
    var el = document.getElementById('ta-preset');
    if (!el) return;
    readForm();
    try {
      applyPreset(settings, JSON.parse(el.value));
      saveSettings();
      writeForm();
      el.value = JSON.stringify(exportPreset(settings));
      log('preset applied: ' + (settings.name || '(no name)'));
    } catch (e) {
      log('preset not applied: ' + e.message);
    }
  }

  function exportPresetToForm() {
    readForm();
    var el = document.getElementById('ta-preset');
    if (el) el.value = JSON.stringify(exportPreset(settings));
    log('preset filled from current settings');
  }

  function useMapCenter() {
    if (window.map && window.map.getCenter) {
      var c = window.map.getCenter();
      settings.center = { lat: c.lat, lng: c.lng };
      log('center set to ' + c.lat.toFixed(5) + ',' + c.lng.toFixed(5));
    }
  }

  /** One line per raw COMM message, verbatim: how the real wording of a new event type is found. */
  function dumpLine(item) {
    var markup = (item[2] && item[2].plext && item[2].plext.markup) || [];
    var text = '';
    var portal = '';
    var player = '';
    markup.forEach(function (ent) {
      if (!ent || !ent[1]) return;
      if (ent[0] === 'TEXT') text += ent[1].plain || '';
      else if (ent[0] === 'PORTAL') portal = ent[1].name || '';
      else if (ent[0] === 'PLAYER' || ent[0] === 'SENDER') player = ent[1].plain || '';
    });
    return (
      ((item[2] && item[2].plext && item[2].plext.plextType) || '?') +
      ' | ' +
      (player || '?') +
      ' | ' +
      text.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '') +
      (portal ? ' | @' + portal : '')
    );
  }

  /**
   * IITC requests COMM only for the active chat tab plus channels a plugin registered as background
   * (core/code/chat.js `chat.request()` → `chat.backgroundChannels`). On IITC Mobile the operator sits
   * on the map pane, so no chat tab is active and *nothing* would arrive; on desktop the Alerts tab is
   * rarely open. Same pattern the official plugins use (player-activity-tracker, machina-tracker).
   * Returns the channels now monitored, so the log can show it.
   */
  function registerBackgroundChannels(cfg) {
    if (cfg.backgroundComm === false || !IITC.chat || typeof IITC.chat.backgroundChannelData !== 'function') return [];
    var wanted = [];
    var events = cfg.kinds || {};
    if (events.capture || events.destroy || events.deploy || events.link || events.field) wanted.push('all');
    if (events.beacon || events.fracker) wanted.push('alerts');
    wanted.forEach(function (channel) {
      IITC.chat.backgroundChannelData('iitc-telegram-alerts', channel, true);
    });
    return wanted;
  }

  /**
   * On IITC Mobile the desktop toolbox is not reachable (the app's own menu is fixed), and the only
   * extension point is a pane in the app's navigation drawer. Tapping it makes the app call
   * `window.show('<id>')`, which runs the `paneChanged` hook (see core/code/app.js + IITC_Mobile.
   * switchToPane). We open the normal config dialog from there.
   */
  function setupMobilePane() {
    if (!window.IS_DEVICE_MOBILE || !window.app || typeof window.app.addPane !== 'function') return;
    window.app.addPane('telegram-ops-alerts', 'TG Alerts', 'notifications');
    window.addHook('paneChanged', function (id) {
      if (id !== 'telegram-ops-alerts') return;
      openConfig();
      // the pane has no view of its own: go back to the map so closing the dialog does not leave
      // the user staring at an empty pane
      setTimeout(function () {
        if (window.show) window.show('map');
      }, 60);
    });
    log('mobile pane registered');
  }

  // --------------------------------------------------------------------------- setup ----------

  function setup() {
    if (thisPlugin._setupDone) return;
    thisPlugin._setupDone = true;

    loadSettings();
    loadStats();

    window.addHook('publicChatDataAvailable', onCommData);
    window.addHook('factionChatDataAvailable', onCommData);
    window.addHook('alertsChatDataAvailable', onCommData);

    setInterval(tick, 15000);

    if (IITC.toolbox) {
      IITC.toolbox.addButton({
        id: 'telegram-ops-alerts-btn',
        label: 'TG Alerts',
        title: 'Telegram Ops Alerts: ops alert relay',
        icon: 'notifications',
        action: openConfig,
      });
    }
    setupMobilePane();
    var bg = registerBackgroundChannels(settings);
    log('background COMM: ' + (bg.length ? bg.join(',') : 'off — events only arrive while a chat tab is open'));
    log('clock sync: ' + (settings.clockSync === false ? 'off' : 'on (offset 0.0s, corrected as COMM arrives)'));
    log('agent stats: ' + Object.keys(stats.players).length + ' agents tracked');
    log('loaded v' + VERSION + (settings.dryRun ? ' (dry-run)' : '') + ' — events: ' + Object.keys(settings.kinds).filter(function (k) { return settings.kinds[k]; }).join(','));
  }

  // exposed for the node test harness and for other plugins
  thisPlugin.core = {
    classify: classify,
    dumpLine: dumpLine,
    shouldNotify: shouldNotify,
    formatDigest: formatDigest,
    createQueue: createQueue,
    nextCheckpoint: nextCheckpoint,
    dueAlarms: dueAlarms,
    parseLeads: parseLeads,
    haversineKm: haversineKm,
    matchesRegex: matchesRegex,
    medianOffset: medianOffset,
    clockSample: clockSample,
    exportPreset: exportPreset,
    applyPreset: applyPreset,
    routeFor: routeFor,
    noteEvent: noteEvent,
    loadStats: loadStats,
    statsSummary: statsSummary,
    statsText: statsText,
    PRESET_KEYS: PRESET_KEYS,
    DEFAULT_PHRASES: DEFAULT_PHRASES,
    DEFAULTS: DEFAULTS,
  };
  thisPlugin.openConfig = openConfig;
  thisPlugin.useMapCenter = useMapCenter;
  thisPlugin.applyPresetFromForm = applyPresetFromForm;
  thisPlugin.exportPresetToForm = exportPresetToForm;
  thisPlugin.sendStats = sendStats;
  thisPlugin.resetStats = resetStats;
  thisPlugin.version = VERSION;

  thisPlugin.setup = setup;
  var setupFn = setup;
  setupFn.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setupFn);
  if (window.iitcLoaded && typeof setupFn === 'function') setupFn();
}

// bootstrap: inject the wrapper into the page context (standard IITC plugin pattern)
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description,
  };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
