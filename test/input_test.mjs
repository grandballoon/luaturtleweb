// test/input_test.mjs
//
// A running program's input on the main thread: the shared-memory queue
// that carries it to the worker (public/input-queue.js), and the pure
// decisions about which keys and presses are the program's
// (public/input-events.js). Also that a recorded preview frames the
// program's controls (public/recording.js).
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/input_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inputQueue, pushEvent, drainEvents, sequence, wake, waitForEvents, DATA_BYTES } from '../public/input-queue.js';
import { keyName, keyText, keyEvent, widgetAt, claimsPress, cursorAt } from '../public/input-events.js';
import { drawingBounds } from '../public/recording.js';

// ---- The queue ----

test('events come out in order, once, as they went in', () => {
    const q = inputQueue();
    pushEvent(q, { type: 'down', x: 1, y: -2 });
    pushEvent(q, { type: 'key', key: 'a', text: 'é' });
    assert.deepEqual(drainEvents(q), [{ type: 'down', x: 1, y: -2 }, { type: 'key', key: 'a', text: 'é' }]);
    assert.deepEqual(drainEvents(q), []);
});

test('a second view of the same buffer sees the same queue, as the worker does', () => {
    const main = inputQueue();
    const worker = inputQueue(main.sab);
    pushEvent(main, { type: 'blur' });
    assert.deepEqual(drainEvents(worker), [{ type: 'blur' }]);
});

test('a full queue drops new events rather than block', () => {
    const q = inputQueue();
    const event = { type: 'move', x: 123456, y: 654321 };
    const size = JSON.stringify(event).length + 1;
    let pushed = 0;
    while (pushEvent(q, event)) pushed++;
    assert.equal(pushed, Math.floor(DATA_BYTES / size));
    assert.equal(drainEvents(q).length, pushed);
    assert.equal(pushEvent(q, event), true, 'room again once drained');
});

test('every push and every wake moves the sequence, so a wait for it returns', () => {
    const q = inputQueue();
    const start = sequence(q);
    pushEvent(q, { type: 'blur' });
    assert.equal(sequence(q), start + 1);
    wake(q);
    assert.equal(sequence(q), start + 2);
    waitForEvents(q, start);   // returns at once: the sequence has moved on
});

// ---- Keys ----

test('keys get turtle/ui.lua’s names, and Tab and Escape stay the page’s', () => {
    assert.equal(keyName('ArrowLeft'), 'left');
    assert.equal(keyName(' '), 'space');
    assert.equal(keyName('Enter'), 'return');
    assert.equal(keyName('A'), 'a');
    assert.equal(keyName('F5'), 'f5');
    assert.equal(keyName('Tab'), null);
    assert.equal(keyName('Escape'), null);
    assert.equal(keyName('Meta'), null);
    assert.equal(keyText('A'), 'A');
    assert.equal(keyText('😀'), '😀');
    assert.equal(keyText('ArrowLeft'), null);
});

test('a key with ⌘ or Ctrl is a shortcut, not the program’s', () => {
    assert.deepEqual(keyEvent({ key: 'A' }, 'key'), { type: 'key', key: 'a', text: 'A' });
    assert.deepEqual(keyEvent({ key: 'A' }, 'keyup'), { type: 'keyup', key: 'a' });
    assert.equal(keyEvent({ key: 'Enter', metaKey: true }, 'key'), null);
    assert.equal(keyEvent({ key: 'k', ctrlKey: true }, 'key'), null);
    assert.equal(keyEvent({ key: 'a', isComposing: true }, 'key'), null);
});

// ---- Presses ----

const button = { kind: 'button', x: 0, y: 0, w: 100, h: 30 };
const field  = { kind: 'textfield', x: 50, y: -10, w: 100, h: 28 };

test('a widget is hit inside its box, topmost first', () => {
    const ui = { widgets: [button, field], active: true };
    assert.equal(widgetAt(ui, 10, -10), button);
    assert.equal(widgetAt(ui, 60, -20), field, 'the later widget is on top');
    assert.equal(widgetAt(ui, 10, 5), null, 'above the box');
    assert.equal(widgetAt({ widgets: {}, active: true }, 0, 0), null, "Wasmoon's empty table");
});

test('the program claims presses on its controls, or anywhere once it takes clicks', () => {
    const ui = { widgets: [button], pointer: false, active: true };
    assert.equal(claimsPress(ui, 10, -10), true);
    assert.equal(claimsPress(ui, 300, 300), false, 'the canvas pans elsewhere');
    assert.equal(claimsPress({ ...ui, pointer: true }, 300, 300), true);
    assert.equal(claimsPress({ ...ui, active: false }, 10, -10), false, 'not while it isn’t listening');
    assert.equal(claimsPress(null, 0, 0), false);
});

test('the cursor shows what a press would do', () => {
    const ui = { widgets: [button, field], pointer: false, active: true };
    assert.equal(cursorAt(ui, 10, -5), 'pointer');
    assert.equal(cursorAt(ui, 140, -20), 'text');
    assert.equal(cursorAt(ui, 300, 300), '');
    assert.equal(cursorAt({ ...ui, pointer: true }, 300, 300), 'default');
});

// ---- Previews ----

test('a recorded preview frames the program’s controls with its drawing', () => {
    const frame = { segments: [], turtles: [], ui: { widgets: [{ x: -100, y: 160, w: 200, h: 38 }] } };
    assert.deepEqual(drawingBounds([frame]), { minX: -100, minY: 122, maxX: 100, maxY: 160 });
});
