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

----------------------------------------------------------------
-- Module table (mirrors desktop turtle module structure)
----------------------------------------------------------------

local turtle = {}

----------------------------------------------------------------
-- Shared screen + default core
----------------------------------------------------------------

local screen = Screen.new()
local core   = Core.new(screen)
turtle._screen = screen
turtle._core   = core

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

local function post_frame()
    if type(_bridge_post_frame) == "function" then
        local spd = core and core.speed_setting or 5
        _bridge_post_frame(frame_delay_ms(spd))
    end
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
    distance = distance or 0
    with_undo(c, function()
        if distance == 0 then c:forward(0); return end
        if c.speed_setting == 0 then
            c:forward(distance)
            post_frame()
            return
        end
        local step_size = step_size_for_speed(c.speed_setting)
        local steps     = math.max(1, math.floor(math.abs(distance) / step_size))
        local step_dist = distance / steps
        for _ = 1, steps do
            c:forward(step_dist)
            post_frame()
        end
    end)
end

local function _right(c, angle)
    angle = angle or 0
    with_undo(c, function()
        if angle == 0 or c.speed_setting == 0 then
            c:right(angle)
            post_frame()
            return
        end
        local step_angle = step_size_for_speed(c.speed_setting)
        local steps      = math.max(1, math.floor(math.abs(angle) / step_angle))
        local step       = angle / steps
        for _ = 1, steps do
            c:right(step)
            post_frame()
        end
    end)
end

local function _circle(c, radius, extent, steps)
    radius = radius or 0
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
            if c.speed_setting ~= 0 and (i % render_every == 0 or i == steps) then
                post_frame()
            end
        end
        if c.speed_setting == 0 then post_frame() end
    end)
end

-- Generic instant draw command: call core method, post one frame.
local function _draw(c, method_name, ...)
    local args   = {...}
    local result = {}
    with_undo(c, function()
        result = {c[method_name](c, table.unpack(args))}
        post_frame()
    end)
    return table.unpack(result)
end

local function _do_clear(c)
    c:clear()
    post_frame()
end

local function _do_reset(c)
    c:reset()
    post_frame()
end

local function _do_end_fill(c)
    with_undo(c, function()
        c:end_fill()
        post_frame()
    end)
end

local function _do_clearstamp(c, id)
    with_undo(c, function()
        c:clearstamp(id)
        post_frame()
    end)
end

local function _do_clearstamps(c, n)
    with_undo(c, function()
        c:clearstamps(n)
        post_frame()
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
        post_frame()
    end)
end

local function _write(c, text, move, align, font)
    with_undo(c, function()
        c:write(text, move, align, font)
        post_frame()
    end)
end

local function _stamp(c)
    local id
    with_undo(c, function()
        id = c:stamp()
        post_frame()
    end)
    return id
end

local function _showturtle(c)
    with_undo(c, function() c:showturtle(); post_frame() end)
end

local function _hideturtle(c)
    with_undo(c, function() c:hideturtle(); post_frame() end)
end

local function _undo(c)
    -- Animated undo is desktop-only for now; web does instant undo.
    local desc = c:undo()
    if desc then post_frame() end
end

----------------------------------------------------------------
-- Build method table for a turtle core.
-- Methods use colon syntax: t:forward(100).
-- (Mirrors desktop make_turtle_methods.)
----------------------------------------------------------------

