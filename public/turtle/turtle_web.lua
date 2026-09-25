-- turtle/turtle_web.lua
--
-- Web execution host for Lua Turtle.
-- Mirrors desktop turtle.lua but replaces renderer:render()+sleep()
-- with _bridge_post_frame() + Atomics.wait via the JS bridge.
--
-- Animation protocol:
--   After each animation step, call _bridge_post_frame().
--   This posts the current segment/state delta to the main thread
--   and blocks (via Atomics.wait in JS) until the frame is rendered.
--   The stop button sets a flag checked after each wake.
--
-- This file is loaded inside the Web Worker by worker.js.
-- It requires core.lua and screen.lua (verbatim from desktop).
-- It exports globals into _G so user code can call forward() etc.
-- User code runs via load(code, "user", "t", env) + pcall.

local Core   = require("turtle.core")
local Screen = require("turtle.screen")
local args     = require("turtle.args")
local examples = require("turtle.examples")
local demos    = require("turtle.demos")

----------------------------------------------------------------
-- Module table (mirrors desktop turtle module structure)
----------------------------------------------------------------

local turtle = {}

----------------------------------------------------------------
-- Shared screen + default core
----------------------------------------------------------------

-- Default ink (pen + fill) and paper (background), as color names.
-- core.lua and screen.lua hard-code white on black; the web host overrides
-- that with black on white, like Python turtle. Explicit
-- pencolor()/fillcolor()/bgcolor() calls still win.
local _ink   = "black"
local _paper = "white"

local function apply_ink(c)
    c:pencolor(_ink)
    c:fillcolor(_ink)
end

local function new_screen()
    local s = Screen.new()
    s:bgcolor(_paper)
    return s
end

local screen = new_screen()
local function new_core()
    local c = Core.new(screen)
    apply_ink(c)
    return c
end

local core   = new_core()
turtle._screen = screen
turtle._core   = core

local _tracer_n         = 1  -- 0=batch, 1=default, n>1=every-nth
local _tracer_cmd_count = 0

----------------------------------------------------------------
-- Bridge: post frame to main thread and wait for ack.
-- In JS, _bridge_post_frame() posts a message with the current
-- segment log state and blocks on Atomics.wait(sab, 0, 0).
-- After the main thread renders and notifies, JS checks sab[1]
-- (stop flag) and throws a Lua error if set.
-- This function is a no-op if _bridge_post_frame is not defined
-- (e.g. in test environments).
----------------------------------------------------------------

local function frame_delay_ms(speed)
    if speed == 0 then return 0 end
    return math.floor(0.023 * (0.65 ^ (speed - 1)) * 1000)
end

local function _raw_post_frame()
    if type(_bridge_post_frame) == "function" then
        local spd = core and core.speed_setting or 5
        _bridge_post_frame(frame_delay_ms(spd))
    end
end

local function _maybe_post_frame()
    if _tracer_n == 0 then return end
    if _tracer_n == 1 then _raw_post_frame(); return end
    _tracer_cmd_count = _tracer_cmd_count + 1
    if _tracer_cmd_count % _tracer_n == 0 then _raw_post_frame() end
end

----------------------------------------------------------------
-- Speed → step size (pixels or degrees per animation substep).
-- Larger step = fewer frames = visually faster.
-- Matches desktop turtle.lua's step_size_for_speed().
----------------------------------------------------------------

local function step_size_for_speed(s)
    if s == 0 then return math.huge end
    return math.max(1, math.floor(2 ^ (s / 2.5)))
end

----------------------------------------------------------------
-- with_undo: push snapshot before command, commit after.
-- Mirrors desktop turtle.lua exactly.
----------------------------------------------------------------

local function with_undo(c, fn)
    c:_push_undo()
    fn()
    c:_commit_undo_segments()
end

----------------------------------------------------------------
-- Animated movement helpers (parameterised by core `c`).
-- Each helper breaks the command into substeps and calls
-- post_frame() after each substep so the main thread can render
-- incrementally.
----------------------------------------------------------------

