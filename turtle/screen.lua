-- turtle/screen.lua
--
-- PUBLIC INTERFACE (stable, used by other modules):
--
--   Screen.new() → screen instance
--
--   Shared state (read-only from outside):
--     screen.segments      — append-only segment log, shared by all turtles
--     screen.bg_color      — {r,g,b,a} background color, 0-1 range
--     screen.turtles       — ordered list of registered Core instances
--
--   Segment log:
--     screen:_append(entry)      → log_index  (called by Core:_log)
--     screen:register(core)      → turtle_id  (called by Core.new)
--
--   Background color:
--     screen:bgcolor()             → r,g,b,a
--     screen:bgcolor(r,g,b,a)      → sets bg_color
--     screen:bgcolor("name")       → sets bg_color by CSS name
--
--   Visibility pipeline (Refactor 3 — each filter independently testable):
--     screen:_segments_after_clears()         → segment list
--     screen:_filter_cleared_stamps(segs)     → segment list
--     screen:_filter_undo_hidden(segs)        → segment list
--     screen:visible_segments()               → composed result
--
-- INTERNAL (do not use from other modules):
--
--   screen._cleared_stamps    — set: stamp_id → true
--   screen._next_stamp_id     — global counter for unique stamp IDs

local Screen = {}
Screen.__index = Screen

-- Color normalization (mirrors Core.normalize_color; duplicated to avoid
-- a circular dependency between screen.lua and core.lua).
local function normalize_color(r, g, b, a)
    a = a or 1
    if r > 1 or g > 1 or b > 1 or a > 1 then
        r, g, b, a = r / 255, g / 255, b / 255, a / 255
    end
    return {
        math.max(0, math.min(1, r)),
        math.max(0, math.min(1, g)),
        math.max(0, math.min(1, b)),
        math.max(0, math.min(1, a)),
    }
end

function Screen.new()
    local self = setmetatable({}, Screen)
    self.segments        = {}            -- append-only log shared by all turtles
    self.bg_color        = {0, 0, 0, 1} -- default: black
    self.turtles         = {}            -- ordered registry of Core instances
    self._cleared_stamps = {}            -- set: stamp_id → true
    self._next_stamp_id  = 1            -- global stamp ID counter
    return self
end

-- Append a segment entry to the log.
-- Sets entry._log_index (used by undo's hidden-index filter).
-- Returns the log index.
function Screen:_append(entry)
    local idx = #self.segments + 1
    entry._log_index = idx
    table.insert(self.segments, entry)
    return idx
end

-- Register a Core instance with this screen.
-- Assigns core.turtle_id. Called automatically by Core.new(screen).
function Screen:register(core)
    table.insert(self.turtles, core)
    core.turtle_id = #self.turtles
    return core.turtle_id
end

-- Background color getter/setter.
function Screen:bgcolor(r, g, b, a)
    if r == nil then
        return table.unpack(self.bg_color)
    end
    if type(r) == "string" then
        local colors = require("turtle.colors")
        local c = colors[r:lower()]
        if c then
            local alpha = type(g) == "number" and g or (c[4] or 1)
            self.bg_color = {c[1], c[2], c[3], alpha}
        end
        return
    end
    self.bg_color = normalize_color(r, g, b, a)
end

----------------------------------------------------------------
-- Visibility pipeline (Refactor 3 — decomposed)
----------------------------------------------------------------

-- Filter 1: per-turtle clear boundaries.
-- For each turtle, find its most recent {type="clear"} entry.
-- Discard that turtle's segments at or before the boundary.
-- Other turtles' segments are unaffected.
function Screen:_segments_after_clears()
    -- Build per-turtle clear boundary: turtle_id → log index of most recent clear
    local last_clear = {}
    for i, seg in ipairs(self.segments) do
        if seg.type == "clear" then
            last_clear[seg.turtle_id] = i
        end
    end

    local results = {}
    for i, seg in ipairs(self.segments) do
        local boundary = last_clear[seg.turtle_id]
        if boundary == nil or i > boundary then
            table.insert(results, seg)
        end
    end
    return results
end

-- Filter 2: remove stamp segments whose ID has been cleared via clearstamp().
function Screen:_filter_cleared_stamps(segments)
    if not next(self._cleared_stamps) then return segments end
    local results = {}
    for _, seg in ipairs(segments) do
        if not (seg.type == "stamp" and self._cleared_stamps[seg.id]) then
            table.insert(results, seg)
        end
    end
    return results
end

-- Filter 3: remove segments hidden by per-turtle undo (implemented in M1.3).
-- Collects _hidden_indices from all registered cores and filters them out.
function Screen:_filter_undo_hidden(segments)
    -- Union all hidden indices across every turtle's undo system
    local hidden = nil
    for _, core in ipairs(self.turtles) do
        if core._hidden_indices and next(core._hidden_indices) then
            hidden = hidden or {}
            for idx in pairs(core._hidden_indices) do
                hidden[idx] = true
            end
        end
    end
    if not hidden then return segments end

    local results = {}
    for _, seg in ipairs(segments) do
        if not hidden[seg._log_index] then
            table.insert(results, seg)
        end
    end
    return results
end

-- Composed visibility filter: clear boundaries → cleared stamps → undo hidden.
function Screen:visible_segments()
    local segs = self:_segments_after_clears()
    segs = self:_filter_cleared_stamps(segs)
    segs = self:_filter_undo_hidden(segs)
    return segs
end

return Screen
