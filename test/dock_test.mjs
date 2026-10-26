// test/dock_test.mjs
//
// The height of a docked panel (public/dock.js): the reference under the
// editor and the terminal under the canvas.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/dock_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { dockHeight, HEADER_HEIGHT } = await import('../public/dock.js');

const panel = { open: true, stored: NaN, defaultHeight: 320, minHeight: 180, available: 800 };

test('collapsed, only the header shows', () => {
    assert.equal(dockHeight({ ...panel, open: false, stored: 500 }), HEADER_HEIGHT);
});

test('open, it is the default height until dragged, then the dragged height', () => {
    assert.equal(dockHeight(panel), 320);
    assert.equal(dockHeight({ ...panel, stored: 410.6 }), 411);
});

test('until dragged, it takes no more than its share of a short column', () => {
    const share = { ...panel, defaultShare: 0.45 };
    assert.equal(dockHeight({ ...share, available: 1000 }), 320);
    assert.equal(dockHeight({ ...share, available: 600 }), 270);
    assert.equal(dockHeight({ ...share, available: 300 }), 180);
    assert.equal(dockHeight({ ...share, available: 600, stored: 400 }), 400);
});

test('it never gets shorter than its minimum', () => {
    assert.equal(dockHeight({ ...panel, stored: 40 }), 180);
});

test('it always leaves some of its column showing', () => {
    assert.equal(dockHeight({ ...panel, stored: 790 }), 740);
    assert.equal(dockHeight({ ...panel, available: 300 }), 240);
});

test('in a column too short for both, its minimum wins', () => {
    assert.equal(dockHeight({ ...panel, available: 150 }), 180);
});