local function _forward(c, distance)
    with_undo(c, function()
        if distance == 0 then c:forward(0); return end
        if c.speed_setting == 0 or _tracer_n ~= 1 then
            c:forward(distance)
            _maybe_post_frame()
            return
        end
        local step_size = step_size_for_speed(c.speed_setting)
        local steps     = math.max(1, math.floor(math.abs(distance) / step_size))
        local step_dist = distance / steps
        local dx, dy    = c:_dx_dy(distance)
        local x1, y1    = c.x + dx, c.y + dy
        for _ = 1, steps do
            c:forward(step_dist)
            _raw_post_frame()
        end
        -- The substeps' rounding errors add up (forward(50) would end at
        -- x = 49.999999999999993); land where one unanimated step would.
        c.x, c.y = x1, y1
    end)
end

local function _right(c, angle)
    with_undo(c, function()
        if angle == 0 or c.speed_setting == 0 or _tracer_n ~= 1 then
            c:right(angle)
            _maybe_post_frame()
            return
        end
        local step_angle = step_size_for_speed(c.speed_setting)
        local steps      = math.max(1, math.floor(math.abs(angle) / step_angle))
        local step       = angle / steps
        local heading    = c.angle - angle
        for _ = 1, steps do
            c:right(step)
            _raw_post_frame()
        end
        c.angle = heading   -- exact, as in _forward
    end)
end

local function _circle(c, radius, extent, steps)
    extent = extent or 360
    with_undo(c, function()
        if radius == 0 then return end
        if not steps then
            steps = math.max(4, math.floor(math.abs(extent) / 6))
        end
        local RAD        = math.pi / 180
        local step_angle = extent / steps
        local step_len   = 2 * math.abs(radius) * math.sin(math.abs(step_angle) / 2 * RAD)
        if radius < 0 then step_angle = -step_angle end
        local render_every = step_size_for_speed(c.speed_setting)
        for i = 1, steps do
            c:left(step_angle / 2)
            c:forward(step_len)
            c:left(step_angle / 2)
            if _tracer_n == 1 and c.speed_setting ~= 0 and (i % render_every == 0 or i == steps) then
                _raw_post_frame()
            end
        end
        if _tracer_n == 1 then
            if c.speed_setting == 0 then _raw_post_frame() end
            -- animated case: loop already posted on final substep
        else
            _maybe_post_frame()
        end
    end)
end

-- Generic instant draw command: call core method, post one frame.
local function _draw(c, method_name, ...)
    local args   = {...}
    local result = {}
    with_undo(c, function()
        result = {c[method_name](c, table.unpack(args))}
        _maybe_post_frame()
    end)
    return table.unpack(result)
end

local function _do_clear(c)
    c:clear()
    _maybe_post_frame()
end

local function _do_reset(c)
    c:reset()
    apply_ink(c)
    _maybe_post_frame()
end

local function _do_end_fill(c)
    with_undo(c, function()
        c:end_fill()
        _maybe_post_frame()
    end)
end

local function _do_clearstamp(c, id)
    with_undo(c, function()
        c:clearstamp(id)
        _maybe_post_frame()
    end)
end

local function _do_clearstamps(c, n)
    with_undo(c, function()
        c:clearstamps(n)
        _maybe_post_frame()
    end)
end

local function _pensize(c, w)
    if w ~= nil then
        with_undo(c, function() c:pensize(w) end)
    end
    return c:pensize()
end

local function _pencolor(c, r, g, b, a)
    if r ~= nil then
        with_undo(c, function() c:pencolor(r, g, b, a) end)
    else
        return c:pencolor()
    end
end

local function _fillcolor(c, r, g, b, a)
    if r ~= nil then
        with_undo(c, function() c:fillcolor(r, g, b, a) end)
    else
        return c:fillcolor()
    end
end

local function _color(c, pen, fill)
    if pen ~= nil then
        with_undo(c, function() c:color(pen, fill) end)
    else
        return c:color()
    end
end

local function _teleport(c, x, y)
    with_undo(c, function() c:teleport(x, y) end)
