/*
 * Test logika bridge (node --test friendly, dijalankan: node mobile/tests/iitc-auto-bridge.test.mjs)
 * Logikanya diambil dari userscript asli via sandbox vm, bukan salinan — supaya test nggak bisa
 * "lulus" sementara kode aslinya beda.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'app', 'src', 'main', 'assets', 'iitc-auto-bridge.js');
const code = readFileSync(scriptPath, 'utf8');

function loadBridge() {
    const sandbox = { window: { console }, console, Date, JSON, Object, Math, String, isFinite };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox.window.__iitcAutoBridge;
}

const bridge = loadBridge();
let failures = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  ok   ' + name);
    } catch (e) {
        failures++;
        console.log('  FAIL ' + name + ' -> ' + e.message);
    }
}

console.log('iitc-auto-bridge.js');

test('portal latE6/lngE6 dikonversi ke derajat', () => {
    const p = bridge.portalToPayload('guid-1', {
        options: { data: { latE6: -6176500, lngE6: 106827100, team: 'R', level: '8', title: 'Monas', health: 87 } }
    });
    assert.equal(p.g, 'guid-1');
    assert.equal(p.lat.toFixed(5), '-6.17650');
    assert.equal(p.lng.toFixed(5), '106.82710');
    assert.equal(p.t, 'R');
    assert.equal(p.l, 8);
    assert.equal(p.hp, 87);
});

test('portal tanpa latE6 pakai lat/lng biasa', () => {
    const p = bridge.portalToPayload('guid-2', { options: { data: { lat: -6.2, lng: 106.8, team: 'E' } } });
    assert.equal(p.lat, -6.2);
    assert.equal(p.t, 'E');
});

test('fallback ke layer.getLatLng() kalau data nggak lengkap', () => {
    const p = bridge.portalToPayload('guid-3', {
        options: { data: { team: 'N' } },
        getLatLng: () => ({ lat: -6.3, lng: 106.9 })
    });
    assert.equal(p.lat, -6.3);
    assert.equal(p.lng, 106.9);
});

test('team angka 1/2/3 dipetakan ke R/E/M', () => {
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 1 } } }).t, 'R');
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 2 } } }).t, 'E');
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 3 } } }).t, 'M');
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 0 } } }).t, 'N');
});

test('portal tanpa koordinat dibuang', () => {
    assert.equal(bridge.portalToPayload('g', { options: { data: { title: 'x' } } }), null);
});

test('collectPortals membatasi jumlah dan mengurutkan yang terdekat', () => {
    const map = {};
    for (let i = 0; i < 10; i++) {
        map['g' + i] = { options: { data: { lat: -6.2 + i * 0.01, lng: 106.8, team: 'R' } } };
    }
    const out = bridge.collectPortals(map, -6.2, 106.8, 3);
    assert.equal(out.length, 3);
    assert.equal(out[0].g, 'g0');
    assert.equal(out[2].g, 'g2');
    assert.equal(out[0]._d, undefined, 'field internal _d harus dibuang');
});

test('throttle: kiriman identik ditolak, kiriman baru dalam 15 detik ditolak', () => {
    const state = { lastSentMs: 0, lastPayload: null };
    const payload = '{"a":1}';
    assert.equal(bridge.shouldSend(state, 1000, payload), true);
    state.lastSentMs = 1000;
    state.lastPayload = payload;
    assert.equal(bridge.shouldSend(state, 2000, payload), false, 'isi sama harus ditolak');
    assert.equal(bridge.shouldSend(state, 5000, '{"a":2}'), false, 'belum 15 detik harus ditolak');
    assert.equal(bridge.shouldSend(state, 20000, '{"a":2}'), true, 'lewat 15 detik + isi beda harus lolos');
});

test('payload punya versi, timestamp, bbox, dan array portals', () => {
    const json = bridge.buildPayload([{ g: 'x' }], [1, 2, 3, 4], 1700000000000);
    const obj = JSON.parse(json);
    assert.equal(obj.v, 1);
    assert.equal(obj.ts, 1700000000000);
    assert.deepEqual(obj.bbox, [1, 2, 3, 4]);
    assert.equal(obj.portals.length, 1);
});

console.log(failures === 0 ? '\nSEMUA LULUS' : '\n' + failures + ' TEST GAGAL');
process.exit(failures === 0 ? 0 : 1);
