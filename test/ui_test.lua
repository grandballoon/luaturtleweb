-- test/ui_test.lua
--
-- A program's controls and input (public/turtle/ui.lua): checking options,
-- layout, and what each input event does, as plain values. Then the host's
-- commands built on it: handlers, widgets and their handles, when handlers
-- run, and the event loop.
--
-- Run from the repo root:  lua test/ui_test.lua

package.path = "public/?.lua;" .. package.path

local Host = require("turtle.host")
local UI   = require("turtle.ui")

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

-- Values as text, so tables compare by contents.
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

local function rejects(fn, expected)
    local ok, err = pcall(fn)
    if ok then error("expected an error: " .. expected, 2) end
    if not tostring(err):find(expected, 1, true) then
        error(string.format("expected %q, got %q", expected, tostring(err)), 2)
    end
end

-- The standard plane on an 800 by 600 canvas.
local W, H = 800, 600
local function place(x, y) return x, y end
local function layout(state) return UI.layout(state, place, W, H) end

-- One event on a state: the new state and its effects.
local function handle(state, e) return UI.handle(state, layout(state), e) end

local function down(x, y) return { type = "down", x = x, y = y } end
local function move(x, y) return { type = "move", x = x, y = y } end
local function up(x, y) return { type = "up", x = x, y = y } end
local function key(k, text) return { type = "key", key = k, text = text } end

-- Checking options ------------------------------------------------------------

test("a widget's options are checked, naming what is wrong", function()
    eq(UI.check("slider", { label = "size", min = 0, max = 10 }), nil, "good slider")
    eq(UI.check("slider", 5), 'options must be a table like {label = "size"}, got 5', "not a table")
    eq(UI.check("slider", { vaule = 3 }),
        'there is no option "vaule"; a slider takes label, min, max, value, step, x, y, width, onchange', "typo")
    eq(UI.check("slider", { min = "a" }), 'min must be a number, got "a"', "min")
    eq(UI.check("slider", { min = 5, max = 5 }), "max must be more than min, got 5 and 5", "empty range")
    eq(UI.check("slider", { x = 3 }), "give both x and y, or neither", "x alone")
    eq(UI.check("button", {}), "label is missing", "button without a label")
    eq(UI.check("toggle", { value = 1 }), "value must be true or false, got 1", "toggle value")
    eq(UI.check("radio", { options = {} }), 'options must be a list like {"red", "green"}, got a table', "no options")
    eq(UI.check("radio", { options = { "a" }, value = "b" }), 'value must be one of the options, got "b"', "radio value")
    eq(UI.check("textfield", { onsubmit = 3 }), "onsubmit must be a function, got 3", "handler")
end)

-- Adding and laying out -------------------------------------------------------

test("a slider starts at its value, snapped to its steps and range", function()
    local s, id = UI.add(UI.new(), "slider", { min = 0, max = 10, value = 3.4 })
    eq(s.widgets[id].value, 3, "snapped to whole steps")
    s, id = UI.add(s, "slider", { min = 0, max = 1, value = 0.333 })
    eq(s.widgets[id].value, 0.33, "a hundredth of a fractional range")
    s, id = UI.add(s, "slider", { min = 0, max = 1, step = 0.1, value = 0.3 })
    eq(s.widgets[id].value, 0.3, "no rounding noise")
    s, id = UI.add(s, "slider", { min = 0, max = 10, value = 99 })
    eq(s.widgets[id].value, 10, "clamped")
    s, id = UI.add(s, "slider", { min = 20, max = 30 })
    eq(s.widgets[id].value, 20, "min by default")
end)