end

local function _penup(c)
    with_undo(c, function() c:penup() end)
end

local function _pendown(c)
    with_undo(c, function() c:pendown() end)
end

local function _begin_fill(c)
    with_undo(c, function() c:begin_fill() end)
end

local function _dot(c, size, r, g, b, a)
    with_undo(c, function()
        c:dot(size, r, g, b, a)
        _maybe_post_frame()
    end)
end

local function _write(c, text, move, align, font)
    with_undo(c, function()
        c:write(text, move, align, font)
        _maybe_post_frame()
    end)
end

local function _stamp(c)
    local id
    with_undo(c, function()
        id = c:stamp()
        _maybe_post_frame()
    end)
    return id
end

local function _showturtle(c)
    with_undo(c, function() c:showturtle(); _maybe_post_frame() end)
end

local function _hideturtle(c)
    with_undo(c, function() c:hideturtle(); _maybe_post_frame() end)
end

local function _undo(c)
    -- Animated undo is desktop-only for now; web does instant undo.
    local desc = c:undo()
    if desc then _maybe_post_frame() end
end

----------------------------------------------------------------
-- Public commands.
--
-- Every command the learner can call is defined once here:
--   check(a)     validates the call's arguments (see args.lua); omitted
--                for commands that take no arguments
--   run(c, ...)  the implementation, on turtle core c (screen commands
--                take no core)
-- The module-level globals and each Turtle()'s methods are both built from
-- these tables, so they always accept, reject, and do the same things.
----------------------------------------------------------------

local NUMBER, WHOLE, COUNT = args.NUMBER, args.WHOLE, args.COUNT
local ALIGN = args.one_of("left", "center", "right")

local function distance(a) a:req("distance", NUMBER) end
local function angle(a)    a:req("angle", NUMBER) end
local function point(a)    a:point() end
local function color(a)    a:opt_color() end

-- worker.js sets _canvas_width/_canvas_height before each run.
local function canvas_size(v) return type(v) == "number" and v or 0 end

-- Defined below; Turtle() needs it.
local make_turtle_methods

-- Commands that act on one turtle: globals use the default turtle,
-- methods use their own.
local TURTLE_COMMANDS = {
    forward    = { check = distance, run = _forward },
    back       = { check = distance, run = function(c, d) _forward(c, -d) end },
    right      = { check = angle,    run = _right },
    left       = { check = angle,    run = function(c, a) _right(c, -a) end },
    circle     = {
        check = function(a)
            a:req("radius", NUMBER)
            a:opt("extent", NUMBER)
            a:opt("steps", COUNT)
        end,
        run = _circle,
    },

    setpos     = { check = point, run = function(c, x, y) _draw(c, "setpos", x, y) end },
    setx       = { check = function(a) a:req("x", NUMBER) end,
                   run = function(c, x) _draw(c, "setx", x) end },
    sety       = { check = function(a) a:req("y", NUMBER) end,
                   run = function(c, y) _draw(c, "sety", y) end },
    setheading = { check = angle, run = function(c, a) _draw(c, "setheading", a) end },
    home       = { run = function(c) _draw(c, "home") end },
    teleport   = { check = point, run = _teleport },

    penup      = { run = _penup },
    pendown    = { run = _pendown },
    pensize    = { check = function(a) a:opt("width", NUMBER) end, run = _pensize },
    pencolor   = { check = color, run = _pencolor },
    fillcolor  = { check = color, run = _fillcolor },
    color      = {
        check = function(a)
            a:opt("pen color", args.COLOR_VALUE)
            a:opt("fill color", args.COLOR_VALUE)
        end,
        run = _color,
    },

    begin_fill = { run = _begin_fill },
    end_fill   = { run = _do_end_fill },
    filling    = { run = function(c) return c:is_filling() end },

    dot        = {
        check = function(a)
            a:opt("size", NUMBER)
            a:opt_color()
        end,
        run = _dot,
    },
    write      = {
        check = function(a)
            a:req("text", args.VALUE)
            a:opt("move", args.BOOLEAN)
            a:opt("align", ALIGN)
            a:opt("font", args.FONT)
        end,
        run = _write,
    },
    stamp       = { run = _stamp },
    clearstamp  = { check = function(a) a:req("id", WHOLE) end, run = _do_clearstamp },
    clearstamps = { check = function(a) a:opt("n", WHOLE) end, run = _do_clearstamps },

    clear      = { run = _do_clear },
    reset      = { run = _do_reset },

    position   = { run = function(c) return c:position() end },
    xcor       = { run = function(c) return c:xcor() end },
    ycor       = { run = function(c) return c:ycor() end },
    heading    = { run = function(c) return c:heading() end },
    isdown     = { run = function(c) return c:isdown() end },
    isvisible  = { run = function(c) return c:isvisible() end },
    towards    = { check = point, run = function(c, x, y) return c:towards(x, y) end },
    distance   = { check = point, run = function(c, x, y) return c:distance(x, y) end },

    showturtle = { run = _showturtle },
    hideturtle = { run = _hideturtle },

    speed      = {
        check = function(a) a:opt("speed", NUMBER) end,
        run = function(c, n)
            if n == nil then return c:speed() end
            c:speed(n)
        end,
    },

    undo              = { run = _undo },
    setundobuffer     = { check = function(a) a:opt("size", WHOLE) end,
                          run = function(c, n) c:setundobuffer(n) end },
    undobufferentries = { run = function(c) return c:undobufferentries() end },

    screen_width  = { run = function() return canvas_size(_canvas_width) end },
    screen_height = { run = function() return canvas_size(_canvas_height) end },
}

