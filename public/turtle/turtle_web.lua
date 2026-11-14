-- turtle/turtle_web.lua
--
-- The web worker's adapter to the execution host (host.lua). Holds the one
-- host instance a worker runs at a time, and exposes it as the _bridge_*
-- globals worker.js calls.
--
-- Frames: the host calls _bridge_post_frame(delay_ms), which worker.js
-- defines as a JS function that posts the frame to the main thread and
-- blocks (Atomics.wait) until it is rendered. It is looked up at call time,
-- so worker.js may define it after this file loads, and tests may leave it
-- undefined (frames are then skipped).
--
-- Input: worker.js feeds pointer and key events through _bridge_input
-- whenever the program waits, and defines _bridge_wait_input for the event
-- loop. Both are looked up at call time, like _bridge_post_frame.
--
-- worker.js sets _canvas_width/_canvas_height before each run, and overrides
-- the global print to buffer output; both are read when a run starts.

local Host = require("turtle.host")

local host

local function post_frame(delay_ms)
    if type(_bridge_post_frame) == "function" then _bridge_post_frame(delay_ms) end
end

-- The event loop's wait: worker.js blocks until input arrives, feeds it
-- through _bridge_input, and returns true, or false to stop listening.
-- Undefined in tests, where nothing ever arrives.
local function wait_input()
    if type(_bridge_wait_input) == "function" then return _bridge_wait_input() end
    return false
end

-- Hard reset: a new host instance, so nothing leaks between runs.
-- Called by worker.js before running new user code.
function _bridge_hard_reset()
    host = Host.new({
        width      = _canvas_width,
        height     = _canvas_height,
        post_frame = post_frame,
        wait_input = wait_input,
    })
    Host.forget_failure()
end

-- A fresh sandbox env for user code, from the current instance. Its print
-- is the global print, which worker.js has replaced to buffer output.
function _turtle_make_env()
    return host.env()
end

function _bridge_get_visible_segments() return host.visible_segments() end
function _bridge_get_turtle_states()    return host.turtle_states() end
function _bridge_get_bgcolor()          return host.bgcolor() end

-- So worker.js can decide whether to post the final frame.
function _bridge_get_tracer_n() return host.tracer_n() end

-- Input, as worker.js reads it from the main thread: one event per call,
-- in primitives (Wasmoon passes those as they are).
function _bridge_input(type, x, y, key, text)
    host.input({ type = type, x = x, y = y, key = key, text = text })
end

-- The program's controls and what input it wants (host.ui()), and a
-- number that changes whenever they do, so worker.js sends only changes.
function _bridge_get_ui()     return host.ui() end
function _bridge_ui_version() return host.ui_version() end

-- The event loop, entered when the program's own code has run.
function _bridge_listen() host.listen() end

function _bridge_command_usage(err) return Host.command_usage(err) end
function _bridge_get_usage_catalog() return Host.usage_catalog() end
function _bridge_get_demos() return Host.demos end

-- The Lessons sidebar's chapters (turtle/lessons.lua): data the page shows,
-- not part of the turtle library, so the host never loads them itself.
function _bridge_get_lessons() return require("turtle.lessons") end

_bridge_hard_reset()
