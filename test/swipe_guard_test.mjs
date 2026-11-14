// test/swipe_guard_test.mjs
//
// When a sideways wheel scroll is cancelled so Safari doesn't go back or
// forward in its history (public/swipe-guard.js): only when it is mostly
// sideways and nothing under the pointer can scroll further that way.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/swipe_guard_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { canScrollSideways, shouldBlockSwipe, needsSwipeGuard } = await import('../public/swipe-guard.js');

const still   = { overflowX: 'visible', scrollLeft: 0, scrollWidth: 800, clientWidth: 800 };
const hidden  = { overflowX: 'hidden', scrollLeft: 100, scrollWidth: 1200, clientWidth: 800 };
const atLeft  = { overflowX: 'auto', scrollLeft: 0, scrollWidth: 1200, clientWidth: 800 };
const middle  = { overflowX: 'auto', scrollLeft: 200, scrollWidth: 1200, clientWidth: 800 };
const atRight = { overflowX: 'scroll', scrollLeft: 400, scrollWidth: 1200, clientWidth: 800 };

test('a box that does not scroll sideways never scrolls', () => {
    assert.equal(canScrollSideways(still, -10), false);
    assert.equal(canScrollSideways(still, 10), false);
    assert.equal(canScrollSideways(hidden, -10), false);
});

test('a scroller scrolls toward whichever edge it is not at', () => {
    assert.equal(canScrollSideways(atLeft, -10), false);
    assert.equal(canScrollSideways(atLeft, 10), true);
    assert.equal(canScrollSideways(middle, -10), true);
    assert.equal(canScrollSideways(middle, 10), true);
    assert.equal(canScrollSideways(atRight, -10), true);
    assert.equal(canScrollSideways(atRight, 10), false);
});

test('within a pixel of an edge counts as at it', () => {
    assert.equal(canScrollSideways({ ...atLeft, scrollLeft: 0.5 }, -10), false);
    assert.equal(canScrollSideways({ ...atRight, scrollLeft: 399.5 }, 10), false);
});

test('a sideways swipe over nothing that scrolls is cancelled', () => {
    assert.equal(shouldBlockSwipe({ dx: -30, dy: 2 }, [still, hidden]), true);
    assert.equal(shouldBlockSwipe({ dx: 30, dy: 0 }, []), true);
});

test('a sideways swipe is cancelled once its scroller reaches the edge', () => {
    assert.equal(shouldBlockSwipe({ dx: -30, dy: 0 }, [atLeft, still]), true);
    assert.equal(shouldBlockSwipe({ dx: 30, dy: 0 }, [atRight, still]), true);
});

test('a sideways swipe that any box can still scroll is left alone', () => {
    assert.equal(shouldBlockSwipe({ dx: -30, dy: 0 }, [still, middle]), false);
    assert.equal(shouldBlockSwipe({ dx: 30, dy: 0 }, [atLeft]), false);
});

test('a mostly vertical scroll is left alone', () => {
    assert.equal(shouldBlockSwipe({ dx: 0, dy: 40 }, [still]), false);
    assert.equal(shouldBlockSwipe({ dx: -20, dy: 20 }, [still]), false);
});

test('only Safari, the browser with GestureEvent, needs the guard', () => {
    assert.equal(needsSwipeGuard({ GestureEvent: function () {} }), true);
    assert.equal(needsSwipeGuard({}), false);
});
