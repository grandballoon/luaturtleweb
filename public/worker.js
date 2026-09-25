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
//   {type: "ready", usage, demos}          — Wasmoon loaded, VM ready; usage maps
//                                            every command and alias to
//                                            {command, examples}; demos maps each
//                                            command-reference entry to its demo
//                                            program
//   {type: "init-error", message}          — the VM failed to load
//   {type: "frame", segments, turtles, bgcolor}
//   {type: "print", runId, lines}          — buffered print() output
//   {type: "done", runId}                  — user code finished or was stopped
//   {type: "error", runId, message, line, usage}
//                                          — user code threw; line is the 1-based
//                                            user_code line, or null if unknown;
//                                            usage is {command, examples} when a
//                                            turtle command rejected its arguments
//
//   {type: "recording", id, frames, error} — reply to "record": every frame the
//                                            program posted, in order, each as
//                                            {segments, turtles, bgcolor, prints,
//                                            work, delay}; error is the message if
//                                            the program threw, else null
//
// runId echoes the id of the run message, so the main thread can ignore
// stragglers from a run it has already replaced (Run pressed while running).
//
// Messages received FROM main thread:
//   {type: "run", runId, code, sab, canvasWidth, canvasHeight}
//   {type: "record", id, code, canvasWidth, canvasHeight}
//                                         — run code without pacing or blocking,
//                                           collecting its frames instead of
//                                           posting them (command-preview.js
//                                           plays them back)
//   {type: "stop"}                        — redundant (sab[1] is the primary stop mechanism)

importScripts('./wasmoon.js');

let lua        = null;
let sabI32     = null;   // Int32Array view of the SharedArrayBuffer
let runId      = 0;      // id of the run in progress, echoed in replies
let recording  = null;   // frames collected by a "record" request, or null in a live run
let recordedAt = 0;      // when the last recorded frame was taken (performance.now())

// A demo that is still drawing after this many frames is cut off there.
const MAX_RECORDED_FRAMES = 5000;

// ---- Wasmoon init ----

async function initLua() {
    // glue.wasm is vendored alongside wasmoon.js (both wasmoon 1.16.0). Passing the
    // local URL explicitly is what keeps it local: with no argument, LuaFactory falls
    // back to fetching the WASM from unpkg.com at runtime.
    const factory = new wasmoon.LuaFactory(new URL('./glue.wasm', self.location.href).href);
    lua = await factory.createEngine();

    // Mount all Lua source files.
    // turtle/ subdirectory — core, screen, colors are verbatim desktop files.
    const files = [
        'turtle/core.lua',
        'turtle/screen.lua',
        'turtle/colors.lua',
        'turtle/args.lua',
        'turtle/examples.lua',
        'turtle/demos.lua',
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
            for i = 1, select("#", ...) do parts[i] = tostring((select(i, ...))) end
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

    // Polled by the instruction hook so Stop also interrupts code that never
    // posts a frame (e.g. a tight loop with no drawing).
    // A recording ignores the flag: it is short, and no one can press Stop on it.
    lua.global.set('_bridge_stop_requested', () =>
        !recording && sabI32 !== null && Atomics.load(sabI32, 1) === 1);

    postMessage({
        type:  'ready',
        usage: lua.global.get('_bridge_get_usage_catalog')(),
        demos: lua.global.get('_bridge_get_demos')(),
    });
}

// ---- Print buffer ----

// Empties the print() buffer, returning its lines.
function takePrints() {
    const buf = lua.global.get('_print_buffer');
    lua.global.set('_print_buffer', []);
    if (!buf) return [];
    return (Array.isArray(buf) ? buf : Object.values(buf))
        .filter(v => v != null)
        .map(String);
}

// Posts any buffered print() output. Called with every frame and on every
// exit path, so output printed just before an error or stop still appears.
function flushPrints() {
    const lines = takePrints();
    if (lines.length > 0) postMessage({ type: 'print', runId, lines });
}

// ---- Error messages ----

// Turns a raw Wasmoon/Lua error into what a learner should read: no stack
// traceback, no chunk names, no locations inside the turtle library.
function cleanErrorMessage(raw) {
    return raw
        .replace(/^.*Lua Error\([^)]*\):\s*/, '')
        .replace(/\s*stack traceback:[\s\S]*$/, '')
        .replace(/\[string "user_code"\]:\d+:\s*/g, '')
        .replace(/(^|\s)(\.\/)?turtle\/[\w.]+\.lua:\d+:\s*/g, '$1')
        .trim();
}

// The rejected command's usage recorded by the error handler, as
// {command, examples: [string]}, or null if the error wasn't a misused
// turtle command (or the command has no examples).
function errorUsage() {
    const usage = lua.global.get('_user_error_usage');
    if (!usage || !usage.examples) return null;
    const examples = (Array.isArray(usage.examples) ? usage.examples : Object.values(usage.examples))
        .filter(v => v != null)
        .map(String);
    return examples.length ? { command: String(usage.command), examples } : null;
}

// ---- Frame protocol ----

function sleepMs(ms) {
    if (ms <= 0) return;
    const tmp = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(tmp, 0, 0, ms);
}

// What the canvas shows right now.
function snapshot() {
    return {
        segments: lua.global.get('_bridge_get_visible_segments')(),
        turtles:  lua.global.get('_bridge_get_turtle_states')(),
        bgcolor:  lua.global.get('_bridge_get_bgcolor')(),
    };
}