local function make_turtle_methods(c)
    local m = {}

    m.forward   = function(_, d)          _forward(c, d) end
    m.fd        = m.forward
    m.back      = function(_, d)          _forward(c, -(d or 0)) end
    m.bk        = m.back
    m.backward  = m.back
    m.right     = function(_, a)          _right(c, a) end
    m.rt        = m.right
    m.left      = function(_, a)          _right(c, -(a or 0)) end
    m.lt        = m.left
    m.circle    = function(_, r, e, s)    _circle(c, r, e, s) end

    m.setpos      = function(_, x, y)    _draw(c, "setpos", x, y) end
    m.setposition = m.setpos
    m.setx        = function(_, x)       _draw(c, "setx", x) end
    m.sety        = function(_, y)       _draw(c, "sety", y) end
    m.setheading  = function(_, a)       _draw(c, "setheading", a) end
    m.seth        = m.setheading
    m.home        = function(_)          _draw(c, "home") end
    m.teleport    = function(_, x, y)    _teleport(c, x, y) end

    m.penup    = function(_)             _penup(c) end
    m.pu       = m.penup
    m.up       = m.penup
    m.pendown  = function(_)             _pendown(c) end
    m.pd       = m.pendown
    m.down     = m.pendown
    m.pensize  = function(_, w)          return _pensize(c, w) end
    m.width    = m.pensize
    m.pencolor = function(_, r, g, b, a) return _pencolor(c, r, g, b, a) end
    m.fillcolor= function(_, r, g, b, a) return _fillcolor(c, r, g, b, a) end
    m.color    = function(_, p, f)       return _color(c, p, f) end

    m.begin_fill = function(_)           _begin_fill(c) end
    m.end_fill   = function(_)           _do_end_fill(c) end
    m.filling    = function(_)           return c:is_filling() end

    m.dot        = function(_, s, r, g, b, a) _dot(c, s, r, g, b, a) end
    m.write      = function(_, t, mv, al, f)  _write(c, t, mv, al, f) end
    m.stamp      = function(_)           return _stamp(c) end
    m.clearstamp = function(_, id)       _do_clearstamp(c, id) end
    m.clearstamps= function(_, n)        _do_clearstamps(c, n) end

    m.clear = function(_)                _do_clear(c) end
    m.reset = function(_)                _do_reset(c) end

    m.position  = function(_)            return c:position() end
    m.pos       = m.position
    m.xcor      = function(_)            return c:xcor() end
    m.ycor      = function(_)            return c:ycor() end
    m.heading   = function(_)            return c:heading() end
    m.isdown    = function(_)            return c:isdown() end
    m.isvisible = function(_)            return c:isvisible() end
    m.towards   = function(_, x, y)     return c:towards(x, y) end
    m.distance  = function(_, x, y)     return c:distance(x, y) end

    m.showturtle = function(_)           _showturtle(c) end
    m.st         = m.showturtle
    m.hideturtle = function(_)           _hideturtle(c) end
    m.ht         = m.hideturtle

    m.speed = function(_, n)
        if n == nil then return c:speed() end
        c:speed(n)
    end

    m.undo              = function(_)    _undo(c) end
    m.setundobuffer     = function(_, n) c:setundobuffer(n) end
    m.undobufferentries = function(_)    return c:undobufferentries() end

    return m
end

----------------------------------------------------------------
-- Module-level (global) API — plain functions, no self.
-- Built from the default core. Mirrors desktop turtle.lua.
----------------------------------------------------------------

turtle.forward   = function(d)          _forward(core, d) end
turtle.fd        = turtle.forward
turtle.back      = function(d)          _forward(core, -(d or 0)) end
turtle.bk        = turtle.back
turtle.backward  = turtle.back
turtle.right     = function(a)          _right(core, a) end
turtle.rt        = turtle.right
turtle.left      = function(a)          _right(core, -(a or 0)) end
turtle.lt        = turtle.left
turtle.circle    = function(r, e, s)    _circle(core, r, e, s) end

turtle.setpos      = function(x, y)    _draw(core, "setpos", x, y) end
turtle.setposition = turtle.setpos
turtle.setx        = function(x)       _draw(core, "setx", x) end
turtle.sety        = function(y)       _draw(core, "sety", y) end
turtle.setheading  = function(a)       _draw(core, "setheading", a) end
turtle.seth        = turtle.setheading
turtle.home        = function()        _draw(core, "home") end
turtle.teleport    = function(x, y)    _teleport(core, x, y) end

turtle.penup    = function()           _penup(core) end
turtle.pu       = turtle.penup
turtle.up       = turtle.penup
turtle.pendown  = function()           _pendown(core) end
turtle.pd       = turtle.pendown
turtle.down     = turtle.pendown
turtle.pensize  = function(w)          return _pensize(core, w) end
turtle.width    = turtle.pensize
turtle.pencolor = function(r, g, b, a) return _pencolor(core, r, g, b, a) end
turtle.fillcolor= function(r, g, b, a) return _fillcolor(core, r, g, b, a) end
turtle.color    = function(p, f)       return _color(core, p, f) end

turtle.begin_fill = function()         _begin_fill(core) end
turtle.end_fill   = function()         _do_end_fill(core) end
turtle.filling    = function()         return core:is_filling() end

turtle.dot        = function(s, r, g, b, a) _dot(core, s, r, g, b, a) end
turtle.write      = function(t, mv, al, f)  _write(core, t, mv, al, f) end
turtle.stamp      = function()         return _stamp(core) end
turtle.clearstamp = function(id)       _do_clearstamp(core, id) end
turtle.clearstamps= function(n)        _do_clearstamps(core, n) end

turtle.clear   = function()            _do_clear(core) end
turtle.reset   = function()            _do_reset(core) end

