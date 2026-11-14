-- turtle/host.lua
--
-- The execution host for Lua Turtle, shared by the web worker and the LÖVE
-- desktop app. Layers animation pacing, tracer batching, undo orchestration,
-- argument checks and the public API on top of core.lua and screen.lua
-- (verbatim from the desktop repo).
--
-- Host.new(opts) returns an instance that owns its own screen, turtles,
-- tracer state and sandbox env, so one Lua VM can run several programs (a
-- learner's program and a reference demo, say) without them touching.
--
-- Animation protocol:
--   After each animation substep the host calls opts.post_frame(delay_ms).
--   The web worker posts a frame and blocks until it is rendered; the
--   desktop yields the program's coroutine. With no post_frame (tests),
--   frames are skipped.
--
-- Runs on Lua 5.4 (Wasmoon) and LuaJIT (LÖVE) alike: nothing here may use
-- syntax or library functions only one of them has.

-- core.lua calls table.unpack, which Lua 5.1 / LuaJIT has only as the
-- global unpack. Shimmed here, before the core loads, so the shared core
-- files stay verbatim.
table.unpack = table.unpack or unpack
local unpack = table.unpack

-- core.lua's towards() calls math.atan(y, x), Lua 5.4's two-argument form.
-- LuaJIT's math.atan ignores the second argument (it has math.atan2
-- instead), which turned every heading into one east of north or south.
-- Shimmed for the same reason; learners' math gets the 5.4 form too.
if math.atan2 and math.atan(1, -1) ~= math.atan2(1, -1) then
    local atan, atan2 = math.atan, math.atan2
    math.atan = function(y, x)
        if x == nil then return atan(y) end
        return atan2(y, x)
    end
end

local Core     = require("turtle.core")
local Screen   = require("turtle.screen")
local args     = require("turtle.args")
local examples = require("turtle.examples")
local demos    = require("turtle.demos")
local Random   = require("turtle.random")
local Plane    = require("turtle.plane")
local UI       = require("turtle.ui")
local colors   = require("turtle.colors")

local Host = {}

----------------------------------------------------------------
-- Pacing, as pure functions of the speed setting.
----------------------------------------------------------------

local function frame_delay_ms(speed)
    if speed == 0 then return 0 end
    return math.floor(0.023 * (0.65 ^ (speed - 1)) * 1000)
end

-- Speed → step size (pixels or degrees per animation substep).
-- Larger step = fewer frames = visually faster.
-- Matches desktop turtle.lua's step_size_for_speed().
local function step_size_for_speed(s)
    if s == 0 then return math.huge end
    return math.max(1, math.floor(2 ^ (s / 2.5)))
end

-- with_undo: push snapshot before command, commit after.
-- Mirrors desktop turtle.lua exactly.
local function with_undo(c, fn)
    c:_push_undo()
    fn()
    c:_commit_undo_segments()
end

----------------------------------------------------------------
-- Argument checks, shared by every instance.
----------------------------------------------------------------

local NUMBER, WHOLE, COUNT, POSITIVE = args.NUMBER, args.WHOLE, args.COUNT, args.POSITIVE
local ALIGN = args.one_of("left", "center", "right")
local UNITS = args.one_of("equal", "stretch")
local function UNITS_OR_BOX(v)
    if type(v) == "table" or not UNITS(v) then return nil end
    return '"equal" or "stretch", or a box like {x = -350, y = 250, width = 300, height = 300}'
end

local function distance(a) a:req("distance", NUMBER) end
local function handler(a)  a:opt("f", args.FUNCTION) end
local function options(a)
    a:req("options", function(v)
        if type(v) == "table" then return nil end
        return 'a table like {label = "size"}'
    end)
end
local function key_handler(a)
    a:opt("f", args.FUNCTION)
    a:opt("key", function(v)
        if UI.key_name(v) then return nil end
        return 'a key name like "left", "space" or "a"'
    end)
end
local function angle(a)    a:req("angle", NUMBER) end

local function check_axes(a)
    a:opt("xstep", POSITIVE)
    a:opt("ystep", POSITIVE)
    a:opt("xname", args.VALUE)
    a:opt("yname", args.VALUE)
end
local function check_plot(a)
    a:req("f", args.FUNCTION)
    a:opt("color", args.COLOR_VALUE)
    a:opt("width", POSITIVE)
