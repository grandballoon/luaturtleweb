-- test/args_test.lua
--
-- Argument checking for the public turtle API (public/turtle/args.lua), and
-- that every command in the sandbox env the worker hands to user code applies it.
--
-- Run from the repo root:  lua test/args_test.lua

package.path = "public/?.lua;" .. package.path

require("turtle.turtle_web")  -- defines _turtle_make_env and the bridge globals

local failures, passed = 0, 0

local function test(name, fn)
    _bridge_hard_reset()
    local ok, err = pcall(fn)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL  " .. name .. "\n      " .. tostring(err))
    end
end

-- Runs Lua source the way worker.js does: in a fresh env, as chunk "user_code".
-- The sandbox has no assert(), so tests get one.
local function run(code)
    local env = _turtle_make_env()
    env.assert = assert
    local chunk = assert(load(code, "user_code", "t", env))
    return pcall(chunk)
end

-- The Lua stdlib names in the sandbox env; every other name is a turtle command.
local STDLIB = {
    math = true, ipairs = true, pairs = true, tostring = true, tonumber = true,
    print = true, type = true, string = true, table = true, pcall = true,
    error = true, select = true, unpack = true,
}

local function expect_ok(code)
    local ok, err = run(code)
    if not ok then error("expected " .. code .. " to run, got: " .. tostring(err), 2) end
end

local function expect_error(code, message)
    local ok, err = run(code)
    if ok then error("expected " .. code .. " to fail with: " .. message, 2) end
    if err ~= message then
        error("for " .. code .. "\n        expected: " .. message .. "\n        got:      " .. tostring(err), 2)
    end
end

----------------------------------------------------------------
-- The reported case: a placeholder left in an inserted signature
----------------------------------------------------------------

test("an undefined variable as a required argument stops the run", function()
    expect_error("circle(radius)\nforward(50)", "circle: radius must be a number, got nil")
end)

test("the run stops at the bad call, before later commands", function()
    local ok = run("forward(10)\ncircle(radius)\nforward(50)")
    assert(not ok)
    local x = _turtle_make_env().xcor()
    assert(x == 10, "expected the turtle to stop at x = 10, got " .. tostring(x))
end)

----------------------------------------------------------------
-- Messages
----------------------------------------------------------------

test("a missing required argument is named", function()
    expect_error("circle()", "circle: radius is missing")
    expect_error("forward()", "forward: distance is missing")
    expect_error("setpos(10)", "setpos: y is missing")
end)

test("a value of the wrong type is shown", function()
    expect_error('forward("10")', 'forward: distance must be a number, got "10"')
    expect_error("right({})", "right: angle must be a number, got a table")
    expect_error("left(true)", "left: angle must be a number, got true")
    expect_error("forward(print)", "forward: distance must be a number, got a function")
end)

test("long strings are shortened", function()
    expect_error('forward("' .. string.rep("x", 40) .. '")',
        'forward: distance must be a number, got "' .. string.rep("x", 24) .. '…"')
end)

test("numbers must be finite", function()
    expect_error("forward(1/0)", "forward: distance must be a finite number, got inf")
    expect_error("forward(-1/0)", "forward: distance must be a finite number, got -inf")
    expect_error("forward(0/0)", "forward: distance must be a finite number, got nan")
end)

test("errors name the alias the learner typed", function()
    expect_error("fd()", "fd: distance is missing")
    expect_error("lt(nil)", "lt: angle must be a number, got nil")
    expect_error("mainloop(1)", "mainloop takes no arguments, but got 1")
end)

test("too many arguments", function()
    expect_error("penup(5)", "penup takes no arguments, but got 1")
    expect_error("forward(10, 20)", "forward takes 1 argument, but got 2")
    expect_error("setpos(1, 2, 3)", "setpos takes 2 arguments, but got 3")
    expect_error("circle(50, 90, 10, 5)", "circle takes at most 3 arguments, but got 4")
    expect_error("Turtle(1)", "Turtle takes no arguments, but got 1")
end)

----------------------------------------------------------------
-- Optional parameters
----------------------------------------------------------------

test("optional parameters may be left out, or skipped with nil", function()
    expect_ok("circle(50)")
    expect_ok("circle(50, 90)")
    expect_ok("circle(50, nil, 8)")
    expect_ok("clearstamps()")
    expect_ok("setundobuffer(nil)")
end)