turtle.bgcolor = function(r, g, b, a)
    if r == nil then return screen:bgcolor() end
    core:_push_undo()
    screen:bgcolor(r, g, b, a)
    core:_commit_undo_segments()
    post_frame()
end

turtle.position  = function()          return core:position() end
turtle.pos       = turtle.position
turtle.xcor      = function()          return core:xcor() end
turtle.ycor      = function()          return core:ycor() end
turtle.heading   = function()          return core:heading() end
turtle.isdown    = function()          return core:isdown() end
turtle.isvisible = function()          return core:isvisible() end
turtle.towards   = function(x, y)     return core:towards(x, y) end
turtle.distance  = function(x, y)     return core:distance(x, y) end

turtle.showturtle = function()         _showturtle(core) end
turtle.st         = turtle.showturtle
turtle.hideturtle = function()         _hideturtle(core) end
turtle.ht         = turtle.hideturtle

turtle.speed = function(n)
    if n == nil then return core:speed() end
    core:speed(n)
end

-- tracer(0)/update() for batch drawing (multi-turtle simultaneous movement)
turtle.tracer = function(n, _)
    if n == 0 then core:speed(0) end
end
turtle.update = function()
    post_frame()
end

turtle.undo              = function()    _undo(core) end
turtle.setundobuffer     = function(n)   core:setundobuffer(n) end
turtle.undobufferentries = function()    return core:undobufferentries() end

-- done() is a no-op on web (program ends, window stays open)
turtle.done     = function() end
turtle.mainloop = turtle.done
turtle.bye      = function() end

----------------------------------------------------------------
-- turtle.Turtle() — create an additional turtle on the same screen
----------------------------------------------------------------

function turtle.Turtle()
    local t_core = Core.new(screen)
    return make_turtle_methods(t_core)
end

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

        -- Turtle API — all module-level functions
        forward      = turtle.forward,      fd          = turtle.fd,
        back         = turtle.back,         bk          = turtle.bk,
        backward     = turtle.backward,
        right        = turtle.right,        rt          = turtle.rt,
        left         = turtle.left,         lt          = turtle.lt,
        circle       = turtle.circle,

        setpos       = turtle.setpos,       setposition = turtle.setposition,
        setx         = turtle.setx,         sety        = turtle.sety,
        setheading   = turtle.setheading,   seth        = turtle.seth,
        home         = turtle.home,         teleport    = turtle.teleport,

        penup        = turtle.penup,        pu          = turtle.pu,
        up           = turtle.up,
        pendown      = turtle.pendown,      pd          = turtle.pd,
        down         = turtle.down,
        pensize      = turtle.pensize,      width       = turtle.width,
        pencolor     = turtle.pencolor,
        fillcolor    = turtle.fillcolor,
        color        = turtle.color,

        begin_fill   = turtle.begin_fill,
        end_fill     = turtle.end_fill,
        filling      = turtle.filling,

        dot          = turtle.dot,
        write        = turtle.write,
        stamp        = turtle.stamp,
        clearstamp   = turtle.clearstamp,
        clearstamps  = turtle.clearstamps,

        clear        = turtle.clear,
        reset        = turtle.reset,
        bgcolor      = turtle.bgcolor,

        position     = turtle.position,    pos         = turtle.pos,
        xcor         = turtle.xcor,        ycor        = turtle.ycor,
        heading      = turtle.heading,
        isdown       = turtle.isdown,
        isvisible    = turtle.isvisible,
        towards      = turtle.towards,
        distance     = turtle.distance,

        showturtle   = turtle.showturtle,   st          = turtle.st,
        hideturtle   = turtle.hideturtle,   ht          = turtle.ht,

        speed        = turtle.speed,
        tracer       = turtle.tracer,
        update       = turtle.update,
        undo         = turtle.undo,
        setundobuffer     = turtle.setundobuffer,
        undobufferentries = turtle.undobufferentries,

        done         = turtle.done,
        mainloop     = turtle.mainloop,

        -- Multi-turtle
        Turtle       = turtle.Turtle,
    }
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

-- Returns background color as {r, g, b, a}.
function _bridge_get_bgcolor()
    return { screen.bg_color[1], screen.bg_color[2],
             screen.bg_color[3], screen.bg_color[4] }
end

-- Hard reset: wipe all state, rebuild default screen+core.
-- Called by worker.js before running new user code.
function _bridge_hard_reset()
    -- Rebuild from scratch — cleanest approach, no state leakage.
    screen   = Screen.new()
    core     = Core.new(screen)
    turtle._screen = screen
    turtle._core   = core
end

return turtle