end
local function check_mark(a)
    a:point()
    a:opt("color", args.COLOR_VALUE)
    a:opt("label", args.VALUE)
end
local function point(a)    a:point() end
local function color(a)    a:opt_color() end

-- The methods of what graph() returns, in the order the reference lists them.
Host.GRAPH_METHODS = { "axes", "plot", "mark", "tocanvas", "tograph" }

-- Other names for commands, as in Python turtle. Errors name whichever
-- one the learner typed.
local ALIASES = {
    fd = "forward", bk = "back", backward = "back", rt = "right", lt = "left",
    setposition = "setpos", seth = "setheading",
    pu = "penup", up = "penup", pd = "pendown", down = "pendown", width = "pensize",
    pos = "position", st = "showturtle", ht = "hideturtle",
    mainloop = "done",
    onkey = "onkeyrelease", onscreenclick = "onclick",
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
-- An instance.
--
-- opts (all optional):
--   width, height  the canvas size screen_width()/screen_height() report
--   post_frame     function(delay_ms), called after each animation step
--   print          the print() user code sees; defaults to the global print
--                  at the time env() is called
--   seed           the seed of this instance's math.random; chosen if
--                  omitted, and kept as instance.seed so a run can be
--                  reproduced
--   commands       commands the shell adds to the built-in ones:
--                  { turtle = { name = { check, run(c, ...), draws } },
--                    screen = { name = { check, run(...) } } }, shaped like
--                  the tables below; a turtle command with draws = true is
--                  one undo step and posts one frame. The desktop app adds
--                  its images, sounds and input this way (Host.DESKTOP_ONLY).
--   on_command     function(record), called after every public command
--                  completes, with { name, turtle_id, first, last }: the
--                  command as typed and the log indices it appended
--                  (first > last when it appended none). The hook point
--                  for an execution trace; nothing is done without it.
--   wait_input     function() → boolean, called by the event loop (see
--                  listen()): blocks until the shell has fed at least one
--                  input event through instance.input(), then returns
--                  true; false ends the loop. Without it, a program's
--                  handlers never run and its controls never move.
----------------------------------------------------------------

-- Default ink (pen + fill) and paper (background), as color names.
-- core.lua and screen.lua hard-code white on black; the host overrides
-- that with black on white, like Python turtle. Explicit
-- pencolor()/fillcolor()/bgcolor() calls still win.
local INK, PAPER = "black", "white"

local function apply_ink(c)
    c:pencolor(INK)
    c:fillcolor(INK)
end

local function canvas_size(v) return type(v) == "number" and v or 0 end

-- A color value as args.COLOR_VALUE accepts it (a name, or a table of red,
-- green, blue and maybe alpha) as {r, g, b, a}; `default` (copied) if nil.
local function color_of(v, default)
    if v == nil then return { default[1], default[2], default[3], default[4] } end
    if type(v) == "string" then
        local c = colors[v:lower()]
        return { c[1], c[2], c[3], c[4] or 1 }
    end
    return Core.normalize_color(v[1], v[2], v[3], v[4])
end

function Host.new(opts)
    opts = opts or {}
    local self = {}

    local screen = Screen.new()
    screen:bgcolor(PAPER)

    local function new_core()
        local c = Core.new(screen)
        apply_ink(c)
        return c
    end

    local core = new_core()

    local tracer_n         = 1  -- 0=batch, 1=default, n>1=every-nth
    local tracer_cmd_count = 0

    -- Which rectangle of the world the canvas shows (see plane.lua). The
    -- log and the turtles are in world units; what the shell reads is
    -- projected to pixels.
    local W, H  = canvas_size(opts.width), canvas_size(opts.height)
    local plane = Plane.standard(W, H)
    -- The graph axes(), plot() and mark() draw on: the plane's paper, or
    -- the latest graph() in a box.
    local current_graph = Plane.on_canvas(plane, W, H)

    self.seed = opts.seed or os.time()
    local random, randomseed = Random.new(self.seed)

    ----------------------------------------------------------------
    -- Input and on-canvas controls.
    --
    -- ui.lua decides what each input event does; this runs what it
    -- returns. The shell feeds events through self.input() whenever the
    -- program waits (after each frame, and in the event loop), which only
    -- changes the UI state and queues the effects. The effects (the
    -- learner's handlers) run at safe points, between commands and in the
    -- event loop, never inside a command's animation, so a handler that
    -- draws can't tangle with the drawing it interrupted.
    ----------------------------------------------------------------

    local ui          = UI.new()
    local ui_layout   = nil   -- UI.layout(ui), until ui or the plane changes
    local ui_version  = 0     -- counts changes, so the shell sends only new layouts
    local handlers    = { keypress = {}, keyrelease = {} }   -- click, drag, release; keys by name, "*" for any
    local widget_fns  = {}    -- widget id → { onchange, onclick, onsubmit }
    local pending     = {}    -- effects waiting for a safe point
    local dispatching = false -- running pending effects; a handler's commands mustn't start again

    -- Effects kept waiting at most; the oldest go first.
    local MAX_PENDING = 1000

    local function ui_changed()
        ui_layout  = nil
        ui_version = ui_version + 1
    end

    local function set_ui(next_ui)
        if next_ui ~= ui then
            ui = next_ui
            ui_changed()
        end
    end

    local function layout()
        if not ui_layout then
            ui_layout = UI.layout(ui, function(x, y) return Plane.point(plane, x, y, W, H) end, W, H)
        end
        return ui_layout
    end

    local function wants_pointer()
        return handlers.click ~= nil or handlers.drag ~= nil or handlers.release ~= nil
    end

    local function wants_keys()
        return next(handlers.keypress) ~= nil or next(handlers.keyrelease) ~= nil
            or UI.has_textfield(ui)
    end

    local function interactive()
        return next(ui.widgets) ~= nil or wants_pointer() or wants_keys()
    end

    -- A pointer drag and a widget's change say where things are now, so a
    -- newer one replaces the one still waiting before it.
    local function queue(effect)
        local last = pending[#pending]
        if last and last.kind == effect.kind
            and (effect.kind == "drag" or (effect.kind == "change" and last.id == effect.id)) then
            pending[#pending] = effect
            return
        end
        if #pending >= MAX_PENDING then table.remove(pending, 1) end
        pending[#pending + 1] = effect
    end

    -- A pixel point as the world point a handler is given.
    local function world(x, y)
        local wx, wy = Plane.unproject(plane, x, y, W, H)
        return UI.tidy(wx), UI.tidy(wy)
    end

    local function run_effect(e)
        local kind = e.kind
        if kind == "click" or kind == "drag" or kind == "release" then
            local f = handlers[kind]
            if f then f(world(e.x, e.y)) end
        elseif kind == "keypress" or kind == "keyrelease" then
            local by_key = handlers[kind]
            if by_key[e.key] then by_key[e.key](e.key) end
            if by_key["*"] then by_key["*"](e.key) end
        else
            local fns = widget_fns[e.id]   -- nil once the widget is removed
            if not fns then return end
            if kind == "change" and fns.onchange then fns.onchange(e.value)
            elseif kind == "press" and fns.onclick then fns.onclick()
            elseif kind == "submit" and fns.onsubmit then fns.onsubmit(e.value) end
        end
    end

    -- Runs the waiting effects, in order. A handler's own commands come
    -- back through here and find it busy, so effects never nest.
    local function dispatch()
        if dispatching or #pending == 0 then return end
        dispatching = true
        while #pending > 0 do run_effect(table.remove(pending, 1)) end
        dispatching = false
    end

    -- The event loop: while the program has handlers or controls, wait
    -- for input and run what it does, until the shell ends it (Stop).
    -- done() enters it, and the web shell enters it when a program ends.
    local function listen()
        if not opts.wait_input or not interactive() then return end
        while true do
            -- A handler error that a pcall in the program caught can leave
            -- the flag set; nothing is dispatching here, at the top.
            dispatching = false
            dispatch()
            if not opts.wait_input() then return end
        end
    end

    -- What s = slider{...} returns: s.value and s.label read the widget's
    -- current state and set it; s:remove() takes it off the canvas.
    local function widget_handle(kind, id)
        local handle = {}
        local function remove(this)
            if this ~= handle then
                args.fail("remove", "call it with a colon, like " .. kind .. ":remove()")
            end
            set_ui(UI.remove(ui, id))
            widget_fns[id] = nil
        end
        local function fail(detail) error(kind .. ": " .. detail, 0) end
        return setmetatable(handle, {
            __index = function(_, k)
                if k == "remove" then return remove end
                local w = ui.widgets[id]
                if w and (k == "value" or k == "label") then return w[k] end
                return nil
            end,
            __newindex = function(_, k, v)
                if not ui.widgets[id] then fail("this " .. kind .. " was removed") end
                if k == "value" and kind ~= "button" then
                    local s, why = UI.set_value(ui, id, v)
                    if not s then fail("value must be " .. why .. ", got " .. args.describe(v)) end
                    set_ui(s)
                elseif k == "label" then
                    set_ui(UI.set_label(ui, id, v))
                else
                    fail("can't set " .. tostring(k) .. (kind == "button" and "; set its label"
                        or "; set its value or label"))
                end
            end,
        })
    end

    local function add_widget(kind, spec)
        local why = UI.check(kind, spec)
        if why then args.fail(kind, why) end
        local s, id = UI.add(ui, kind, spec)
        set_ui(s)
        widget_fns[id] = { onchange = spec.onchange, onclick = spec.onclick, onsubmit = spec.onsubmit }
        return widget_handle(kind, id)
    end

    ----------------------------------------------------------------
    -- Frames
    ----------------------------------------------------------------

    local post_frame = opts.post_frame

    local function raw_post_frame()
        if post_frame then post_frame(frame_delay_ms(core.speed_setting)) end
    end

    local function maybe_post_frame()
        if tracer_n == 0 then return end
        if tracer_n == 1 then raw_post_frame(); return end
        tracer_cmd_count = tracer_cmd_count + 1
        if tracer_cmd_count % tracer_n == 0 then raw_post_frame() end
    end

    ----------------------------------------------------------------
    -- Animated movement helpers (parameterised by core `c`).
    -- Each helper breaks the command into substeps and posts a frame
    -- after each substep so the shell can render incrementally.
    ----------------------------------------------------------------

    local function _forward(c, dist)
        with_undo(c, function()
            if dist == 0 then c:forward(0); return end
            if c.speed_setting == 0 or tracer_n ~= 1 then
                c:forward(dist)
                maybe_post_frame()
                return
            end
            -- Paced by how far the step looks, so a world unit of any
            -- size animates as smoothly as a pixel.
            local dx, dy    = c:_dx_dy(dist)
            local step_size = step_size_for_speed(c.speed_setting)
            local steps     = math.max(1, math.floor(Plane.pixels(plane, dx, dy, W, H) / step_size))
            local step_dist = dist / steps
            local x1, y1    = c.x + dx, c.y + dy
            for _ = 1, steps do
                c:forward(step_dist)
                raw_post_frame()
            end
            -- The substeps' rounding errors add up (forward(50) would end at
            -- x = 49.999999999999993); land where one unanimated step would.
            c.x, c.y = x1, y1
        end)
    end

    local function _right(c, a)
        with_undo(c, function()
            if a == 0 or c.speed_setting == 0 or tracer_n ~= 1 then
                c:right(a)
                maybe_post_frame()
                return
            end
            local step_angle = step_size_for_speed(c.speed_setting)
            local steps      = math.max(1, math.floor(math.abs(a) / step_angle))
            local step       = a / steps
            local heading    = c.angle - a
            for _ = 1, steps do
                c:right(step)
                raw_post_frame()
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
                if tracer_n == 1 and c.speed_setting ~= 0 and (i % render_every == 0 or i == steps) then
                    raw_post_frame()
                end
            end
            if tracer_n == 1 then
                if c.speed_setting == 0 then raw_post_frame() end
                -- animated case: loop already posted on final substep
            else
                maybe_post_frame()
            end
        end)
    end

    -- Generic instant draw command: call core method, post one frame.
    local function _draw(c, method_name, ...)
        local call_args = {...}
        local result    = {}
        with_undo(c, function()
            result = {c[method_name](c, unpack(call_args))}
            maybe_post_frame()
        end)
        return unpack(result)
    end

    local function _do_clear(c)
        c:clear()
        maybe_post_frame()
    end

    local function _do_reset(c)
        c:reset()
        apply_ink(c)
        maybe_post_frame()
    end

    -- A command that changes state and shows the change in one frame.
    local function undoable(method, show)
        return function(c, ...)
            local call_args = {...}
            local result
            with_undo(c, function()
                result = c[method](c, unpack(call_args))
                if show then maybe_post_frame() end
            end)
            return result
        end
    end

    -- A property that reads with no argument and sets (undoably) with one.
    local function property(method)
        return function(c, first, ...)
            if first == nil then return c[method](c) end
            local rest = {...}
            with_undo(c, function() c[method](c, first, unpack(rest)) end)
        end
    end

    local function _pensize(c, w)
        if w ~= nil then
            with_undo(c, function() c:pensize(w) end)
        end
        return c:pensize()
    end

    -- Graph paper and curves on graph g (see plane.lua): ink logged
    -- straight from plane.lua's records, one undo step each, leaving the
    -- turtle and its pen as they were.
    local function log_all(c, records)
        for _, record in ipairs(records) do c:_log(record) end
    end

    local function _axes(c, g, xstep, ystep, xname, yname)
        local records, why = Plane.paper(g, xstep, ystep, xname, yname)
        if not records then args.fail("axes", why) end
        with_undo(c, function()
            log_all(c, records)
            maybe_post_frame()
        end)
    end

    -- Animated like circle(): the curve grows a few pieces per frame.
    local function _plot(c, g, f, color, width)
        local pieces, why = Plane.plot(g, f, 200)
        if not pieces then args.fail("plot", why) end
        color = color_of(color, c.pen_color)
        width = width or c.pen_size
        with_undo(c, function()
            local animated = tracer_n == 1 and c.speed_setting ~= 0
            local every    = step_size_for_speed(c.speed_setting)
            for i, piece in ipairs(pieces) do
                c:_log({ type = "line", from = piece[1], to = piece[2],
                         color = { color[1], color[2], color[3], color[4] }, width = width })
                if animated and (i % every == 0 or i == #pieces) then raw_post_frame() end
            end
            if not animated then maybe_post_frame() end
        end)
    end

    local function _mark(c, g, x, y, color, label)
        if type(x) == "table" then x, y, color, label = x[1], x[2], y, color end
        with_undo(c, function()
            log_all(c, Plane.mark(g, x, y, color_of(color, c.pen_color), label,
                color_of(nil, c.pen_color)))
            maybe_post_frame()
        end)
    end

    local function _undo(c)
        -- Animated undo is desktop-only for now; this host does instant undo.
        local desc = c:undo()
        if desc then maybe_post_frame() end
    end

    ----------------------------------------------------------------
    -- Public commands.
    --
    -- Every command the learner can call is defined once here:
    --   check(a)     validates the call's arguments (see args.lua); omitted
    --                for commands that take no arguments
    --   run(c, ...)  the implementation, on turtle core c (screen commands
    --                take no core)
    -- The globals and each Turtle()'s methods are both built from these
    -- tables, so they always accept, reject, and do the same things.
    ----------------------------------------------------------------

    -- Defined below; Turtle() and graph() need them.
    local make_turtle_methods, graph_handle

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
        teleport   = { check = point, run = undoable("teleport") },

        penup      = { run = undoable("penup") },
        pendown    = { run = undoable("pendown") },
        pensize    = { check = function(a) a:opt("width", NUMBER) end, run = _pensize },
        pencolor   = { check = color, run = property("pencolor") },
        fillcolor  = { check = color, run = property("fillcolor") },
        color      = {
            check = function(a)
                a:opt("pen color", args.COLOR_VALUE)
                a:opt("fill color", args.COLOR_VALUE)
            end,
            run = property("color"),
        },

        begin_fill = { run = undoable("begin_fill") },
        end_fill   = { run = undoable("end_fill", true) },
        filling    = { run = function(c) return c:is_filling() end },

        dot        = {
            check = function(a)
                a:opt("size", NUMBER)
                a:opt_color()
            end,
            run = undoable("dot", true),
        },
        write      = {
            check = function(a)
                a:req("text", args.VALUE)
                a:opt("move", args.BOOLEAN)
                a:opt("align", ALIGN)
                a:opt("font", args.FONT)
            end,
            run = undoable("write", true),
        },
        stamp       = { run = undoable("stamp", true) },
        clearstamp  = { check = function(a) a:req("id", WHOLE) end, run = undoable("clearstamp", true) },
        clearstamps = { check = function(a) a:opt("n", WHOLE) end, run = undoable("clearstamps", true) },

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

        showturtle = { run = undoable("showturtle", true) },
        hideturtle = { run = undoable("hideturtle", true) },

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

        screen_width  = { run = function() return W end },
        screen_height = { run = function() return H end },

        axes = { check = check_axes, run = function(c, ...) _axes(c, current_graph, ...) end },
        plot = { check = check_plot, run = function(c, ...) _plot(c, current_graph, ...) end },
        mark = { check = check_mark, run = function(c, ...) _mark(c, current_graph, ...) end },
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
                maybe_post_frame()
            end,
        },

        tracer = {
            check = function(a)
                a:opt("n", NUMBER)
                a:opt("delay", NUMBER)
            end,
            run = function(n)
                if n == nil then return tracer_n end
                tracer_n         = math.max(0, math.floor(n))
                tracer_cmd_count = 0
            end,
        },
        update = { run = function() raw_post_frame() end },

        -- The canvas shows the world's rectangle left..right by
        -- bottom..top, as Python turtle's does. Unlike Python's, it keeps
        -- the turtles and the drawing, which move to their places in it.
        setworldcoordinates = {
            check = function(a) a:rect() end,
            run = function(l, b, r, t)
                plane = Plane.world({ l, b, r, t })
                current_graph = Plane.on_canvas(plane, W, H)
                ui_changed()
                maybe_post_frame()
            end,
        },
        -- Graph paper's coordinates: the rectangle left..right by
        -- bottom..top across most of the canvas, for axes() and plot().
        -- Given a box instead of units, the paper fills the box and the
        -- rest of the canvas keeps its coordinates. Either way, returns
        -- the graph, whose methods draw on it whichever graph is latest.
        graph = {
            check = function(a)
                a:rect(true)
                a:opt("units", UNITS_OR_BOX)
            end,
            run = function(l, b, r, t, units)
                if type(units) == "table" then
                    local why = Plane.check_box(units)
                    if why then args.fail("graph", why) end
                    current_graph = Plane.in_box(plane, W, H, { l, b, r, t }, units)
                else
                    plane = Plane.graph({ l, b, r, t }, units, W, H)
                    current_graph = Plane.on_canvas(plane, W, H)
                    ui_changed()
                    maybe_post_frame()
                end
                return graph_handle(current_graph)
            end,
        },

        -- done() keeps the program listening for clicks, keys and its
        -- controls (see listen()); with none, it does nothing and the
        -- canvas stays up. Code after it runs only once listening ends.
        done = { run = function() listen() end },
        bye  = { run = function() end },

        -- Handlers, as in Python turtle: f(x, y) in world units for the
        -- pointer, f(key) for keys. Leaving f out (or nil) removes one.
        onclick   = { check = handler, run = function(f) handlers.click = f; ui_changed() end },
        ondrag    = { check = handler, run = function(f) handlers.drag = f; ui_changed() end },
        onrelease = { check = handler, run = function(f) handlers.release = f; ui_changed() end },
        onkeypress = {
            check = key_handler,
            run = function(f, key) handlers.keypress[UI.key_name(key) or "*"] = f; ui_changed() end,
        },
        onkeyrelease = {
            check = key_handler,
            run = function(f, key) handlers.keyrelease[UI.key_name(key) or "*"] = f; ui_changed() end,
        },
        -- Python needs listen() before keys reach the program; here the
        -- canvas listens already, so a ported program's call does nothing.
        listen = { run = function() end },

        -- On-canvas controls, each made from a table of options (ui.lua's
        -- UI.FIELDS lists them).
        slider    = { check = options, run = function(spec) return add_widget("slider", spec) end },
        button    = { check = options, run = function(spec) return add_widget("button", spec) end },
        toggle    = { check = options, run = function(spec) return add_widget("toggle", spec) end },
        radio     = { check = options, run = function(spec) return add_widget("radio", spec) end },
        textfield = { check = options, run = function(spec) return add_widget("textfield", spec) end },

        -- Create an additional turtle on the same screen.
        Turtle = { run = function() return make_turtle_methods(new_core()) end },
    }

    -- Commands the shell adds (see opts.commands), joined to the built-in
    -- ones so they are checked, traced and offered as methods alike. A
    -- drawing command is one undo step and shows in one frame, like dot().
    local function drawing(run)
        return function(c, ...)
            local call_args = { n = select("#", ...), ... }
            local result
            with_undo(c, function()
                result = (function(...) return { n = select("#", ...), ... } end)(
                    run(c, unpack(call_args, 1, call_args.n)))
                maybe_post_frame()
            end)
            return unpack(result, 1, result.n)
        end
    end

    local function add_commands(into, extra, is_turtle)
        for name, command in pairs(extra or {}) do
            assert(not TURTLE_COMMANDS[name] and not SCREEN_COMMANDS[name] and not ALIASES[name],
                "the command " .. name .. " already exists")
            local run = command.run
            if is_turtle and command.draws then run = drawing(run) end
            into[name] = { check = command.check, run = run }
        end
    end
    local extra = opts.commands or {}
    add_commands(TURTLE_COMMANDS, extra.turtle, true)
    add_commands(SCREEN_COMMANDS, extra.screen, false)

    ----------------------------------------------------------------
    -- Calling a command: check, run, and report it to on_command.
    ----------------------------------------------------------------

    local on_command = opts.on_command

    local function pack(...) return { n = select("#", ...), ... } end

    local function call(name, command, c, ...)
        args.check(name, command.check, ...)
        dispatch()   -- input that came in since the last command
        if not on_command then
            if c then return command.run(c, ...) end
            return command.run(...)
        end
        local first = #screen.segments + 1
        local result
        if c then result = pack(command.run(c, ...)) else result = pack(command.run(...)) end
        on_command({ name = name, turtle_id = (c or core).turtle_id,
                     first = first, last = #screen.segments })
        return unpack(result, 1, result.n)
    end

    -- Method table for a turtle core: t:forward(100).
    function make_turtle_methods(c)
        local m = {}
        each_name(TURTLE_COMMANDS, function(name, command)
            m[name] = function(this, ...)
                if this ~= m then args.fail_method_call(name) end
                return call(name, command, c, ...)
            end
        end)
        return m
    end

    -- What graph() returns, for graph g (see plane.lua): its methods draw
    -- on g with the default turtle's pen even once another graph is the
    -- latest, and turn g's points into the canvas's coordinates and back.
    local function graph_point(x, y)
        if type(x) == "table" then return x[1], x[2] end
        return x, y
    end
    function graph_handle(g)
        local commands = {
            axes     = { check = check_axes, run = function(c, ...) _axes(c, g, ...) end },
            plot     = { check = check_plot, run = function(c, ...) _plot(c, g, ...) end },
            mark     = { check = check_mark, run = function(c, ...) _mark(c, g, ...) end },
            tocanvas = { check = point, run = function(_, ...) return Plane.to_world(g, graph_point(...)) end },
            tograph  = { check = point, run = function(_, ...) return Plane.to_graph(g, graph_point(...)) end },
        }
        local handle = {}
        for _, name in ipairs(Host.GRAPH_METHODS) do
            local command = commands[name]
            handle[name] = function(this, ...)
                if this ~= handle then
                    args.fail(name, "call a graph's commands with a colon, like g:" .. name .. "(...)")
                end
                return call(name, command, core, ...)
            end
        end
        return handle
    end

    -- The global API: plain functions, no self, on the default turtle.
    local api = {}
    each_name(TURTLE_COMMANDS, function(name, command)
        api[name] = function(...) return call(name, command, core, ...) end
    end)
    each_name(SCREEN_COMMANDS, function(name, command)
        api[name] = function(...) return call(name, command, nil, ...) end
    end)

    ----------------------------------------------------------------
    -- What the shell reads.
    ----------------------------------------------------------------

    -- A fresh sandbox env for user code: a whitelisted Lua stdlib subset
    -- and every command and alias as a global. Its math is a copy whose
    -- random and randomseed are this instance's own (see random.lua).
    function self.env()
        local env_math = {}
        for k, v in pairs(math) do env_math[k] = v end
        env_math.random, env_math.randomseed = random, randomseed

        local env = {
            math     = env_math,
            ipairs   = ipairs,
            pairs    = pairs,
            tostring = tostring,
            tonumber = tonumber,
            print    = opts.print or print,
            type     = type,
            string   = string,
            table    = table,
            pcall    = pcall,
            error    = error,
            select   = select,
            unpack   = unpack,
        }
        for name, fn in pairs(api) do env[name] = fn end
        -- A desktop-only command this host doesn't have (a program brought
        -- over from the desktop app) says so instead of being a nil global.
        return setmetatable(env, { __index = function(_, name)
            if Host.DESKTOP_ONLY[name] then
                error(name .. " works only in the Lua Turtle desktop app", 2)
            end
        end })
    end

    function self.screen() return screen end
    function self.default_turtle() return core end

    -- The visible segments, in pixels.
    function self.visible_segments()
        return Plane.project(plane, screen:visible_segments(), W, H)
    end

    -- All turtle head states (position, heading, visible, pen up or down,
    -- colors), in pixels.
    function self.turtle_states()
        local result = {}
        for _, t in ipairs(screen.turtles) do
            table.insert(result, {
                x       = t.x,
                y       = t.y,
                angle   = t.angle,
                visible = t.visible,
                pen_down = t.pen_down,
                pen_r   = t.pen_color[1],
                pen_g   = t.pen_color[2],
                pen_b   = t.pen_color[3],
                pen_a   = t.pen_color[4],
            })
        end
        return Plane.project_turtles(plane, result, W, H)
    end

    function self.tracer_n() return tracer_n end

    -- One input event from the shell (see ui.lua for their shape): updates
    -- the controls at once and queues the handlers it calls.
    function self.input(e)
        local next_ui, effects = UI.handle(ui, layout(), e)
        set_ui(next_ui)
        for _, effect in ipairs(effects) do queue(effect) end
    end

    -- What the shell draws and routes: the controls' layout in pixels
    -- (UI.layout), whether the program takes pointer presses anywhere on
    -- the canvas and keys, and whether it listens at all.
    function self.ui()
        return {
            widgets = layout(),
            pointer = wants_pointer(),
            keys    = wants_keys(),
            active  = interactive(),
        }
    end

    -- Changes whenever self.ui() would.
    function self.ui_version() return ui_version end

    -- The event loop, for a shell to enter when the program ends.
    self.listen = listen

    -- Background color as {r, g, b, a}.
    function self.bgcolor()
        return { screen.bg_color[1], screen.bg_color[2],
                 screen.bg_color[3], screen.bg_color[4] }
    end

    return self
end

----------------------------------------------------------------
-- Usage, shared by every instance.
----------------------------------------------------------------

-- The set of every name a learner can call, commands and aliases (and the
-- stdlib names, which have no examples). Built from a throwaway instance,
-- so it can never drift from the commands.
local function command_names()
    local names = {}
    for name in pairs(Host.new({ seed = 0 }).env()) do names[name] = true end
    return names
end

-- If `err` is the error a rejected call to a turtle command raised, returns
-- { command = its own name (never an alias), examples = its example calls };
-- otherwise nil. The shell calls this from its error handler so the editor
-- can show the learner how the command is called.
function Host.command_usage(err)
    local typed = args.failed_command(err)
    if not typed then return nil end
    local command = ALIASES[typed] or typed
    return { command = command, examples = examples[command] }
end

-- The usage of every command and alias, by the name a learner would type:
-- { fd = { command = "forward", examples = {...} }, ... }, so the editor can
-- show any command's usage on request, not just after a rejected call.
function Host.usage_catalog()
    local catalog = {}
    for name in pairs(command_names()) do
        local command = ALIASES[name] or name
        if examples[command] then
            catalog[name] = { command = command, examples = examples[command] }
        end
    end
    return catalog
end

-- The command reference's demo programs, keyed by the entry they show:
-- { ["forward(n)"] = "forward(100)", ... }.
Host.demos = demos

-- The other names a command answers to, alias → command: { fd = "forward", ... }.
Host.ALIASES = ALIASES

-- The commands only the desktop app has (images, sounds, the keyboard and
-- mouse), which it adds through opts.commands. Anywhere else, using one
-- raises "<name> works only in the Lua Turtle desktop app".
Host.DESKTOP_ONLY = {
    drawimage = true, imagesize = true,
    playsound = true, stopsounds = true, tone = true, wait = true,
    keydown = true, mouse = true, mousedown = true,
}

-- Forgets the last rejected call, so a new run never inherits its usage.
function Host.forget_failure()
    args.last_failure = nil
end

return Host