test("optional parameters are still type-checked", function()
    expect_error('circle(50, "half")', 'circle: extent must be a number, got "half"')
    expect_error("circle(50, 360, 0)", "circle: steps must be a whole number of at least 1, got 0")
    expect_error("circle(50, 360, 2.5)", "circle: steps must be a whole number of at least 1, got 2.5")
    expect_error('speed("fast")', 'speed: speed must be a number, got "fast"')
    expect_error("clearstamps(1.5)", "clearstamps: n must be a whole number, got 1.5")
end)

test("queries still read when called with no arguments", function()
    expect_ok("assert(speed() == 5)")
    expect_ok("assert(pensize() == 2)")
    expect_ok("assert(pencolor() == 0)")
    expect_ok("assert(tracer() == 1)")
end)

----------------------------------------------------------------
-- Points
----------------------------------------------------------------

test("points are x, y or a table {x, y}", function()
    expect_ok("setpos(10, 20)")
    expect_ok("setpos({10, 20})")
    expect_ok("home()\nassert(distance({3, 4}) == 5)")
    expect_ok("teleport(pos())")
    expect_error("setpos({10})", "setpos: point must be a table of two numbers like {10, 20}, got a table")
    expect_error('towards("up")', 'towards: x must be a number, got "up"')
end)

----------------------------------------------------------------
-- Colors
----------------------------------------------------------------

test("colors: names, name + alpha, and red, green, blue (+ alpha)", function()
    expect_ok('pencolor("red")')
    expect_ok('pencolor("Red")')
    expect_ok('pencolor("red", 0.5)')
    expect_ok("pencolor(1, 0, 0)")
    expect_ok("fillcolor(255, 128, 0, 255)")
    expect_ok('bgcolor("black")')
    expect_ok('dot(10, "red")')
    expect_ok("dot(10, 1, 0, 0)")
    expect_ok("dot()")
end)

test("colors: bad forms", function()
    expect_error('pencolor("rde")', 'pencolor: color must be a known color name, got "rde"')
    expect_error("pencolor(1, 0)", "pencolor: blue is missing")
    expect_error('pencolor(1, "0", 0)', 'pencolor: green must be a number, got "0"')
    expect_error("pencolor({1, 0, 0})",
        'pencolor: color must be a color name like "red", or red, green, blue numbers, got a table')
    expect_error("pencolor(nil, 0, 0)",
        'pencolor: color must be a color name like "red", or red, green, blue numbers, got nil')
    expect_error("pencolor(1, 0, 0, 1, 1)", "pencolor takes at most 4 arguments, but got 5")
    expect_error('pencolor("red", 1, 1)', "pencolor takes at most 2 arguments, but got 3")
    expect_error('dot(10, "blu")', 'dot: color must be a known color name, got "blu"')
    expect_error('bgcolor("nope")', 'bgcolor: color must be a known color name, got "nope"')
end)

test("color() takes whole colors: names or tables", function()
    expect_ok('color("red")')
    expect_ok('color("red", "blue")')
    expect_ok("color({1, 0, 0}, {0, 0, 1, 0.5})")
    expect_error('color("red", "bleu")', 'color: fill color must be a known color name, got "bleu"')
    expect_error("color(1, 0, 0)",
        'color: pen color must be a color name like "red" or a table like {1, 0, 0}, got 1')
end)

----------------------------------------------------------------
-- write()
----------------------------------------------------------------

test("write() takes any text, and checks move, align and font", function()
    expect_ok('write("hi")')
    expect_ok("write(42)")
    expect_ok('write("hi", false, "center", {"Arial", 16})')
    expect_error("write()", "write: text is missing")
    expect_error("write(message)", "write: text must be a value, got nil")
    expect_error('write("hi", false, "middle")',
        'write: align must be "left", "center" or "right", got "middle"')
    expect_error('write("hi", false, "left", 16)', 'write: font must be a table like {"Arial", 16}, got 16')
    expect_error('write("hi", "yes")', 'write: move must be true or false, got "yes"')
end)

----------------------------------------------------------------
-- Turtle() methods share the same checks
----------------------------------------------------------------

