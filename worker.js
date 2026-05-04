// worker.js
// Web Worker: loads Wasmoon (Lua 5.4 WASM), runs user code,
// drives the frame protocol with the main thread via SharedArrayBuffer.
//
// Frame protocol (sab = SharedArrayBuffer(8), two Int32 slots):
//   sab[0] = FRAME_ACK  — main thread sets to 1 after rendering, worker resets to 0
//   sab[1] = STOP_FLAG  — main thread sets to 1 when Stop is clicked
//
// Each animation substep in turtle_web.lua calls _bridge_post_frame() (a JS
// function exposed as a Lua global). That function:
//   1. Posts a {type:"frame", ...} message to the main thread with the current
//      visible segment list, turtle states, and bgcolor.
//   2. Calls Atomics.wait(sabI32, 0, 0) to block until the main thread acks.
//   3. After waking, checks sabI32[1] (stop flag) and throws if set.
//
// Messages sent TO main thread:
//   {type: "ready"}                        — Wasmoon loaded, VM ready
//   {type: "frame", segments, turtles, bgcolor, segmentCount}
//   {type: "done"}                         — user code completed normally
//   {type: "error", message}               — user code threw an error
//   {type: "print", lines}                 — buffered print() output
//
// Messages received FROM main thread:
//   {type: "run", code, sab}              — run user code; sab is the SharedArrayBuffer
//   {type: "stop"}                        — redundant (sab[1] is the primary stop mechanism)

importScripts('./wasmoon.js');

let lua        = null;
let sabI32     = null;   // Int32Array view of the SharedArrayBuffer
let printLines = [];     // buffered print() output, flushed with each frame

// ---- Wasmoon init ----

async function initLua() {
    const factory = new wasmoon.LuaFactory();
    lua = await factory.createEngine();

    // Mount all Lua source files.
    // turtle/ subdirectory — core, screen, colors are verbatim desktop files.
    const files = [
        'turtle/core.lua',
        'turtle/screen.lua',
        'turtle/colors.lua',
        'turtle/turtle_web.lua',
    ];
    for (const path of files) {
        const src = await fetch(path).then(r => {
            if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
            return r.text();
        });
        await factory.mountFile(path, src);
    }

    // Intercept Lua's print() to buffer output.
    await lua.doString(`
        _print_buffer = {}
        print = function(...)
            local parts = {}
            local args = {...}
            for i = 1, #args do parts[i] = tostring(args[i]) end
            table.insert(_print_buffer, table.concat(parts, "\\t"))
        end
    `);

    // Load turtle_web.lua (which requires core + screen + colors).
    await lua.doString(`require("turtle.turtle_web")`);

    // Expose _bridge_post_frame as a Lua global.
    // This is the only JS→Lua boundary for animation.
    lua.global.set('_bridge_post_frame', (delayMs) => {
        postFrameAndWait(delayMs);
    });

    postMessage({ type: 'ready' });
}

// ---- Frame protocol ----

function sleepMs(ms) {
    if (ms <= 0) return;
    const tmp = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(tmp, 0, 0, ms);
}

function postFrameAndWait(delayMs) {
    if (!sabI32) return;

    const segments = lua.global.get('_bridge_get_visible_segments')();
    const turtles  = lua.global.get('_bridge_get_turtle_states')();
    const bgcolor  = lua.global.get('_bridge_get_bgcolor')();

    const printBuf = lua.global.get('_print_buffer');
    const lines    = [];
    if (printBuf) {
        const n = typeof printBuf.length === 'number'
            ? printBuf.length : Object.keys(printBuf).length;
        for (let i = 0; i < n; i++) {
            const v = printBuf[i] ?? printBuf[i + 1];
            if (v != null) lines.push(String(v));
        }
    }
    lua.global.set('_print_buffer', []);
    if (lines.length > 0) postMessage({ type: 'print', lines });

    postMessage({ type: 'frame', segments, turtles, bgcolor });

    Atomics.wait(sabI32, 0, 0);
    Atomics.store(sabI32, 0, 0);

    // Delay AFTER the ack so the frame is already visible
    sleepMs(delayMs || 0);

    if (Atomics.load(sabI32, 1) === 1) {
        throw new Error('__STOPPED__');
    }
}

// ---- Run user code ----

async function runCode(code) {
    try {
        // Hard reset: rebuild screen + core, clear all state.
        lua.global.get('_bridge_hard_reset')();

        // Build sandbox env and load user code.
        await lua.doString(`
            local env = _turtle_make_env()

            local chunk, err = load(user_code, "user_code", "t", env)
            if not chunk then
                error("Syntax error: " .. tostring(err), 0)
            end

            local instruction_count = 0
            local LIMIT = 50000000
            debug.sethook(function()
                instruction_count = instruction_count + 1000
                if instruction_count >= LIMIT then
                    debug.sethook()
                    error("Possible infinite loop (exceeded " .. LIMIT .. " instructions)", 2)
                end
            end, "", 1000)

            local ok, run_err = pcall(chunk)
            debug.sethook()

            if not ok then
                -- Re-raise so the outer JS catch sees it.
                error(run_err, 0)
            end
        `);

        // Post final frame so the last state is rendered.
        postFrameAndWait();
        postMessage({ type: 'done' });

    } catch (err) {
        const msg = (err.message || String(err))
            .replace(/^.*Lua Error\([^)]*\):\s*/, '')
            .replace(/\[string "user_code"\]:\d+:\s*/, '');

        if (msg.includes('__STOPPED__')) {
            postMessage({ type: 'done' });  // clean stop, not an error
        } else {
            postMessage({ type: 'error', message: msg });
        }
    }
}

// ---- Message handler ----

self.onmessage = async (e) => {
    const msg = e.data;

    if (msg.type === 'init') {
        await initLua();

    } else if (msg.type === 'run') {
        sabI32 = new Int32Array(msg.sab);
        Atomics.store(sabI32, 0, 0);
        Atomics.store(sabI32, 1, 0);
        lua.global.set('user_code', msg.code);
        lua.global.set('_canvas_width',  msg.canvasWidth  || 0);
        lua.global.set('_canvas_height', msg.canvasHeight || 0);
        await runCode(msg.code);

    } else if (msg.type === 'stop') {
        // Belt-and-suspenders: main thread also sets sab[1] = 1 directly.
        if (sabI32) Atomics.store(sabI32, 1, 1);
    }
};