// test/floating_test.mjs
//
// Where a floating panel sits (public/floating.js): it always fits the
// window, however it is dragged, resized from any edge or corner, or
// restored on a smaller screen.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/floating_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { clampRect, defaultRect, dragRect, resizeRect, edgesOf, readRect, MARGIN, MIN_SIZE } = await import('../public/floating.js');

const view = { width: 1200, height: 800 };
const box = { x: 100, y: 100, width: 400, height: 500 };

test('a box that fits is left alone', () => {
    assert.deepEqual(clampRect(box, view), box);
});

test('a box hanging off an edge moves back inside the margin', () => {
    assert.deepEqual(clampRect({ ...box, x: 1000, y: -50 }, view), { ...box, x: 1200 - MARGIN - 400, y: MARGIN });
    assert.deepEqual(clampRect({ ...box, x: -300, y: 700 }, view), { ...box, x: MARGIN, y: 800 - MARGIN - 500 });
});

test('a box bigger than the window shrinks to fit it', () => {
    assert.deepEqual(clampRect({ x: 0, y: 0, width: 5000, height: 5000 }, view),
        { x: MARGIN, y: MARGIN, width: 1200 - 2 * MARGIN, height: 800 - 2 * MARGIN });
});

test('a box is never smaller than the minimum, unless the window is', () => {
    assert.deepEqual(clampRect({ ...box, width: 10, height: 10 }, view), { ...box, ...MIN_SIZE });
    const tiny = { width: 200, height: 150 };
    assert.deepEqual(clampRect(box, tiny), { x: MARGIN, y: MARGIN, width: 200 - 2 * MARGIN, height: 150 - 2 * MARGIN });
});

test('a panel first floats along the right edge, below the header', () => {
    assert.deepEqual(defaultRect(view, 48), { x: 1200 - MARGIN - 440, y: 48 + MARGIN, width: 440, height: 800 - 48 - 2 * MARGIN });
    // On a narrow window it takes 40% of the width, but no less than the minimum.
    assert.equal(defaultRect({ width: 900, height: 700 }, 48).width, 360);
    assert.equal(defaultRect({ width: 500, height: 700 }, 48).width, MIN_SIZE.width);
});

test('dragging moves the box, but not out of the window', () => {
    assert.deepEqual(dragRect(box, 50, -20, view), { ...box, x: 150, y: 80 });
    assert.deepEqual(dragRect(box, 5000, 5000, view), { ...box, x: 1200 - MARGIN - 400, y: 800 - MARGIN - 500 });
    assert.deepEqual(dragRect(box, -5000, -5000, view), { ...box, x: MARGIN, y: MARGIN });
});

const held = (...names) => ({ left: false, right: false, top: false, bottom: false,
    ...Object.fromEntries(names.map((n) => [n, true])) });

test('the right and bottom edges grow the box away from its top left', () => {
    assert.deepEqual(resizeRect(box, held('right'), 100, 999, view), { ...box, width: 500 });
    assert.deepEqual(resizeRect(box, held('bottom'), 999, 50, view), { ...box, height: 550 });
    assert.deepEqual(resizeRect(box, held('right', 'bottom'), 100, 50, view), { ...box, width: 500, height: 550 });
});

test('the left and top edges grow it the other way, its bottom right staying put', () => {
    assert.deepEqual(resizeRect(box, held('left'), -60, 0, view), { ...box, x: 40, width: 460 });
    assert.deepEqual(resizeRect(box, held('top'), 0, -60, view), { ...box, y: 40, height: 560 });
    assert.deepEqual(resizeRect(box, held('top', 'left'), 30, 30, view), { x: 130, y: 130, width: 370, height: 470 });
});

test('a panel against the right edge can still be widened, from its left', () => {
    const docked = { x: 1200 - MARGIN - 400, y: MARGIN, width: 400, height: 800 - 2 * MARGIN };
    assert.deepEqual(resizeRect(docked, held('right', 'bottom'), 200, 200, view), docked);
    assert.deepEqual(resizeRect(docked, held('left'), -500, 0, view), { ...docked, x: docked.x - 500, width: 900 });
});

test('a held edge stops at the window margin', () => {
    assert.deepEqual(resizeRect(box, held('right', 'bottom'), 5000, 5000, view),
        { ...box, width: 1200 - MARGIN - 100, height: 800 - MARGIN - 100 });
    assert.deepEqual(resizeRect(box, held('left', 'top'), -5000, -5000, view),
        { x: MARGIN, y: MARGIN, width: 500 - MARGIN, height: 600 - MARGIN });
});

test('a held edge stops where the box would get smaller than the minimum', () => {
    assert.deepEqual(resizeRect(box, held('right', 'bottom'), -5000, -5000, view), { ...box, ...MIN_SIZE });
    assert.deepEqual(resizeRect(box, held('left', 'top'), 5000, 5000, view),
        { x: 500 - MIN_SIZE.width, y: 600 - MIN_SIZE.height, ...MIN_SIZE });
});

test("a handle's data-edges name the edges it holds", () => {
    assert.deepEqual(edgesOf('top left'), held('top', 'left'));
    assert.deepEqual(edgesOf('right'), held('right'));
    assert.deepEqual(edgesOf(''), held());
});

test('a stored box is read back only if it is one', () => {
    assert.deepEqual(readRect(box), box);
    assert.deepEqual(readRect({ ...box, extra: 1 }), box);
    assert.equal(readRect(null), null);
    assert.equal(readRect('docked'), null);
    assert.equal(readRect({ x: 1, y: 2, width: '3', height: 4 }), null);
    assert.equal(readRect({ x: 1, y: 2, width: NaN, height: 4 }), null);
});
