-- test/plane_test.lua
--
-- The coordinate plane (public/turtle/plane.lua): which rectangle the
-- canvas shows, projecting world units to pixels, graph paper, curves and
-- marks, as plain values. Then the host's graphing commands built on it:
-- setworldcoordinates, graph, axes, plot and mark.
--
-- Run from the repo root:  lua test/plane_test.lua

package.path = "public/?.lua;" .. package.path

local Host  = require("turtle.host")
local Plane = require("turtle.plane")

local failures, passed = 0, 0

local function test(name, fn)
    local ok, err = pcall(fn)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL  " .. name .. "\n      " .. tostring(err))
    end
end

-- Values as text, so tables compare by contents; numbers to 9 places.
local function show(v)
    if type(v) == "number" then
        local s = string.format("%.9f", v):gsub("0+$", ""):gsub("%.$", "")
        return s == "-0" and "0" or s
    end
    if type(v) ~= "table" then return tostring(v) end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = tostring(k) .. "=" .. show(v[k]) end
    return "{" .. table.concat(parts, " ") .. "}"
end

local function eq(actual, expected, what)
    if show(actual) ~= show(expected) then
        error(string.format("%s: expected %s, got %s", what, show(expected), show(actual)), 2)
    end
end

-- Planes ------------------------------------------------------------------

test("the standard plane is a pixel per unit, paper the size of the canvas", function()
    local p = Plane.standard(800, 600)
    eq(p, { paper = { -400, -300, 400, 300 } }, "plane")
    eq({ Plane.scale(p, 800, 600) }, { 0, 0, 1, 1 }, "scale")
end)

test("world coordinates show exactly their rectangle", function()
    local p = Plane.world({ 0, 0, 100, 50 })
    eq({ Plane.scale(p, 800, 600) }, { 50, 25, 8, 12 }, "scale")
    eq(Plane.world({ 10, 5, 0, 0 }).paper, { 0, 0, 10, 5 }, "paper of a flipped world")
end)

test("graph paper fills 80% of the canvas, equal units by default", function()
    local p = Plane.graph({ -5, -5, 5, 5 }, nil, 800, 600)
    eq(p.paper, { -5, -5, 5, 5 }, "paper")
    eq({ Plane.scale(p, 800, 600) }, { 0, 0, 48, 48 }, "scale: 480 pixels of height for 10 units")
    local s = Plane.graph({ 0, 0, 10, 100 }, "stretch", 800, 600)
    eq({ Plane.scale(s, 800, 600) }, { 5, 50, 64, 4.8 }, "stretched scale")
    eq(Plane.graph({ 0, 0, 1, 1 }, nil, 0, 0).view, { 0, 0, 1, 1 }, "no canvas: the view is the paper")
end)

test("a step looks as long as its pixels", function()
    local p = Plane.graph({ 0, 0, 10, 100 }, "stretch", 800, 600)
    eq(Plane.pixels(p, 3, 0, 800, 600), 192, "across")
    eq(Plane.pixels(p, 0, 10, 800, 600), 48, "up")
    eq(Plane.pixels(Plane.standard(800, 600), 3, 4, 800, 600), 5, "standard")
end)

-- Projection ----------------------------------------------------------------

test("the standard plane passes segments and turtles through untouched", function()
    local segments, turtles = { { type = "dot", pos = { 1, 2 } } }, { { x = 1, y = 2, angle = 30 } }
    local p = Plane.standard(800, 600)
    assert(Plane.project(p, segments, 800, 600) == segments, "segments copied")
    assert(Plane.project_turtles(p, turtles, 800, 600) == turtles, "turtles copied")
end)

test("projection moves every position into pixels and leaves sizes alone", function()
    local p = Plane.world({ 0, 0, 100, 50 })
    local log = {
        { type = "line", from = { 0, 0 }, to = { 100, 50 }, width = 3, turtle_id = 1, _log_index = 1 },
        { type = "fill", vertices = { { 50, 25 }, { 100, 25 } } },
        { type = "dot", pos = { 50, 50 }, size = 12 },
        { type = "text", pos = { 0, 25 }, content = "hi", font = { "Arial", 10 } },
        { type = "stamp", pos = { 50, 25 }, heading = 45 },
    }
    local out = Plane.project(p, log, 800, 600)
    eq(out[1], { type = "line", from = { -400, -300 }, to = { 400, 300 }, width = 3, turtle_id = 1, _log_index = 1 }, "line")
    eq(out[2].vertices, { { 0, 0 }, { 400, 0 } }, "fill")
    eq(out[3], { type = "dot", pos = { 0, 300 }, size = 12 }, "dot")
    eq(out[4].pos, { -400, 0 }, "text")
    eq(out[5].heading, math.deg(math.atan(12 / 8)), "a stamp's heading as it looks")
    eq(log[1].from, { 0, 0 }, "the log itself is unchanged")
end)