function postFrameAndWait(delayMs) {
    if (recording) return recordFrame(delayMs);
    if (!sabI32) return;

    const frame = snapshot();
    flushPrints();
    postMessage({ type: 'frame', ...frame });

    Atomics.wait(sabI32, 0, 0);
    Atomics.store(sabI32, 0, 0);

    // Delay AFTER the ack so the frame is already visible
    sleepMs(delayMs || 0);

    if (Atomics.load(sabI32, 1) === 1) {
        throw new Error('__STOPPED__');
    }
}

// A recorded frame keeps what a live one would post, plus the print() output
// that came before it, and the time a live run spends around it: work, the
// ms of computing since the previous frame (running Lua, taking this
// snapshot), and delay, the pause after it.
function recordFrame(delayMs) {
    if (recording.length >= MAX_RECORDED_FRAMES) throw new Error('__STOPPED__');
    const frame = { ...snapshot(), prints: takePrints(), delay: delayMs || 0 };
    const now = performance.now();
    frame.work = now - recordedAt;
    recordedAt = now;
    recording.push(frame);
}

// ---- Run user code ----

// Hard reset: rebuild screen + core, clear all state.
function resetVM() {
    lua.global.get('_bridge_hard_reset')();
    lua.global.set('_print_buffer', []);
}

// Runs the global user_code in a fresh sandbox, then posts the final frame.
// Throws whatever the program throws, including the __STOPPED__ sentinel.
async function execute() {
    // Build sandbox env and load user code.
    await lua.doString(`
        _user_error_line = nil
        _user_error_usage = nil
        local env = _turtle_make_env()

        local chunk, err = load(user_code, "user_code", "t", env)
        if not chunk then
            error("Syntax error: " .. tostring(err), 0)
        end

        local instruction_count = 0
        local LIMIT = 50000000
        debug.sethook(function()
            instruction_count = instruction_count + 1000
            if instruction_count % 10000 == 0 and _bridge_stop_requested() then
                debug.sethook()
                error("__STOPPED__", 0)
            end
            if instruction_count >= LIMIT then
                debug.sethook()
                error("Possible infinite loop (exceeded " .. LIMIT .. " instructions)", 2)
            end
        end, "", 1000)

        -- Record the innermost user_code line on the stack when the error
        -- is raised, so errors thrown inside the turtle library (bad
        -- arguments, say) still point at the learner's own line. A
        -- rejected turtle command also records how that command is called.
        local function locate(e)
            _user_error_usage = _bridge_command_usage(e)
            for level = 2, 200 do
                local info = debug.getinfo(level, "Sl")
                if not info then break end
                if info.source == "user_code" and info.currentline > 0 then
                    _user_error_line = info.currentline
                    break
                end
            end
            return e
        end

        local ok, run_err = xpcall(chunk, locate)
        debug.sethook()

        if not ok then
            -- Re-raise so the outer JS catch sees it.
            error(run_err, 0)
        end
    `);

    // Post final frame unless tracer(0) is active — in that case the user
    // must call update() explicitly, matching Python turtle behavior.
    if (lua.global.get('_bridge_get_tracer_n')() !== 0) postFrameAndWait();
}

async function runCode() {
    try {
        resetVM();
        await execute();
        flushPrints();
        postMessage({ type: 'done', runId });

    } catch (err) {
        const raw = err.message || String(err);
        flushPrints();

        if (raw.includes('__STOPPED__')) {
            postMessage({ type: 'done', runId });  // clean stop, not an error
            return;
        }
        // Runtime errors are located by the xpcall handler; syntax errors
        // never ran, so their line comes from the message itself.
        const syntaxLine = raw.match(/\[string "user_code"\]:(\d+):/);
        const line = lua.global.get('_user_error_line')
            ?? (syntaxLine ? parseInt(syntaxLine[1], 10) : null);
        postMessage({ type: 'error', runId, message: cleanErrorMessage(raw), line, usage: errorUsage() });
    }
}

// Runs the global user_code as fast as it will go, keeping every frame it
// posts (and, first, the blank canvas it starts from) instead of drawing it.
async function recordCode(id) {
    recording = [];
    let error = null;
    try {
        resetVM();
        recordedAt = performance.now();
        recordFrame(0);
        await execute();
    } catch (err) {
        const raw = err.message || String(err);
        if (!raw.includes('__STOPPED__')) error = cleanErrorMessage(raw);
    }
    const frames = recording;
    recording = null;
    frames[frames.length - 1].prints.push(...takePrints());   // printed after the last frame
    postMessage({ type: 'recording', id, frames, error });
}

function loadCode(msg) {
    lua.global.set('user_code', msg.code);
    lua.global.set('_canvas_width',  msg.canvasWidth  || 0);
    lua.global.set('_canvas_height', msg.canvasHeight || 0);
}

// ---- Message handler ----

self.onmessage = async (e) => {
    const msg = e.data;

    if (msg.type === 'init') {
        try {
            await initLua();
        } catch (err) {
            postMessage({ type: 'init-error', message: err.message || String(err) });
        }

    } else if (msg.type === 'run') {
        sabI32 = new Int32Array(msg.sab);
        runId  = msg.runId;
        Atomics.store(sabI32, 0, 0);
        Atomics.store(sabI32, 1, 0);
        loadCode(msg);
        await runCode();

    } else if (msg.type === 'record') {
        loadCode(msg);
        await recordCode(msg.id);

    } else if (msg.type === 'stop') {
        // Belt-and-suspenders: main thread also sets sab[1] = 1 directly.
        if (sabI32) Atomics.store(sabI32, 1, 1);
    }
};