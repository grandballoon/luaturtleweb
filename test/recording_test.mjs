// test/recording_test.mjs
//
// The pure functions over a recorded program (public/recording.js): its
// drawing's extent, when each frame goes up, the view that fits it, and
// which frame each tick of a preview video shows.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/recording_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { items, drawingBounds, frameTimes, frameAt, fitView, videoFrames } from '../public/recording.js';

const frame = (segments = [], turtles = [], work = 0, delay = 0) => ({ segments, turtles, work, delay });

test('items reads arrays and the objects Wasmoon makes of empty tables', () => {
    assert.deepEqual(items([1, 2]), [1, 2]);
    assert.deepEqual(items({}), []);
    assert.deepEqual(items(null), []);
});

test('the bounds take in lines by half their width, dots, and visible turtles', () => {
    const bounds = drawingBounds([
        frame([{ type: 'line', from: [0, 0], to: [100, 0], width: 4 }]),
        frame([{ type: 'dot', pos: [0, 50], size: 10 }], [{ x: -20, y: 0, visible: true }, { x: 500, y: 0, visible: false }]),
    ]);
    assert.deepEqual(bounds, { minX: -30, minY: -10, maxX: 102, maxY: 55 });
    assert.deepEqual(drawingBounds([frame()]), { minX: 0, minY: 0, maxX: 0, maxY: 0 });
});

test('frames go up after their work, and the next after the pause before it', () => {
    const frames = [frame(), frame([], [], 3, 10), frame([], [], 2, 0)];
    assert.deepEqual(frameTimes(frames, { startHold: 100 }), [0, 103, 115.5]);
    assert.deepEqual(frameTimes(frames, { measured: false }), [0, 0, 10.5]);
});

test('frameAt finds the frame on screen at a time', () => {
    const times = [0, 100, 200];
    assert.equal(frameAt(times, 0), 0);
    assert.equal(frameAt(times, 99), 0);
    assert.equal(frameAt(times, 100), 1);
    assert.equal(frameAt(times, 1e9), 2);
});

test('the view centers the drawing and scales it down to fit, never up', () => {
    assert.deepEqual(fitView({ minX: -400, minY: -100, maxX: 400, maxY: 100 }, 240, 180, 20), { scale: 0.25, centerX: 0, centerY: 0 });
    assert.deepEqual(fitView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 240, 180, 20), { scale: 1, centerX: 5, centerY: 5 });
});

test('a video holds the blank canvas, plays the drawing stretched or squeezed, then holds the end', () => {
    const timeline = { fps: 10, startHold: 200, endHold: 300, minDraw: 1000, maxDraw: 2000 };
    // 500 ms of drawing stretches to 1000: frame 1 goes up at 0, frame 2 at 250 ms (500 stretched).
    const quick = videoFrames([0, 0, 250, 500], timeline);
    assert.equal(quick.length, 15);   // (200 + 1000 + 300) ms at 10 fps
    assert.deepEqual(quick, [0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3]);
    // 4000 ms squeezes to 2000.
    assert.equal(videoFrames([0, 4000], timeline).length, 25);
    // Drawn in one frame: only the finished drawing.
    assert.deepEqual(videoFrames([0, 0], timeline), [1, 1, 1, 1, 1]);
});