-- Commands that act on the screen as a whole: globals only.
local SCREEN_COMMANDS = {
    bgcolor = {
        check = color,
        run = function(r, g, b, a)
            if r == nil then return screen:bgcolor() end
            core:_push_undo()
            screen:bgcolor(r, g, b, a)
            core:_commit_undo_segments()
            _maybe_post_frame()
        end,
    },

    tracer = {
        check = function(a)
            a:opt("n", NUMBER)
            a:opt("delay", NUMBER)
        end,
        run = function(n)
            if n == nil then return _tracer_n end
            _tracer_n         = math.max(0, math.floor(n))
            _tracer_cmd_count = 0
        end,
    },
    update = { run = function() _raw_post_frame() end },

    -- done() is a no-op on web (program ends, window stays open)
    done = { run = function() end },
    bye  = { run = function() end },

    -- Create an additional turtle on the same screen.
    Turtle = { run = function() return make_turtle_methods(new_core()) end },
}

-- Other names for commands, as in Python turtle. Errors name whichever
-- one the learner typed.
local ALIASES = {
    fd = "forward", bk = "back", backward = "back", rt = "right", lt = "left",
    setposition = "setpos", seth = "setheading",
    pu = "penup", up = "penup", pd = "pendown", down = "pendown", width = "pensize",
    pos = "position", st = "showturtle", ht = "hideturtle",
    mainloop = "done",
}

-- Calls fn(name, command) for every command in `commands`, and for every
-- alias of one.
local function each_name(commands, fn)
    for name, command in pairs(commands) do fn(name, command) end
    for alias, name in pairs(ALIASES) do
        if commands[name] then fn(alias, commands[name]) end
    end
end

----------------------------------------------------------------
-- Method table for a turtle core: t:forward(100).
----------------------------------------------------------------

function make_turtle_methods(c)
    local m = {}
    each_name(TURTLE_COMMANDS, function(name, command)
        m[name] = function(self, ...)
            if self ~= m then args.fail_method_call(name) end
            args.check(name, command.check, ...)
            return command.run(c, ...)
        end
    end)
    return m
end

----------------------------------------------------------------
-- Module-level (global) API — plain functions, no self, on the
-- default core. `core` is read at call time, so the functions keep
-- working after _bridge_hard_reset() replaces it.
----------------------------------------------------------------

each_name(TURTLE_COMMANDS, function(name, command)
    turtle[name] = function(...)
        args.check(name, command.check, ...)
        return command.run(core, ...)
    end
end)

