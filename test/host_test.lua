-- test/host_test.lua
--
-- The execution host as instances (public/turtle/host.lua): two programs in
-- one VM never touch, a seed reproduces a run's random numbers, and the
-- on_command hook reports what each command drew. Also the per-program
-- random generator (public/turtle/random.lua).
--
-- Run from the repo root:  lua test/host_test.lua

package.path = "public/?.lua;" .. package.path

local Host   = require("turtle.host")
local Random = require("turtle.random")

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

local function run(host, code)
    local env = host.env()
    env.assert = assert
    assert(load(code, "user_code", "t", env))()
    return env
end

local function eq(actual, expected, what)
    if actual ~= expected then
        error(string.format("%s: expected %s, got %s", what, tostring(expected), tostring(actual)), 2)
    end
end

-- Instances ----------------------------------------------------------------

test("two instances keep their own turtles and ink", function()
    local a, b = Host.new({ seed = 1 }), Host.new({ seed = 1 })
    run(a, "speed(0)\nforward(100)")
    run(b, "speed(0)\nleft(90)\nforward(30)\nforward(30)")
    eq(#a.visible_segments(), 1, "a's segments")
    eq(#b.visible_segments(), 2, "b's segments")
    local ta, tb = a.turtle_states()[1], b.turtle_states()[1]
    eq(ta.x, 100, "a's x")
    eq(tb.angle, 90, "b's heading")
end)

test("tracer state belongs to its instance", function()
    local a, b = Host.new(), Host.new()
    run(a, "tracer(0)")
    eq(a.tracer_n(), 0, "a's tracer")
    eq(b.tracer_n(), 1, "b's tracer")
end)

test("each instance posts frames through its own post_frame", function()
    local frames_a, frames_b = 0, 0
    local a = Host.new({ post_frame = function() frames_a = frames_a + 1 end })
    local b = Host.new({ post_frame = function() frames_b = frames_b + 1 end })
    run(a, "speed(0)\nforward(10)\nforward(10)")
    eq(frames_a, 2, "a's frames")
    eq(frames_b, 0, "b's frames")
    run(b, "speed(0)\nforward(10)")
    eq(frames_a, 2, "a's frames after b ran")
    eq(frames_b, 1, "b's frames")
end)

test("a Turtle() belongs to the instance that made it", function()
    local a, b = Host.new(), Host.new()
    run(a, "local t = Turtle()\nt:forward(5)")
    eq(#a.turtle_states(), 2, "a's turtles")
    eq(#b.turtle_states(), 1, "b's turtles")
end)

test("screen_width and screen_height report the instance's canvas", function()
    local env = run(Host.new({ width = 640, height = 480 }), "")
    eq(env.screen_width(), 640, "width")
    eq(env.screen_height(), 480, "height")
    eq(run(Host.new(), "").screen_width(), 0, "width with no canvas")
end)

-- Commands a shell adds -------------------------------------------------------

local function with_commands(log)
    return Host.new({
        post_frame = function() log[#log + 1] = "frame" end,
        commands = {
            turtle = {
                mark = {
                    check = function(a) a:req("size", require("turtle.args").NUMBER) end,
                    run = function(c, size)
                        c:_log({ type = "dot", pos = { c.x, c.y }, size = size, color = { 0, 0, 0, 1 } })
                        return size * 2, nil, "third"
                    end,
                    draws = true,
                },
                where = { run = function(c) return c.x end },
            },
            screen = { ping = { run = function(...) log[#log + 1] = "ping" end } },
        },
    })
end

test("a shell's turtle commands are globals and methods, checked like the rest", function()
    local log = {}
    local env = run(with_commands(log), "speed(0)\nlocal t = Turtle()\nt:forward(10)\nmark(4)\nhere = t:where()\nping()")
    eq(env.here, 10, "the method acts on its own turtle")
    eq(log[#log], "ping", "the screen command ran")
    local ok, err = pcall(env.mark, "big")
    assert(not ok and err:find("mark: size must be a number"), "mark(\"big\") gave " .. tostring(err))
end)

test("a shell's drawing command is one undo step and one frame, and keeps its results", function()
    local log = {}
    local host = with_commands(log)
    local env = host.env()
    local a, b, c = env.mark(3)
    eq(a, 6, "first result"); eq(b, nil, "second result"); eq(c, "third", "third result")
    eq(log[1], "frame", "a frame after drawing")
    eq(#host.visible_segments(), 1, "drawn")
    env.undo()
    eq(#host.visible_segments(), 0, "undone in one step")
end)

test("a shell can't replace a built-in command or alias", function()
    local ok = pcall(Host.new, { commands = { turtle = { forward = { run = function() end } } } })
    assert(not ok, "replaced forward")
    ok = pcall(Host.new, { commands = { screen = { fd = { run = function() end } } } })
    assert(not ok, "replaced the alias fd")
end)

test("a desktop-only command says so where the host lacks it", function()
    local ok, err = pcall(load("drawimage('cat.png')", "user_code", "t", Host.new().env()))
    assert(not ok and err:find("drawimage works only in the Lua Turtle desktop app"), tostring(err))
    eq(Host.new().env().some_variable, nil, "other globals are still nil")
end)

-- Randomness ---------------------------------------------------------------

local RANDOMS = "local r = {}\nfor i = 1, 20 do r[i] = math.random(1000) end\nresult = table.concat(r, ',')"

test("the same seed gives the same random numbers", function()
    local first  = run(Host.new({ seed = 42 }), RANDOMS).result
    local second = run(Host.new({ seed = 42 }), RANDOMS).result
    eq(second, first, "second run")
    local other = run(Host.new({ seed = 43 }), RANDOMS).result
    assert(other ~= first, "a different seed gave the same numbers")
end)

test("one instance's random numbers don't disturb another's", function()
    local alone = run(Host.new({ seed = 7 }), RANDOMS).result
    local a, b = Host.new({ seed = 7 }), Host.new({ seed = 99 })
    local env_a = a.env()
    local first = env_a.math.random(1000)
    run(b, "for i = 1, 50 do math.random() end\nmath.randomseed(5)")
    local rest = { first }
    for i = 2, 20 do rest[i] = env_a.math.random(1000) end
    eq(table.concat(rest, ","), alone, "a's sequence")
end)

test("the sandbox's math.random is not the VM's", function()
    local env = Host.new().env()
    assert(env.math.random ~= math.random, "math.random is the global one")
    eq(env.math.sin, math.sin, "the rest of math")
end)

test("random follows math.random's contract", function()
    local random = Random.new(3)
    for _ = 1, 1000 do
        local f = random()
        assert(f >= 0 and f < 1, "random() out of [0, 1): " .. f)
        local n = random(6)
        assert(n >= 1 and n <= 6 and n == math.floor(n), "random(6) gave " .. n)
        local m = random(-3, 3)
        assert(m >= -3 and m <= 3 and m == math.floor(m), "random(-3, 3) gave " .. m)
    end
    eq(random(5, 5), 5, "random(5, 5)")
    local ok, err = pcall(random, 0)
    assert(not ok and err:find("interval is empty"), "random(0) did not fail: " .. tostring(err))
    ok, err = pcall(random, 3, 1)
    assert(not ok and err:find("#2"), "random(3, 1) did not name argument 2: " .. tostring(err))
end)

test("random gives the same sequence on every Lua", function()
    -- Recorded once; a change means runs no longer reproduce across
    -- versions or between the web and the desktop.
    local random = Random.new(2026)
    local r = {}
    for i = 1, 5 do r[i] = random(1000000) end
    eq(table.concat(r, ","), "45563,360775,941731,296059,46208", "sequence")
end)

test("randomseed restarts the sequence", function()
    local random, randomseed = Random.new(1)
    local a = { random(), random(), random() }
    randomseed(1)
    local b = { random(), random(), random() }
    eq(table.concat(b, ","), table.concat(a, ","), "after reseeding")
end)

-- on_command -----------------------------------------------------------------

local function recording_host()
    local records = {}
    local host = Host.new({ on_command = function(r) records[#records + 1] = r end })
    return host, records
end

test("on_command reports each command with the log indices it appended", function()
    local host, records = recording_host()
    run(host, "speed(0)\nforward(10)\npenup()\nforward(5)\npendown()\ncircle(10, 360, 4)")
    local names = {}
    for i, r in ipairs(records) do names[i] = r.name end
    eq(table.concat(names, " "), "speed forward penup forward pendown circle", "commands")
    eq(records[2].first, 1, "forward's first index")
    eq(records[2].last, 1, "forward's last index")
    assert(records[3].first > records[3].last, "penup appended something")
    assert(records[4].first > records[4].last, "a move with the pen up appended something")
    eq(records[6].last - records[6].first + 1, 4, "circle's segment count")
end)

test("on_command names the command as typed and its turtle", function()
    local host, records = recording_host()
    run(host, "fd(10)\nlocal t = Turtle()\nt:rt(90)")
    eq(records[1].name, "fd", "alias")
    eq(records[1].turtle_id, 1, "default turtle")
    eq(records[3].name, "rt", "method alias")
    eq(records[3].turtle_id, 2, "second turtle")
end)

test("on_command passes return values through", function()
    local host = recording_host()
    local env = run(host, "forward(30)\nx, y = position()\nid = stamp()")
    eq(env.x, 30, "position's x")
    eq(env.y, 0, "position's y")
    eq(type(env.id), "number", "stamp's id")
end)

test("a rejected call is not reported", function()
    local host, records = recording_host()
    local ok = pcall(run, host, "forward()")
    assert(not ok, "forward() was accepted")
    eq(#records, 0, "records")
end)

-- LuaJIT's math.atan ignores a second argument; host.lua shims it.
-- Headings below the x-axis come out negative, as core.lua has them.
test("towards gives the heading in every quadrant, on every Lua", function()
    local env = Host.new({ seed = 0 }).env()
    local function near(a, b, what) assert(math.abs(a - b) < 1e-9, what .. ": expected " .. b .. ", got " .. a) end
    near(env.towards(10, 10), 45, "north-east")
    near(env.towards(-10, 10), 135, "north-west")
    near(env.towards(-10, -10), -135, "south-west")
    near(env.towards(10, -10), -45, "south-east")
    near(env.towards(-10, 0), 180, "west")
    near(env.math.atan(1, -1), 3 * math.pi / 4, "the sandbox's math.atan(y, x)")
end)

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
