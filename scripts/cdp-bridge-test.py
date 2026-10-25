#!/usr/bin/env python3
"""
cdp-bridge-test.py — verify the IITC Auto bridge data path WITHOUT having to watch the car screen.

How it works: connect to the IITC WebView over the Chrome DevTools Protocol (WebView debugging is
enabled by IITC Mobile), then read the bridge state / trigger a payload send by hand.

Usage (the phone must be plugged in and the IITC Auto app running):

    adb -s <serial> forward tcp:9222 localabstract:webview_devtools_remote_<pid>
    python scripts/cdp-bridge-test.py --probe      # show state: portals in window.portals, bridge ready?
    python scripts/cdp-bridge-test.py --trigger    # force a send using REAL portal data already loaded
    python scripts/cdp-bridge-test.py --fake       # send a fake payload (for testing without login)

How to get <pid>:  adb shell pidof org.exarhteam.iitc_mobile.debug
Devtools socket:   adb shell cat /proc/net/unix | grep webview_devtools_remote
"""
import argparse
import json
import os
import urllib.request

import websocket

DEVTOOLS_PORT = int(os.environ.get("CDP_PORT", "9222"))
DEVTOOLS = "http://localhost:%d/json/list" % DEVTOOLS_PORT

PROBE_JS = """
JSON.stringify({
  url: location.href,
  bridgeInstalled: !!window.__iitcAutoBridge,
  nativeBridge: (typeof app !== 'undefined') && !!app && !!app.sendPortals,
  iitcLoaded: typeof window.addHook === 'function',
  portalCount: Object.keys(window.portals || {}).length,
  hasMap: typeof window.map !== 'undefined' && !!window.map.getCenter,
  lastSentMs: window.__iitcAutoBridge ? window.__iitcAutoBridge.state.lastSentMs : null
})
"""

TRIGGER_JS = """
(function () {
  if (!window.__iitcAutoBridge) return 'bridge not injected';
  window.__iitcAutoBridge.state.lastSentMs = 0;      // release the throttle
  window.__iitcAutoBridge.state.lastPayload = null;  // force it to look changed
  window.__iitcAutoBridge.onMapDataRefreshEnd();
  return 'dipicu; portal di window.portals: ' + Object.keys(window.portals || {}).length;
})()
"""

FAKE_JS = """
(function () {
  if (!window.__iitcAutoBridge) return 'bridge not injected';
  window.portals = window.portals || {};
  window.portals['tes-iitc-auto-1'] = { options: { data: { latE6: -6176500, lngE6: 106827100, team: 'R', level: 8, title: 'TES Monas', health: 87 } } };
  window.portals['tes-iitc-auto-2'] = { options: { data: { latE6: -6176700, lngE6: 106830700, team: 'E', level: 6, title: 'TES Gambir' } } };
  if (!window.map) {
    window.map = {
      getCenter: function () { return { lat: -6.2, lng: 106.8 }; },
      getBounds: function () { return { getSouth: function(){return -6.25;}, getWest: function(){return 106.75;}, getNorth: function(){return -6.15;}, getEast: function(){return 106.85;} }; }
    };
  }
  window.__iitcAutoBridge.state.lastSentMs = 0;
  window.__iitcAutoBridge.state.lastPayload = null;
  window.__iitcAutoBridge.onMapDataRefreshEnd();
  return 'test payload send finished';
})()
"""


def pick_page():
    pages = json.load(urllib.request.urlopen(DEVTOOLS, timeout=10))
    pages = [p for p in pages if p.get("type") == "page"]
    for p in pages:
        if "Intel Map" in (p.get("title") or ""):
            return p
    if not pages:
        raise SystemExit("no WebView page found. Make sure the app is running and the devtools port is forwarded.")
    return pages[0]


def evaluate(ws_url, expression):
    # suppress_origin=True: DevTools rejects WebSocket connections that carry an Origin header
    # ("Handshake status 403 Forbidden ... --remote-allow-origins") — a protection against
    # web pages trying to steal access to the debugger.
    ws = websocket.create_connection(ws_url, timeout=25, suppress_origin=True)
    try:
        ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": expression, "returnByValue": True},
        }))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == 1:
                result = msg.get("result", {}).get("result", {})
                return result.get("value", result)
    finally:
        ws.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true", help="print the bridge state in the WebView")
    parser.add_argument("--trigger", action="store_true", help="force a send using real portal data")
    parser.add_argument("--fake", action="store_true", help="inject fake portals then send (no login needed)")
    parser.add_argument("--eval", dest="expr", help="run any JS expression and print the result")
    parser.add_argument("--dump-payload", metavar="FILE",
                        help="save the last payload from the WebView (state.lastPayload) to a file")
    parser.add_argument("--inject-payload", metavar="FILE",
                        help="send the contents of a file as the payload to the native bridge (app.sendPortals) — "
                             "used to demo real data from another phone, e.g. in the emulator")
    args = parser.parse_args()

    page = pick_page()
    print("target:", page.get("title"), "|", page.get("url"))

    if args.dump_payload:
        payload = evaluate(page["webSocketDebuggerUrl"],
                           "window.__iitcAutoBridge ? window.__iitcAutoBridge.state.lastPayload : null")
        if not payload:
            raise SystemExit("no payload in this WebView yet (let the IITC map load its data first)")
        with open(args.dump_payload, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print("payload tersimpan:", args.dump_payload, len(payload), "char")
    elif args.inject_payload:
        with open(args.inject_payload, encoding="utf-8") as fh:
            payload = fh.read()
        # json.dumps -> a safe JS string literal (full escaping)
        expr = "(function(){ if (typeof app === 'undefined' || !app.sendPortals) return 'native interface missing'; " \
               "app.sendPortals(%s); return 'payload of %d chars sent to native'; })()" % (
                   json.dumps(payload), len(payload))
        print(evaluate(page["webSocketDebuggerUrl"], expr))
    elif args.expr:
        print(evaluate(page["webSocketDebuggerUrl"], args.expr))
    elif args.trigger:
        print(evaluate(page["webSocketDebuggerUrl"], TRIGGER_JS))
    elif args.fake:
        print(evaluate(page["webSocketDebuggerUrl"], FAKE_JS))
    else:
        raw = evaluate(page["webSocketDebuggerUrl"], PROBE_JS)
        print(json.dumps(json.loads(raw), indent=2))


if __name__ == "__main__":
    main()