each_name(SCREEN_COMMANDS, function(name, command)
    turtle[name] = function(...)
        args.check(name, command.check, ...)
        return command.run(...)
    end
end)

----------------------------------------------------------------
-- Build the sandbox env table for user code.
-- Exposed to worker.js as _turtle_make_env().
-- worker.js calls this fresh for each Run, so there is no state
-- leakage between runs.
----------------------------------------------------------------

function _turtle_make_env()
    local env = {
        -- Lua stdlib subset
        math     = math,
        ipairs   = ipairs,
        pairs    = pairs,
        tostring = tostring,
        tonumber = tonumber,
        print    = print,   -- intercepted by worker.js
        type     = type,
        string   = string,
        table    = table,
        pcall    = pcall,
        error    = error,
        select   = select,
        unpack   = table.unpack,
    }
    -- Turtle API: every command and alias, as a global.
    local function export(name) env[name] = turtle[name] end
    each_name(TURTLE_COMMANDS, export)
    each_name(SCREEN_COMMANDS, export)
    return env
end

----------------------------------------------------------------
-- Bridge accessors called by worker.js each frame to build the
-- postMessage payload. These mirror the desktop renderer's pull
-- interface. The segment log shape is identical to desktop.
----------------------------------------------------------------

-- Returns the full visible segment list for the renderer.
-- worker.js sends these to the main thread; main thread renders them.
function _bridge_get_visible_segments()
    return screen:visible_segments()
end

-- Returns all turtle head states (position, heading, visible, colors).
function _bridge_get_turtle_states()
    local result = {}
    for _, t in ipairs(screen.turtles) do
        table.insert(result, {
            x       = t.x,
            y       = t.y,
            angle   = t.angle,
            visible = t.visible,
            pen_r   = t.pen_color[1],
            pen_g   = t.pen_color[2],
            pen_b   = t.pen_color[3],
            pen_a   = t.pen_color[4],
        })
    end
    return result
end

-- Returns current tracer n so worker.js can decide whether to post the final frame.
function _bridge_get_tracer_n()
    return _tracer_n
end

-- Returns background color as {r, g, b, a}.
function _bridge_get_bgcolor()
    return { screen.bg_color[1], screen.bg_color[2],
             screen.bg_color[3], screen.bg_color[4] }
end

-- If `err` is the error a rejected call to a turtle command raised, returns
-- { command = its own name (never an alias), examples = its example calls };
-- otherwise nil. worker.js calls this from its error handler so the editor
-- can show the learner how the command is called.
function _bridge_command_usage(err)
    local typed = args.failed_command(err)
    if not typed then return nil end
    local command = ALIASES[typed] or typed
    return { command = command, examples = examples[command] }
end

-- The usage of every command and alias, by the name a learner would type:
-- { fd = { command = "forward", examples = {...} }, ... }. worker.js sends
-- it to the main thread once, so the editor can show any command's usage on
-- request (a Cmd/Ctrl+click on its name), not just after a rejected call.
function _bridge_get_usage_catalog()
    local catalog = {}
    local function add(name)
        local command = ALIASES[name] or name
        if examples[command] then
            catalog[name] = { command = command, examples = examples[command] }
        end
    end
    each_name(TURTLE_COMMANDS, add)
    each_name(SCREEN_COMMANDS, add)
    return catalog
end

-- The command reference's demo programs, keyed by the entry they show:
-- { ["forward(n)"] = "forward(100)", ... }. worker.js sends them to the main
-- thread once, with the usage catalog.
function _bridge_get_demos()
    return demos
end

-- Hard reset: wipe all state, rebuild default screen+core.
-- Called by worker.js before running new user code.
function _bridge_hard_reset()
    -- Rebuild from scratch — cleanest approach, no state leakage.
    screen            = new_screen()
    core              = new_core()
    turtle._screen    = screen
    turtle._core      = core
    _tracer_n         = 1
    _tracer_cmd_count = 0
    args.last_failure = nil
end

return turtle