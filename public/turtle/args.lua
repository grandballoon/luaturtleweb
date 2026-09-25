-- turtle/args.lua
--
-- Argument checking for the public turtle API.
--
-- Each command validates its arguments before doing anything, and a bad call
-- stops the program with a message a learner can act on:
--
--   circle: radius must be a number, got nil
--   circle: radius is missing
--   pencolor: color must be a known color name, got "rde"
--   penup takes no arguments, but got 1
--
-- A command describes its parameters with a check function that consumes
-- the call's arguments in order through a cursor:
--
--   function(a) a:req("radius", args.NUMBER); a:opt("extent", args.NUMBER) end
--
-- Anything left unconsumed afterwards is an error, so a no-argument command
-- needs no check at all. Required parameters reject nil; optional ones accept
-- it, as usual in Lua, so a caller can skip one: circle(50, nil, 8).
--
-- Errors are raised at level 0 (no "file:line:" prefix). worker.js finds the
-- learner's own line on the stack, so a library position would only mislead.
--
-- Pure Lua with no platform code, so it runs under plain `lua` for tests.

local colors = require("turtle.colors")

local args = {}

----------------------------------------------------------------
-- Describing values in messages
----------------------------------------------------------------

local MAX_SHOWN = 24

-- How a value reads after "got": nil, 12, "red", a table.
function args.describe(v)
    local t = type(v)
    if t == "string" then
        if #v > MAX_SHOWN then v = v:sub(1, MAX_SHOWN) .. "…" end
        return '"' .. v .. '"'
    elseif t == "number" then
        if v ~= v then return "nan" end
        return tostring(v)
    elseif t == "nil" or t == "boolean" then
        return tostring(v)
    end
    return "a " .. t
end

----------------------------------------------------------------
-- Kinds: function(value) → nil if acceptable, else what was expected
----------------------------------------------------------------

local function is_finite(v)
    return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

local function is_whole(v)
    return is_finite(v) and v == math.floor(v)
end

function args.NUMBER(v)
    if is_finite(v) then return nil end
    return type(v) == "number" and "a finite number" or "a number"
end

function args.WHOLE(v)
    if is_whole(v) then return nil end
    return "a whole number"
end

-- A whole number of at least 1, e.g. how many steps to draw a circle in.
function args.COUNT(v)
    if is_whole(v) and v >= 1 then return nil end
    return "a whole number of at least 1"
end

function args.BOOLEAN(v)
    if type(v) == "boolean" then return nil end
    return "true or false"
end

-- Any value at all, as long as there is one (write() accepts anything).
function args.VALUE(v)
    if v ~= nil then return nil end
    return "a value"
end

function args.COLOR_NAME(v)
    if type(v) == "string" and colors[v:lower()] then return nil end
    return type(v) == "string" and "a known color name" or "a color name"
end

-- A color as one value: a name, or a table of red, green, blue (and alpha).
function args.COLOR_VALUE(v)
    if type(v) == "string" then return args.COLOR_NAME(v) end
    if type(v) == "table" and is_finite(v[1]) and is_finite(v[2]) and is_finite(v[3])
        and (v[4] == nil or is_finite(v[4])) then
        return nil
    end
    return 'a color name like "red" or a table like {1, 0, 0}'
end

-- write()'s font: {family, size}, as in the command reference.
function args.FONT(v)
    if type(v) == "table" and type(v[1]) == "string" and is_finite(v[2]) then return nil end
    return 'a table like {"Arial", 16}'
end

