// runner.js
// Runs programs on a canvas: the main thread's half of the frame protocol
// with worker.js (see architecture.md, "The frame protocol").
//
// Owns: the worker and its SharedArrayBuffer, the run state machine
// (loading → idle ⇄ running, or failed), run ids, rendering and acking
// each frame, Stop, and a run asked for before the VM is ready, which
// starts as soon as it is.
//
// The page owns everything a learner sees about a run (status line, output,
// error marks) and hears about it through the callbacks. Used by app.js
// (the editor page) and library-page.js (/library).

export function createRunner({
    renderer,
    canvasSize,               // () => {width, height}: what screen_width() and screen_height() report
    onState   = () => {},     // (state) the state changed
    onReady   = () => {},     // (msg) the VM loaded; msg is worker.js's "ready" message
    onFail    = () => {},     // (detail) the VM could not load
    onStart   = () => {},     // (meta) a run began; meta is what run() was given
    onPrint   = () => {},     // (lines, meta) the run printed
    onDone    = () => {},     // ({stopped, elapsed}, meta) the run finished or was stopped
    onError   = () => {},     // ({message, line, usage}, meta) the run threw
}) {
    let state = 'loading';    // 'loading' | 'idle' | 'running' | 'failed'
    let runId = 0;
    let current = null;       // meta of the run in progress, or of the last one
    let pending = null;       // {code, meta} asked for while loading
    let stopRequested = false;
    let startedAt = 0;
    let sab, sabI32, worker;

    function setState(next) {
        state = next;
        onState(next);
    }

    function signalStop() {
        Atomics.store(sabI32, 1, 1);
        Atomics.notify(sabI32, 0);   // wake the worker if it's waiting on a frame ack
    }

    function fail(detail) {
        setState('failed');
        onFail(detail);
    }

    // Runs code on the canvas; meta comes back with every callback about
    // this run. Run while running restarts: stop the current run, then
    // queue the new one. The worker clears the stop flag when it picks up
    // the new message. Returns false if the VM failed to load.
    function run(code, meta = {}) {
        if (state === 'failed') return false;
        if (state === 'loading') {
            pending = { code, meta };
            return true;
        }
        if (state === 'running') signalStop();

        runId++;
        current = meta;
        stopRequested = false;
        startedAt = performance.now();
        setState('running');
        onStart(meta);
        const { width, height } = canvasSize();
        worker.postMessage({ type: 'run', runId, code, sab, canvasWidth: width, canvasHeight: height });
        return true;
    }

    function stop() {
        if (state !== 'running') return;
        stopRequested = true;
        signalStop();
    }

    function onMessage(e) {
        const msg = e.data;

        if (msg.type === 'frame') {
            // Always render and ack, even a straggler from a replaced run:
            // the worker blocks until it gets the ack.
            renderer.applyFrame(msg.segments, msg.turtles, msg.bgcolor);
            Atomics.store(sabI32, 0, 1);
            Atomics.notify(sabI32, 0);
            return;
        }

        if (msg.type === 'ready') {
            setState('idle');
            onReady(msg);
            if (pending) {
                const { code, meta } = pending;
                pending = null;
                run(code, meta);
            }
            return;
        }

        if (msg.type === 'init-error') {
            fail(msg.message);
            return;
        }

        // Everything below belongs to a run; ignore replies from a replaced one.
        if (msg.runId !== runId) return;

        if (msg.type === 'print') {
            onPrint(msg.lines, current);
        } else if (msg.type === 'done') {
            setState('idle');
            onDone({ stopped: stopRequested, elapsed: performance.now() - startedAt }, current);
        } else if (msg.type === 'error') {
            setState('idle');
            onError({ message: msg.message, line: msg.line, usage: msg.usage }, current);
        }
    }

    // Starts the VM, unless the page isn't cross-origin isolated, which the
    // frame protocol needs: then returns false and stays loading.
    function start() {
        if (typeof SharedArrayBuffer === 'undefined') return false;
        sab    = new SharedArrayBuffer(8);   // [FRAME_ACK, STOP_FLAG]
        sabI32 = new Int32Array(sab);
        worker = new Worker(new URL('./worker.js', import.meta.url));
        worker.onmessage = onMessage;
        worker.onerror   = (e) => fail(e.message || 'the worker script failed');
        worker.postMessage({ type: 'init' });
        return true;
    }

    return {
        start,
        run,
        stop,
        fail,
        state: () => state,
    };
}
