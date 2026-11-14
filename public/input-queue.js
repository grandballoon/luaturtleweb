// input-queue.js
// The program's input, carried from the main thread to the worker while the
// worker's Lua program is running or blocked (see architecture.md, "Input
// and controls"). A worker blocked in Atomics.wait never sees a postMessage,
// so pointer and key events go through shared memory instead.
//
// One SharedArrayBuffer per runner, laid out as
//   Int32 [LOCK, LENGTH, SEQ, unused]  then  DATA_BYTES bytes of events
// Events are JSON lines appended under a spinlock: the main thread pushes,
// the worker drains them all at once and empties the buffer. SEQ goes up on
// every push (and on wake()), so the worker can sleep on it until something
// arrives; the lock is held only for a copy, so the main thread's spin is
// brief. A full buffer drops new events rather than block the page.
//
// Shared by runner.js (main thread, ES module) and worker.js (a classic
// worker, which loads it with import()); covered by test/input_test.mjs.

const LOCK = 0, LENGTH = 1, SEQ = 2;
const HEADER_BYTES = 16;
export const DATA_BYTES = 64 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// A queue over `sab`, or over a new buffer if none is given.
export function inputQueue(sab = new SharedArrayBuffer(HEADER_BYTES + DATA_BYTES)) {
    return {
        sab,
        header: new Int32Array(sab, 0, 4),
        data:   new Uint8Array(sab, HEADER_BYTES),
    };
}

function lock(q) {
    while (Atomics.compareExchange(q.header, LOCK, 0, 1) !== 0) { /* the other side copies; spin */ }
}

function unlock(q) {
    Atomics.store(q.header, LOCK, 0);
}

// Appends one event and wakes the worker. Returns false if it didn't fit.
export function pushEvent(q, event) {
    const bytes = encoder.encode(JSON.stringify(event) + '\n');
    lock(q);
    const length = Atomics.load(q.header, LENGTH);
    const fits = length + bytes.length <= q.data.length;
    if (fits) {
        q.data.set(bytes, length);
        Atomics.store(q.header, LENGTH, length + bytes.length);
    }
    unlock(q);
    if (fits) wake(q);
    return fits;
}

// Takes every waiting event, oldest first, and empties the queue.
export function drainEvents(q) {
    lock(q);
    const length = Atomics.load(q.header, LENGTH);
    // TextDecoder won't read shared memory, so copy out first.
    const bytes = q.data.slice(0, length);
    Atomics.store(q.header, LENGTH, 0);
    unlock(q);
    if (length === 0) return [];
    return decoder.decode(bytes).split('\n').filter(Boolean).map(line => JSON.parse(line));
}

// The push count, for waitForEvents.
export function sequence(q) {
    return Atomics.load(q.header, SEQ);
}

// Wakes a worker waiting on the queue, with or without an event: Stop uses
// it to end the event loop's wait.
export function wake(q) {
    Atomics.add(q.header, SEQ, 1);
    Atomics.notify(q.header, SEQ);
}

// Worker only: sleeps until the push count is no longer `seen`, or for at
// most `timeoutMs`.
export function waitForEvents(q, seen, timeoutMs = Infinity) {
    Atomics.wait(q.header, SEQ, seen, timeoutMs);
}
