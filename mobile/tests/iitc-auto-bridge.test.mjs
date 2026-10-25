// SPDX-License-Identifier: ISC
// Copyright (c) 2026 Acunet — IITC Auto, a fork of IITC-CE (see NOTICE.md)

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

/**
 * Minimal fake DOM for the ops-target button: IITC's panel only has to behave like an element that
 * can hold children, and created nodes have to be findable by id afterwards.
 */
function fakePanelDom(hasPanel = true) {
    const byId = {};
    const makeNode = () => ({
        id: '', textContent: '', style: {}, onclick: null, parentNode: null,
        get children() { return this._children || (this._children = []); }
    });
    const panel = makeNode();
    panel.appendChild = function (node) {
        if (node.id) byId[node.id] = node;
        this.children.push(node);
        node.parentNode = this;
    };
    panel.removeChild = function (node) {
        this._children = this.children.filter((c) => c !== node);
        if (node.id) delete byId[node.id];
        node.parentNode = null;
    };
    if (hasPanel) byId.portaldetails = panel;
    return {
        panel,
        document: {
            getElementById: (id) => byId[id] || null,
            createElement: () => makeNode()
        }
    };
}

/** Loads the real userscript in a sandbox that also has a document and the native bridge. */
function loadWithDom(dom, app) {
    const sandbox = { console, Date, JSON, Object, Math, String, isFinite, document: dom.document, app };
    sandbox.window = { console, document: dom.document, app };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return sandbox;
}

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

test('ops target button is added to IITC panel and flips when clicked', () => {
    const dom = fakePanelDom(true);
    const calls = [];
    let isTarget = false;
    const app = {
        isOpsTarget: () => isTarget,
        toggleOpsTarget: (guid) => { calls.push(guid); isTarget = !isTarget; return isTarget; }
    };
    const sandbox = loadWithDom(dom, app);
    sandbox.window.selectedPortal = 'guid-target-1';

    sandbox.window.__iitcAutoBridge.renderOpsTargetButton();
    const button = dom.document.getElementById('iitc-auto-target');
    assert.ok(button, 'the button must be appended to #portaldetails');
    assert.match(button.textContent, /set as ops target/, 'a portal that is not a target must offer to set it');

    button.onclick();
    assert.deepEqual(calls, ['guid-target-1'], 'clicking must toggle exactly that portal guid');
    assert.equal(isTarget, true);
    // The script redraws the button (a new node) instead of mutating it, so read it back from the DOM.
    const flipped = dom.document.getElementById('iitc-auto-target');
    assert.match(flipped.textContent, /ops target — tap to remove/, 'the label must flip to the target state');
    assert.equal(dom.panel.children.length, 1, 'a redraw must not pile buttons up in the panel');

    flipped.onclick();
    assert.deepEqual(calls, ['guid-target-1', 'guid-target-1'], 'a second click must toggle it back');
    assert.equal(isTarget, false);
});

test('ops target button draws no button (and does not throw) without a panel or a selection', () => {
    const noPanel = fakePanelDom(false);
    const noSelection = fakePanelDom(true);
    const app = { isOpsTarget: () => false, toggleOpsTarget: () => false };

    const a = loadWithDom(noPanel, app);
    a.window.selectedPortal = 'guid-1';
    a.window.__iitcAutoBridge.renderOpsTargetButton();
    assert.equal(noPanel.document.getElementById('iitc-auto-target'), null, 'no panel -> no button');

    const b = loadWithDom(noSelection, app);
    b.window.selectedPortal = null;
    b.window.__iitcAutoBridge.renderOpsTargetButton();
    assert.equal(noSelection.document.getElementById('iitc-auto-target'), null, 'no selection -> no button');
    assert.equal(noSelection.panel.children.length, 0);
});

console.log(failures === 0 ? '\nALL PASSED' : '\n' + failures + ' TESTS FAILED');
process.exit(failures === 0 ? 0 : 1);