test("turtles project likewise; equal units keep their heading exactly", function()
    local stretched = Plane.project_turtles(Plane.world({ 0, 0, 100, 50 }), { { x = 50, y = 25, angle = 90, visible = true } }, 800, 600)
    eq(stretched, { { x = 0, y = 0, angle = 90, visible = true } }, "stretched")
    local equal = Plane.project_turtles(Plane.graph({ -5, -5, 5, 5 }, nil, 800, 600), { { x = 1, y = 1, angle = 37 } }, 800, 600)
    eq(equal, { { x = 48, y = 48, angle = 37 } }, "equal units")
end)

-- Graph paper ---------------------------------------------------------------

test("nice steps are 1, 2 or 5 times a power of ten", function()
    eq(Plane.nice_step(10), 1, "10")
    eq(Plane.nice_step(800), 100, "800")
    eq(Plane.nice_step(1600), 200, "1600")
    eq(Plane.nice_step(3.5), 0.5, "3.5")
    eq(Plane.nice_step(0), 1, "nothing")
end)

-- The records of a kind, as { content or endpoints }.
local function of(records, kind, color)
    local out = {}
    for _, r in ipairs(records) do
        if r.type == kind and (not color or show(r.color) == show(color)) then
            out[#out + 1] = kind == "text" and r.content or { r.from, r.to }
        end
    end
    return out
end

local GAINSBORO, GRAY = { 220 / 255, 220 / 255, 220 / 255, 1 }, { 128 / 255, 128 / 255, 128 / 255, 1 }

test("paper has grid lines at the steps' multiples, axes through 0, numbers and names", function()
    local p = Plane.graph({ -2, -1, 2, 4 }, nil, 800, 600)
    local records = Plane.paper(p, 800, 600, 1, 2, "time", nil)
    eq(of(records, "line", GAINSBORO), {
        { { -2, -1 }, { -2, 4 } }, { { -1, -1 }, { -1, 4 } }, { { 0, -1 }, { 0, 4 } },
        { { 1, -1 }, { 1, 4 } }, { { 2, -1 }, { 2, 4 } },
        { { -2, 0 }, { 2, 0 } }, { { -2, 2 }, { 2, 2 } }, { { -2, 4 }, { 2, 4 } },
    }, "grid")
    eq(of(records, "line", GRAY), { { { -2, 0 }, { 2, 0 } }, { { 0, -1 }, { 0, 4 } } }, "axes")
    eq(of(records, "text"), { "-2", "-1", "1", "2", "2", "4", "time", "y" }, "numbers but 0, then names")
    local first = records[#records - 7]
    eq(first.pos, { -2, -15 / 96 }, "a number sits 15 pixels under its axis")
end)

test("axes run along the paper's edge when 0 is off it", function()
    local records = Plane.paper(Plane.graph({ 2, 5, 4, 7 }, nil, 800, 600), 800, 600, 1, 1)
    eq(of(records, "line", GRAY), { { { 2, 5 }, { 4, 5 } }, { { 2, 5 }, { 2, 7 } } }, "axes")
end)

test("paper with too many grid lines says why", function()
    local records, why = Plane.paper(Plane.standard(800, 600), 800, 600, 1)
    eq(records, nil, "records")
    eq(why, "xstep 1 would draw more than 500 grid lines; use a bigger step", "why")
    eq(#Plane.paper(Plane.standard(800, 600), 800, 600) > 0, true, "chosen steps are fine")
end)

-- Curves and marks -----------------------------------------------------------

test("a curve is clipped to the paper", function()
    local pieces = Plane.curve(function(x) return 2 * x end, { 0, 0, 2, 2 }, 4)
    eq(pieces, { { { 0, 0 }, { 0.5, 1 } }, { { 0.5, 1 }, { 1, 2 } } }, "pieces")
end)

test("a curve breaks where f gives no value, and across a leap off the paper", function()
    local gap = Plane.curve(function(x) if x ~= 1 then return 0 end end, { 0, -1, 2, 1 }, 4)
    eq(#gap, 2, "pieces around x = 1")
    local leap = Plane.curve(function(x) return 1 / (x - 1) end, { 0, -5, 2, 5 }, 2)
    eq(leap, {}, "nothing joined across the asymptote")
    local nan = Plane.curve(function(x) return math.sqrt(x) end, { -1, 0, 1, 1 }, 2)
    eq(nan, { { { 0, 0 }, { 1, 1 } } }, "nan is no value")
end)

test("a curve whose function returns something else says so", function()
    local pieces, why = Plane.curve(function() return "high" end, { 0, 0, 1, 1 }, 2)
    eq(pieces, nil, "pieces")
    eq(why, "the function must return a number or nil, but f(0) returned string", "why")
end)

test("a mark is a dot, and its label nudged up and right in pixels", function()
    local p = Plane.graph({ -5, -5, 5, 5 }, nil, 800, 600)
    local red, black = { 1, 0, 0, 1 }, { 0, 0, 0, 1 }
    local records = Plane.mark(p, 800, 600, 1, 2, red, "P", black)
    eq(records, {
        { type = "dot", pos = { 1, 2 }, size = 12, color = red },
        { type = "text", pos = { 1 + 9 / 48, 2 + 4 / 48 }, content = "P", align = "left",
          font = { "Arial", 12 }, color = black },
    }, "records")
    eq(#Plane.mark(p, 800, 600, 1, 2, red, nil, black), 1, "no label")
end)

-- The host's commands --------------------------------------------------------

local function host(frames)
    return Host.new({ width = 800, height = 600, seed = 0, print = function() end,
                      post_frame = frames and function() frames.n = frames.n + 1 end })
end

local function run(h, code)
    assert(load(code, "user_code", "t", h.env()))()
end

test("turtle commands speak world units, and the shell sees pixels", function()
    local h = host()
    run(h, "setworldcoordinates(0, 0, 100, 50)\nspeed(0)\nteleport(50, 25)\nsetpos(100, 25)\nx, y = position()")
    local seg = h.visible_segments()[1]
    eq({ seg.from, seg.to }, { { 0, 0 }, { 400, 0 } }, "the line in pixels")
    local t = h.turtle_states()[1]
    eq({ t.x, t.y }, { 400, 0 }, "the turtle in pixels")
    eq(h.default_turtle().x, 100, "the turtle in world units")
end)

test("changing the world moves what is already drawn", function()
    local h = host()
    run(h, "speed(0)\nforward(100)\nsetworldcoordinates(-200, -150, 200, 150)")
    eq(h.visible_segments()[1].to, { 200, 0 }, "forward(100) at 2 pixels a unit")
end)

test("an animated step is paced by its pixels, not its units", function()
    local small, big = { n = 0 }, { n = 0 }
    run(host(small), "graph(0, 0, 10, 10)\nforward(5)")
    run(host(big), "forward(240)")
    eq(small.n - 1, big.n, "frames for 240 pixels either way, after graph()'s own")
end)

test("axes, plot and mark are one undo step each and leave the turtle be", function()
    local h = host()
    run(h, [[
graph(-5, -5, 5, 5)
pencolor("red")
pensize(4)
axes()
plot(function(x) return x * x end, "blue", 3)
mark(1, 1, "green", "(1, 1)")
]])
    local c = h.default_turtle()
    eq({ c.x, c.y, c.pen_size, c.pen_color }, { 0, 0, 4, { 1, 0, 0, 1 } }, "turtle and pen")
    local counts = {}
    for _ = 1, 3 do
        counts[#counts + 1] = #h.visible_segments()
        h.env().undo()
    end
    counts[#counts + 1] = #h.visible_segments()
    assert(counts[1] > counts[2] and counts[2] > counts[3] and counts[3] > counts[4] and counts[4] == 0,
        "undo steps left " .. show(counts))
end)

test("plot and mark default to the pen's color and size", function()
    local h = host()
    run(h, 'graph(-5, -5, 5, 5)\npencolor("purple")\npensize(5)\nplot(function(x) return 1 end)\nmark({2, 2}, nil, "P")')
    local segments = h.visible_segments()
    local purple = { 128 / 255, 0, 128 / 255, 1 }
    eq({ segments[1].color, segments[1].width }, { purple, 5 }, "the curve")
    eq({ segments[#segments - 1].type, segments[#segments - 1].color }, { "dot", purple }, "the mark's dot")
    eq(segments[#segments].color, purple, "its label")
end)

test("plot grows a few pieces a frame, or shows at once at speed 0", function()
    local animated, instant = { n = 0 }, { n = 0 }
    run(host(animated), "graph(-5, -5, 5, 5)\nplot(function(x) return x end)")
    run(host(instant), "graph(-5, -5, 5, 5)\nspeed(0)\nplot(function(x) return x end)")
    eq(animated.n, 1 + 200 / 4, "graph's frame, then one every 4 pieces")
    eq(instant.n, 2, "graph's frame and the curve's")
end)

test("graphing calls are checked like any other", function()
    local cases = {
        { "graph(5, 0, 1, 1)", "graph: right must be more than left, got 5 and 1" },
        { "graph(0, 0, 1, 1, \"wide\")", 'graph: units must be "equal" or "stretch", got "wide"' },
        { "setworldcoordinates(0, 1, 5, 1)", "setworldcoordinates: bottom and top must differ, got 1 and 1" },
        { "axes(-1)", "axes: xstep must be a number more than 0, got -1" },
        { "axes(1)", "axes: xstep 1 would draw more than 500 grid lines; use a bigger step" },
        { "plot(5)", "plot: f must be a function, got 5" },
        { "plot(function() return {} end)", "plot: the function must return a number or nil, but f(-400) returned table" },
        { "mark(1)", "mark: y is missing" },
    }
    for _, case in ipairs(cases) do
        local ok, err = pcall(run, host(), case[1])
        eq(err, case[2], case[1])
        assert(not ok)
        local usage = Host.command_usage(err)
        assert(usage and usage.examples, case[1] .. " shows no usage")
    end
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
