/*
 * Bridge logic tests (node --test friendly, run: node mobile/tests/iitc-auto-bridge.test.mjs)
 * The logic is taken from the real userscript through a vm sandbox, not a copy — so the tests
 * cannot "pass" while the actual code differs.
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

test('portal latE6/lngE6 is converted to degrees', () => {
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

test('portal without latE6 falls back to plain lat/lng', () => {
    const p = bridge.portalToPayload('guid-2', { options: { data: { lat: -6.2, lng: 106.8, team: 'E' } } });
    assert.equal(p.lat, -6.2);
    assert.equal(p.t, 'E');
});

test('falls back to layer.getLatLng() when the data is incomplete', () => {
    const p = bridge.portalToPayload('guid-3', {
        options: { data: { team: 'N' } },
        getLatLng: () => ({ lat: -6.3, lng: 106.9 })
    });
    assert.equal(p.lat, -6.3);
    assert.equal(p.lng, 106.9);
});

test('numeric team 1/2/3 maps to R/E/M', () => {
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 1 } } }).t, 'R');
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 2 } } }).t, 'E');
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 3 } } }).t, 'M');
    assert.equal(bridge.portalToPayload('g', { options: { data: { lat: 0, lng: 0, team: 0 } } }).t, 'N');
});

test('portal without coordinates is dropped', () => {
    assert.equal(bridge.portalToPayload('g', { options: { data: { title: 'x' } } }), null);
});

test('collectPortals caps the count and sorts the closest ones first', () => {
    const map = {};
    for (let i = 0; i < 10; i++) {
        map['g' + i] = { options: { data: { lat: -6.2 + i * 0.01, lng: 106.8, team: 'R' } } };
    }
    const out = bridge.collectPortals(map, -6.2, 106.8, 3);
    assert.equal(out.length, 3);
    assert.equal(out[0].g, 'g0');
    assert.equal(out[2].g, 'g2');
    assert.equal(out[0]._d, undefined, 'the internal _d field must be removed');
});

test('throttle: an identical send is rejected, a new send within 15 seconds is rejected', () => {
    const state = { lastSentMs: 0, lastPayload: null };
    const payload = '{"a":1}';
    assert.equal(bridge.shouldSend(state, 1000, payload), true);
    state.lastSentMs = 1000;
    state.lastPayload = payload;
    assert.equal(bridge.shouldSend(state, 2000, payload), false, 'same content must be rejected');
    assert.equal(bridge.shouldSend(state, 5000, '{"a":2}'), false, 'less than 15 seconds must be rejected');
    assert.equal(bridge.shouldSend(state, 20000, '{"a":2}'), true, 'past 15 seconds + different content must pass');
});

test('payload carries version, timestamp, bbox, and the portals array', () => {
    const json = bridge.buildPayload([{ g: 'x' }], [1, 2, 3, 4], 1700000000000);
    const obj = JSON.parse(json);
    assert.equal(obj.v, 1);
    assert.equal(obj.ts, 1700000000000);
    assert.deepEqual(obj.bbox, [1, 2, 3, 4]);
    assert.equal(obj.portals.length, 1);
});

console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' TESTS FAILED');
process.exit(failures === 0 ? 0 : 1);
