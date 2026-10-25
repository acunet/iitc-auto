#!/usr/bin/env python3
"""
cdp-bridge-test.py — verifikasi jalur data bridge IITC Auto TANPA harus nonton layar mobil.

Caranya: nyambung ke WebView IITC lewat Chrome DevTools Protocol (WebView debugging memang
diaktifkan oleh IITC Mobile), lalu membaca state bridge / memicu pengiriman payload secara manual.

Pemakaian (HP harus tercolok, app IITC Auto sedang jalan):

    adb -s <serial> forward tcp:9222 localabstract:webview_devtools_remote_<pid>
    python scripts/cdp-bridge-test.py --probe      # lihat state: portal di window.portals, bridge siap?
    python scripts/cdp-bridge-test.py --trigger    # paksa kirim pakai data portal NYATA yang sudah keload
    python scripts/cdp-bridge-test.py --fake       # kirim payload palsu (buat tes tanpa login)

Cara dapat <pid>:  adb shell pidof org.exarhteam.iitc_mobile.debug
Socket devtools:   adb shell cat /proc/net/unix | grep webview_devtools_remote
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
  if (!window.__iitcAutoBridge) return 'bridge belum disuntik';
  window.__iitcAutoBridge.state.lastSentMs = 0;      // lepas throttle
  window.__iitcAutoBridge.state.lastPayload = null;  // paksa dianggap berubah
  window.__iitcAutoBridge.onMapDataRefreshEnd();
  return 'dipicu; portal di window.portals: ' + Object.keys(window.portals || {}).length;
})()
"""

FAKE_JS = """
(function () {
  if (!window.__iitcAutoBridge) return 'bridge belum disuntik';
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
  return 'kirim payload uji coba selesai';
})()
"""


def pick_page():
    pages = json.load(urllib.request.urlopen(DEVTOOLS, timeout=10))
    pages = [p for p in pages if p.get("type") == "page"]
    for p in pages:
        if "Intel Map" in (p.get("title") or ""):
            return p
    if not pages:
        raise SystemExit("nggak ada halaman WebView. Pastikan app jalan & port 9222 sudah di-forward.")
    return pages[0]


def evaluate(ws_url, expression):
    # suppress_origin=True: DevTools menolak koneksi WebSocket yang membawa header Origin
    # ("Handshake status 403 Forbidden ... --remote-allow-origins") — ini proteksi against
    # halaman web yang nyoba nyolong akses ke debugger.
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
    parser.add_argument("--probe", action="store_true", help="tampilkan state bridge di WebView")
    parser.add_argument("--trigger", action="store_true", help="paksa kirim pakai data portal nyata")
    parser.add_argument("--fake", action="store_true", help="suntik portal palsu lalu kirim (tanpa login)")
    parser.add_argument("--eval", dest="expr", help="jalankan ekspresi JS apa pun dan cetak hasilnya")
    parser.add_argument("--dump-payload", metavar="FILE",
                        help="simpan payload terakhir dari WebView (state.lastPayload) ke file")
    parser.add_argument("--inject-payload", metavar="FILE",
                        help="kirim isi file sebagai payload ke bridge native (app.sendPortals) — "
                             "dipakai buat mendemokan data nyata dari HP lain, mis. di emulator")
    args = parser.parse_args()

    page = pick_page()
    print("target:", page.get("title"), "|", page.get("url"))

    if args.dump_payload:
        payload = evaluate(page["webSocketDebuggerUrl"],
                           "window.__iitcAutoBridge ? window.__iitcAutoBridge.state.lastPayload : null")
        if not payload:
            raise SystemExit("belum ada payload di WebView ini (biarkan peta IITC sempat memuat data dulu)")
        with open(args.dump_payload, "w", encoding="utf-8") as fh:
            fh.write(payload)
        print("payload tersimpan:", args.dump_payload, len(payload), "char")
    elif args.inject_payload:
        with open(args.inject_payload, encoding="utf-8") as fh:
            payload = fh.read()
        # json.dumps -> literal string JS yang aman (escaping lengkap)
        expr = "(function(){ if (typeof app === 'undefined' || !app.sendPortals) return 'interface native tidak ada'; " \
               "app.sendPortals(%s); return 'payload %d char dikirim ke native'; })()" % (
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