test("methods apply the same checks as the globals", function()
    expect_ok("local t = Turtle()\nt:forward(10)\nt:circle(5, 90)\nt:pencolor(\"red\")")
    expect_error("local t = Turtle()\nt:circle(radius)", "circle: radius must be a number, got nil")
    expect_error("local t = Turtle()\nt:fd()", "fd: distance is missing")
    expect_error("local t = Turtle()\nt:penup(1)", "penup takes no arguments, but got 1")
end)

test("calling a method with a dot says to use a colon", function()
    expect_error("local t = Turtle()\nt.forward(10)",
        "forward: call a turtle's commands with a colon, like t:forward(...)")
end)

test("methods act on their own turtle", function()
    expect_ok([[
        local t = Turtle()
        t:speed(0)
        speed(0)
        t:forward(30)
        assert(t:xcor() == 30 and xcor() == 0)
        forward(5)
        assert(t:xcor() == 30 and xcor() == 5)
    ]])
end)

----------------------------------------------------------------
-- Every exported command is checked
----------------------------------------------------------------

test("every command in the env rejects a call with too many arguments", function()
    local env = _turtle_make_env()
    local checked = 0
    for name, fn in pairs(env) do
        if not STDLIB[name] then
            local extra = {}
            for i = 1, 6 do extra[i] = 1 end
            local ok, err = pcall(fn, table.unpack(extra))
            assert(not ok, name .. " accepted 6 arguments")
            assert(type(err) == "string" and err:find("^" .. name .. "[ :]"),
                name .. ": unexpected error " .. tostring(err))
            checked = checked + 1
        end
    end
    assert(checked > 60, "expected the full turtle API in the env, found " .. checked)
end)

----------------------------------------------------------------
-- Usage examples for a rejected call (turtle/examples.lua)
----------------------------------------------------------------

local examples = require("turtle.examples")

local function usage_of(code)
    local ok, err = run(code)
    assert(not ok, "expected " .. code .. " to fail")
    return _bridge_command_usage(err)
end

test("a rejected call reports its command and examples", function()
    local usage = usage_of("circle(radius)")
    assert(usage and usage.command == "circle", "expected circle's usage")
    assert(usage.examples == examples.circle)
end)

test("an alias reports the command it stands for", function()
    assert(usage_of("fd()").command == "forward")
    assert(usage_of("local t = Turtle()\nt:bk()").command == "back")
end)

test("a dot instead of a colon reports the method's command", function()
    assert(usage_of("local t = Turtle()\nt.forward(10)").command == "forward")
end)

test("other errors report no usage", function()
    assert(usage_of("error('mine')") == nil)
    assert(usage_of("local x = nil + 1") == nil)
end)

test("a caught rejection does not attach to a later error", function()
    assert(usage_of("pcall(forward)\nerror('mine')") == nil)
end)

test("every command and alias has 1 to 3 examples, and every entry is a command", function()
    local covered = {}
    for name, fn in pairs(_turtle_make_env()) do
        if not STDLIB[name] then
            local _, err = pcall(fn, 1, 1, 1, 1, 1, 1)
            local usage = _bridge_command_usage(err)
            assert(usage, name .. ": no usage for " .. tostring(err))
            local n = usage.examples and #usage.examples or 0
            assert(n >= 1 and n <= 3, name .. ": expected 1 to 3 examples, found " .. n)
            covered[usage.command] = true
        end
    end
    for command in pairs(examples) do
        assert(covered[command], "examples.lua has an entry for unknown command " .. command)
    end
end)

test("the usage catalog covers every command and alias by the name typed", function()
    local catalog = _bridge_get_usage_catalog()
    assert(catalog.fd.command == "forward" and catalog.fd.examples == examples.forward)
    assert(catalog.circle.command == "circle")
    local env = _turtle_make_env()
    for name in pairs(env) do
        assert(STDLIB[name] or catalog[name], name .. " is missing from the catalog")
    end
    for name in pairs(catalog) do
        assert(env[name], "catalog entry " .. name .. " is not a command")
    end
end)

test("every example runs", function()
    for command, list in pairs(examples) do
        for _, code in ipairs(list) do
            _bridge_hard_reset()
            local ok, err = run(code)
            assert(ok, command .. " example " .. code .. " failed: " .. tostring(err))
        end
    end
end)

----------------------------------------------------------------

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