-- One of a fixed set of strings: args.one_of("left", "center", "right").
function args.one_of(...)
    local allowed, shown = {}, {}
    for i = 1, select("#", ...) do
        local s = select(i, ...)
        allowed[s] = true
        shown[i] = '"' .. s .. '"'
    end
    local expects = #shown == 1 and shown[1]
        or table.concat(shown, ", ", 1, #shown - 1) .. " or " .. shown[#shown]
    return function(v)
        if allowed[v] then return nil end
        return expects
    end
end

----------------------------------------------------------------
-- The cursor: one call's arguments, consumed in order
----------------------------------------------------------------

local Cursor = {}
Cursor.__index = Cursor

-- The most recent rejected call, as { command = name as typed, message = the
-- error raised }. Lets the host tell a misused command's error apart from any
-- other (see args.failed_command); nil until a call is rejected.
args.last_failure = nil

local function fail(command, message)
    args.last_failure = { command = command, message = message }
    error(message, 0)
end

function Cursor:_fail(detail)
    fail(self.command, self.command .. ": " .. detail)
end

function Cursor:_fail_kind(name, expects, v)
    self:_fail(name .. " must be " .. expects .. ", got " .. args.describe(v))
end

function Cursor:_has_more()
    return self.i <= self.n
end

function Cursor:_peek()
    return self.values[self.i]
end

-- Required parameter: must be passed, and must fit kind.
function Cursor:req(name, kind)
    self.min = self.min + 1
    self.max = self.max + 1
    if not self:_has_more() then self:_fail(name .. " is missing") end
    local v = self:_peek()
    local expects = kind(v)
    if expects then self:_fail_kind(name, expects, v) end
    self.i = self.i + 1
end

-- Optional parameter: may be left out or nil; otherwise must fit kind.
function Cursor:opt(name, kind)
    self.max = self.max + 1
    if not self:_has_more() then return end
    local v = self:_peek()
    if v ~= nil then
        local expects = kind(v)
        if expects then self:_fail_kind(name, expects, v) end
    end
    self.i = self.i + 1
end

-- A point: x, y as two numbers, or one table {x, y}.
function Cursor:point()
    if type(self:_peek()) == "table" then
        local p = self:_peek()
        if not (is_finite(p[1]) and is_finite(p[2])) then
            self:_fail_kind("point", "a table of two numbers like {10, 20}", p)
        end
        self.min, self.max, self.i = self.min + 1, self.max + 1, self.i + 1
        return
    end
    self:req("x", args.NUMBER)
    self:req("y", args.NUMBER)
end

-- An optional color, as pencolor() and friends take it:
--   "name"  or  "name", alpha  or  red, green, blue  or  red, green, blue, alpha
-- Leaving it out is fine (pencolor() reads the color, dot(10) uses the pen's).
function Cursor:opt_color()
    if not self:_has_more() then return end
    local v = self:_peek()
    if type(v) == "string" then
        self:opt("color", args.COLOR_NAME)
        self:opt("alpha", args.NUMBER)
    elseif type(v) == "number" then
        self:req("red", args.NUMBER)
        self:req("green", args.NUMBER)
        self:req("blue", args.NUMBER)
        self:opt("alpha", args.NUMBER)
    elseif v == nil and self.i == self.n then
        self:opt("color", args.VALUE)  -- a trailing nil: same as leaving it out
    else
        self:_fail_kind("color", 'a color name like "red", or red, green, blue numbers', v)
    end
end

-- After the check function: nothing may be left over.
function Cursor:_finish()
    if not self:_has_more() then return end
    local takes
    if self.max == 0 then
        takes = "takes no arguments"
    elseif self.min == self.max then
        takes = "takes " .. self.max .. (self.max == 1 and " argument" or " arguments")
    else
        takes = "takes at most " .. self.max .. (self.max == 1 and " argument" or " arguments")
    end
    fail(self.command, self.command .. " " .. takes .. ", but got " .. self.n)
end

----------------------------------------------------------------
-- Entry points
----------------------------------------------------------------

-- Validates a call to `command` with arguments `...` against `check`
-- (nil means the command takes no arguments). Returns nothing; raises on
-- the first problem found.
function args.check(command, check, ...)
    local cursor = setmetatable({
        command = command,
        values  = { ... },
        n       = select("#", ...),
        i       = 1,
        min     = 0,
        max     = 0,
    }, Cursor)
    if check then check(cursor) end
    cursor:_finish()
end

-- Raised when a turtle method is called with a dot instead of a colon,
-- e.g. t.forward(10), which passes 10 as the turtle itself.
function args.fail_method_call(command)
    fail(command, command .. ": call a turtle's commands with a colon, like t:" .. command .. "(...)")
end

-- The command (as typed) whose rejected call raised `err`, or nil if `err`
-- came from anywhere else: a runtime error, a stop, the learner's own error().
function args.failed_command(err)
    local f = args.last_failure
    if f and f.message == err then return f.command end
    return nil
end

return args