test("adding returns a new state and leaves the old one alone", function()
    local before = UI.new()
    local after = UI.add(before, "toggle", { label = "on" })
    eq(#before.order, 0, "old state")
    eq(#after.order, 1, "new state")
end)

test("widgets without a position stack down the top-left corner", function()
    local s = UI.new()
    s = UI.add(s, "slider", { label = "size" })
    s = UI.add(s, "button", { label = "Go" })
    s = UI.add(s, "radio", { options = { "a", "b" } })
    local r = layout(s)
    eq({ r[1].x, r[1].y, r[1].w, r[1].h }, { -384, 284, 200, 38 }, "slider")
    eq({ r[2].x, r[2].y, r[2].h }, { -384, 284 - 38 - 10, 30 }, "button below it")
    eq({ r[3].y, r[3].h }, { 284 - 38 - 10 - 30 - 10, 48 }, "radio group below that")
    eq(r[1].text, "size: 0", "a slider's label shows its value")
end)

test("a widget with x and y has its top-left corner at that world point", function()
    local s = UI.add(UI.new(), "button", { label = "Go", x = 10, y = 20 })
    local r = UI.layout(s, function(x, y) return x * 2, y * 2 end, W, H)
    eq({ r[1].x, r[1].y }, { 20, 40 }, "placed through the plane")
end)

test("a radio group lays out its options and marks the chosen one", function()
    local s = UI.add(UI.new(), "radio", { label = "color", options = { "red", 2 }, value = 2 })
    local r = layout(s)[1]
    eq(r.options, { "red", "2" }, "options as text")
    eq(r.selected, 2, "chosen")
    eq(r.h, 18 + 2 * 24, "label row and two options")
end)

-- The pointer -----------------------------------------------------------------

test("a press off every widget clicks, drags and releases the canvas", function()
    local s = UI.add(UI.new(), "button", { label = "Go" })
    local fx
    s, fx = handle(s, down(0, 0))
    eq(fx, { { kind = "click", x = 0, y = 0 } }, "click")
    s, fx = handle(s, move(5, 6))
    eq(fx, { { kind = "drag", x = 5, y = 6 } }, "drag")
    s, fx = handle(s, up(7, 8))
    eq(fx, { { kind = "release", x = 7, y = 8 } }, "release")
    s, fx = handle(s, move(9, 9))
    eq(fx, {}, "no drag once released")
end)

test("a slider follows the pointer from the press, changing as it goes", function()
    local s, id = UI.add(UI.new(), "slider", { min = 0, max = 100, x = 0, y = 0, width = 216 })
    -- The track runs from x = 8 to x = 208, at y = -28.
    local fx
    s, fx = handle(s, down(108, -28))
    eq(fx, { { kind = "change", id = id, value = 50 } }, "pressed in the middle")
    eq(layout(s)[1].pressed, true, "pressed")
    s, fx = handle(s, move(500, 300))
    eq(fx, { { kind = "change", id = id, value = 100 } }, "dragged past the end, even off the slider")
    s, fx = handle(s, move(600, 300))
    eq(fx, {}, "no change, no effect")
    s, fx = handle(s, up(600, 300))
    eq(fx, {}, "letting go changes nothing")
    eq(s.widgets[id].value, 100, "value")
end)

test("a button clicks when let go over it, and not when let go elsewhere", function()
    local s, id = UI.add(UI.new(), "button", { label = "Go", x = 0, y = 0 })
    local fx
    s, fx = handle(s, down(10, -10))
    eq(fx, {}, "nothing on the press")
    s, fx = handle(s, up(12, -12))
    eq(fx, { { kind = "press", id = id } }, "clicked")
    s = handle(s, down(10, -10))
    s, fx = handle(s, up(300, 300))
    eq(fx, {}, "dragged off first")
end)

test("a toggle flips when clicked", function()
    local s, id = UI.add(UI.new(), "toggle", { label = "on", x = 0, y = 0 })
    local fx
    s = handle(s, down(5, -5))
    s, fx = handle(s, up(5, -5))
    eq(fx, { { kind = "change", id = id, value = true } }, "on")
    s = handle(s, down(5, -5))
    s, fx = handle(s, up(5, -5))
    eq(fx, { { kind = "change", id = id, value = false } }, "off")
end)

test("a radio option is chosen by clicking it", function()
    local s, id = UI.add(UI.new(), "radio", { label = "color", options = { "red", "green" }, x = 0, y = 0 })
    -- Label row 0..-18, red -18..-42, green -42..-66.
    local fx
    s = handle(s, down(5, -50))
    s, fx = handle(s, up(5, -50))
    eq(fx, { { kind = "change", id = id, value = "green" } }, "green")
    s = handle(s, down(5, -50))
    s, fx = handle(s, up(5, -50))
    eq(fx, {}, "already chosen")
    s = handle(s, down(5, -10))
    s, fx = handle(s, up(5, -10))
    eq(fx, {}, "the label is no option")
end)

-- The keyboard ----------------------------------------------------------------

test("keys go to the program until a text field has them", function()
    local s, id = UI.add(UI.new(), "textfield", { x = 0, y = 0 })
    local fx
    s, fx = handle(s, key("a", "a"))
    eq(fx, { { kind = "keypress", key = "a" } }, "keypress")
    s, fx = handle(s, { type = "keyup", key = "a" })
    eq(fx, { { kind = "keyrelease", key = "a" } }, "keyrelease")
    s = handle(s, down(5, -5))
    eq(s.focus, id, "focused by a click")
    s, fx = handle(s, key("h", "H"))
    eq(fx, { { kind = "change", id = id, value = "H" } }, "typed")
    s, fx = handle(s, { type = "keyup", key = "h" })
    eq(fx, {}, "the program doesn't hear it")
    s = handle(s, down(300, 300))
    eq(s.focus, nil, "a click elsewhere takes the keyboard back")
end)

test("a text field edits at its caret, by character", function()
    local s, id = UI.add(UI.new(), "textfield", { value = "héllo", x = 0, y = 0 })
    s = handle(s, down(5, -5))
    eq(s.widgets[id].caret, 5, "caret at the end, in characters")
    s = handle(s, key("left"))
    s = handle(s, key("left"))
    local fx
    s, fx = handle(s, key("backspace"))
    eq(fx, { { kind = "change", id = id, value = "hélo" } }, "backspace")
    s = handle(s, key("home"))
    s = handle(s, key("delete"))
    s = handle(s, key("space", " "))
    eq(s.widgets[id].value, " élo", "delete, then a space")
    s, fx = handle(s, key("return"))
    eq(fx, { { kind = "submit", id = id, value = " élo" } }, "submit")
    s = handle(s, { type = "blur" })
    eq(s.focus, nil, "blur drops the focus")
end)

test("key names: single characters in lower case, and the named keys' spellings", function()
    eq(UI.key_name("A"), "a", "letter")
    eq(UI.key_name(" "), "space", "space")
    eq(UI.key_name("Up"), "up", "Tk's name")
    eq(UI.key_name("Return"), "return", "return")
    eq(UI.key_name("enter"), "return", "enter")
    eq(UI.key_name("lefty"), nil, "not a key")
end)

-- The host --------------------------------------------------------------------

-- A host whose event loop takes events from `script`, a list of lists:
-- each wait feeds the next list, and the loop ends when the script does.
local function scripted(script, opts)
    opts = opts or {}
    local host
    local step = 0
    opts.width, opts.height = W, H
    opts.wait_input = function()
        step = step + 1
        if not script[step] then return false end
        for _, e in ipairs(script[step]) do host.input(e) end
        return true
    end
    host = Host.new(opts)
    return host
end

local function run(host, code)
    local env = host.env()
    assert(load(code, "user_code", "t", env))()
    host.listen()
    return env
end

test("handlers get world points and keys from the event loop", function()
    local host = scripted({ { down(10, 20), move(30, 40), up(50, 60) }, { key("up"), key("q", "q") } })
    local env = run(host, [[
        log = {}
        onclick(function(x, y) log[#log + 1] = "click " .. x .. " " .. y end)
        ondrag(function(x, y) log[#log + 1] = "drag " .. x .. " " .. y end)
        onrelease(function(x, y) log[#log + 1] = "release " .. x .. " " .. y end)
        onkeypress(function(k) log[#log + 1] = "up " .. k end, "Up")
        onkeypress(function(k) log[#log + 1] = "any " .. k end)
    ]])
    eq(env.log, { "click 10 20", "drag 30 40", "release 50 60", "up up", "any up", "any q" }, "log")
end)

test("handler points are in the program's world units", function()
    local host = scripted({ { down(400, 300) } })
    local env = run(host, [[
        setworldcoordinates(0, 0, 10, 10)
        onclick(function(x, y) at = {x, y} end)
    ]])
    eq(env.at, { 10, 10 }, "the canvas's top-right corner")
end)

test("a slider's value is live, and its onchange runs in the loop", function()
    local host = scripted({ { down(-384 + 108, 284 - 28), up(-384 + 108, 284 - 28) } })
    local env = run(host, [[
        seen = {}
        s = slider({min = 0, max = 100, width = 216, onchange = function(v) seen[#seen + 1] = v end})
    ]])
    eq(env.s.value, 50, "value")
    eq(env.seen, { 50 }, "onchange")
end)

test("a widget's handle sets its value and label, and removes it", function()
    local host = Host.new({ width = W, height = H })
    local env = host.env()
    local s = env.slider({ label = "size", min = 0, max = 10 })
    s.value = 7.6
    eq(s.value, 8, "snapped")
    s.label = "width"
    eq(host.ui().widgets[1].text, "width: 8", "shown")
    rejects(function() s.value = "big" end, 'slider: value must be a number, got "big"')
    rejects(function() s.colour = "red" end, "slider: can't set colour; set its value or label")
    s:remove()
    eq(#host.ui().widgets, 0, "removed")
    eq(s.value, nil, "nothing to read once removed")
    rejects(function() s.value = 1 end, "slider: this slider was removed")
end)

test("a bad widget call is rejected like any command, with examples", function()
    local env = Host.new().env()
    rejects(function() env.slider() end, "slider: options is missing")
    rejects(function() env.button({ text = "Go" }) end, 'button: there is no option "text"')
    local ok, err = pcall(env.button, {})
    assert(not ok)
    eq(Host.command_usage(err).command, "button", "usage")
    rejects(function() env.onkeypress(print, "lefty") end,
        'onkeypress: key must be a key name like "left", "space" or "a", got "lefty"')
end)

test("input waits for a safe point: handlers run between commands", function()
    local host = Host.new({ width = W, height = H })
    local env = host.env()
    local log = {}
    env.onclick(function() log[#log + 1] = "click" end)
    host.input(down(0, 0))
    eq(log, {}, "not yet")
    env.speed(0)
    eq(log, { "click" }, "before the next command")
end)

test("a handler's own commands don't run the handlers again", function()
    local host = Host.new({ width = W, height = H })
    local env = host.env()
    local depth, deepest, calls = 0, 0, 0
    env.onkeypress(function()
        calls = calls + 1
        depth = depth + 1
        deepest = math.max(deepest, depth)
        if calls == 1 then host.input(key("x")) end   -- more input arrives while it runs
        env.forward(1)
        depth = depth - 1
    end)
    host.input(key("x"))
    env.speed(0)
    eq(deepest, 1, "never nested")
    eq(calls, 2, "the input that came in meanwhile ran after it")
end)

test("drags and changes waiting together collapse to the latest", function()
    local host = Host.new({ width = W, height = H })
    local env = host.env()
    local drags = {}
    env.ondrag(function(x) drags[#drags + 1] = x end)
    host.input(down(0, 0))
    host.input(move(1, 0))
    host.input(move(2, 0))
    host.input(move(3, 0))
    env.speed(0)
    eq(drags, { 3 }, "one drag, to where the pointer is now")
end)

test("the UI says what the program wants", function()
    local host = Host.new({ width = W, height = H })
    local env = host.env()
    eq(host.ui(), { widgets = {}, pointer = false, keys = false, active = false }, "nothing")
    local v = host.ui_version()
    env.onclick(print)
    eq(host.ui().pointer, true, "pointer")
    assert(host.ui_version() ~= v, "version changes")
    env.onclick(nil)
    env.textfield({})
    eq({ host.ui().pointer, host.ui().keys, host.ui().active }, { false, true, true }, "a text field wants keys")
end)

test("done() and the end of a program listen only while there is something to hear", function()
    local waits = 0
    local host = Host.new({ wait_input = function() waits = waits + 1; return false end })
    host.env().done()
    eq(waits, 0, "no handlers, no wait")
    host.env().onclick(print)
    host.env().done()
    eq(waits, 1, "waits once a handler is set")
end)

test("onkey is onkeyrelease, and onscreenclick is onclick", function()
    local host = scripted({ { { type = "keyup", key = "a" }, down(1, 2) } })
    local env = run(host, [[
        onkey(function() released = true end, "a")
        onscreenclick(function(x, y) clicked = x + y end)
    ]])
    eq({ env.released, env.clicked }, { true, 3 }, "aliases")
end)

print(passed .. " passed, " .. failures .. " failed")
if failures > 0 then os.exit(1) end
