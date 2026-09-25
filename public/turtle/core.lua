-- turtle/core.lua
--
-- PUBLIC INTERFACE (stable, used by other modules):
--
--   Core.new(screen) → core instance
--     screen is optional; if omitted, a private Screen is created automatically.
--     screen:register(core) is called during construction.
--
--   Movement:    core:forward(dist), core:back(dist),
--                core:right(angle), core:left(angle),
--                core:circle(radius, extent, steps)
--   Absolute:    core:setpos(x,y), core:setx(x), core:sety(y),
--                core:setheading(angle), core:home(), core:teleport(x,y)
--   Pen:         core:penup(), core:pendown(), core:pensize(w),
--                core:pencolor(...), core:fillcolor(...), core:color(...)
--   Fill:        core:begin_fill(), core:end_fill(), core:is_filling()
--   Drawing:     core:dot(...), core:write(...), core:stamp(),
--                core:clearstamp(id), core:clearstamps(n)
--   Canvas:      core:clear(), core:reset()
--   Queries:     core:position(), core:heading(), core:isdown(),
--                core:isvisible(), core:towards(x,y), core:distance(x,y),
--                core:xcor(), core:ycor(), core:speed(n)
--   Visibility:  core:showturtle(), core:hideturtle()
--   Undo:        core:_push_undo(), core:_commit_undo_segments(),
--                core:undo() → {segments, current_state, previous_state} | nil,
--                core:setundobuffer(n), core:undobufferentries()
--   Head state:  core:get_head_state() → {x,y,angle,visible,...}  (Refactor 2, M2)
--   Segments:    core:visible_segments() → delegates to screen:visible_segments()
--
-- INTERNAL (do not use from other modules):
--
--   self.x, self.y, self.angle    — use position()/heading() or get_head_state()
--   self.pen_color, self.fill_color — use pencolor()/fillcolor()
--   self._undo_stack              — use undo API
--   self.filling, self.fill_vertices — internal to fill system
--   self.screen                   — shared screen; access via public API only
--   self.turtle_id                — assigned by screen:register(); read-only
--
-- NOTE: self.segments is an alias for self.screen.segments (same table).
--       Code that reads core.segments[i] continues to work. In multi-turtle
--       scenarios, this exposes the full shared log — use screen:visible_segments()
--       filtered by turtle_id for per-turtle queries.

local Core = {}
Core.__index = Core

function Core.new(screen)
    -- If no screen provided, create a private one (single-turtle convenience).
    if not screen then
        local Screen = require("turtle.screen")
        screen = Screen.new()
    end

    local self = setmetatable({}, Core)

    -- Shared state lives on the screen
    self.screen    = screen
    self.turtle_id = nil  -- assigned by screen:register() below

    -- Alias for backward compatibility: code that reads core.segments works.
    -- This is the SAME table as screen.segments.
    self.segments = screen.segments

    -- Position and heading (turtle-space: center origin, y-up)
    self.x     = 0
    self.y     = 0
    self.angle = 0  -- degrees, 0=east, CCW positive

    -- Pen state
    self.pen_down  = true
    self.pen_color = {1, 1, 1, 1}  -- RGBA, 0-1 range
    self.pen_size  = 2

    -- Fill state
    self.filling      = false
    self.fill_color   = {1, 1, 1, 1}
    self.fill_vertices = {}

    -- Turtle appearance
    self.visible = true
    self.shape   = "classic"

    -- Animation
    self.speed_setting = 5  -- 0=instant, 1=slowest, 10=fastest

    -- Undo stack: each entry records the state BEFORE a command and the
    -- segment indices that command added. undo() marks those indices hidden
    -- rather than truncating the shared log (enables per-turtle undo with
    -- interleaved segments from other turtles).
    self._undo_stack       = {}
    self._undo_buffer_size = 1000  -- nil = unlimited
    -- Set of segment log indices hidden by undo. Checked by
    -- screen:_filter_undo_hidden() inside visible_segments().
    self._hidden_indices   = {}

    -- Register with the screen (assigns self.turtle_id)
    screen:register(self)

    return self
end

----------------------------------------------------------------
-- Angle helpers
----------------------------------------------------------------

local RAD = math.pi / 180
local DEG = 180 / math.pi

function Core:_heading_rad()
    return self.angle * RAD
end

function Core:_dx_dy(distance)
    local rad = self:_heading_rad()
    return math.cos(rad) * distance, math.sin(rad) * distance
end

----------------------------------------------------------------
-- Color normalization
----------------------------------------------------------------

-- Accept (r,g,b) or (r,g,b,a). Auto-detect 0-1 vs 0-255 range.
function Core.normalize_color(r, g, b, a)
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

----------------------------------------------------------------
-- Segment log
----------------------------------------------------------------

-- Append an entry to the shared segment log.
-- Adds turtle_id so the renderer and visible_segments() can filter per-turtle.
-- Returns the log index.
function Core:_log(entry)
    entry.turtle_id = self.turtle_id
    return self.screen:_append(entry)
end

----------------------------------------------------------------
-- Movement
----------------------------------------------------------------

function Core:forward(distance)
    distance = distance or 0
    local dx, dy = self:_dx_dy(distance)
    local x0, y0 = self.x, self.y
    self.x = self.x + dx
    self.y = self.y + dy

    if self.pen_down and distance ~= 0 then
        self:_log({
            type  = "line",
            from  = {x0, y0},
            to    = {self.x, self.y},
            color = {table.unpack(self.pen_color)},
            width = self.pen_size,
        })
    end

    if self.filling then
        table.insert(self.fill_vertices, {self.x, self.y})
    end
end

function Core:back(distance)
    self:forward(-(distance or 0))
end

function Core:right(angle)
    self.angle = self.angle - (angle or 0)
end

function Core:left(angle)
    self.angle = self.angle + (angle or 0)
end

----------------------------------------------------------------
-- Absolute positioning
----------------------------------------------------------------

function Core:setpos(x, y)
    if type(x) == "table" then x, y = x[1], x[2] end
    local x0, y0 = self.x, self.y
    self.x = x
    self.y = y

    if self.pen_down then
        self:_log({
            type  = "line",
            from  = {x0, y0},
            to    = {self.x, self.y},
            color = {table.unpack(self.pen_color)},
            width = self.pen_size,
        })
    end

    if self.filling then
        table.insert(self.fill_vertices, {self.x, self.y})
    end
end

function Core:setx(x) self:setpos(x, self.y) end
function Core:sety(y) self:setpos(self.x, y) end

function Core:setheading(angle)
    self.angle = angle or 0
end

function Core:home()
    self:setpos(0, 0)
    self:setheading(0)
end

function Core:teleport(x, y)
    if type(x) == "table" then x, y = x[1], x[2] end
    self.x = x or self.x
    self.y = y or self.y
    if self.filling then
        table.insert(self.fill_vertices, {self.x, self.y})
    end
end

----------------------------------------------------------------
-- Circle / Arc
----------------------------------------------------------------

-- Python turtle convention: circle center is radius units to the LEFT of
-- the turtle. Positive radius = CCW arc, negative = CW arc.
function Core:circle(radius, extent, steps)
    radius = radius or 0
    extent = extent or 360
    if radius == 0 then return end

    if not steps then
        steps = math.max(4, math.floor(math.abs(extent) / 6))
    end

    local step_angle = extent / steps
    local step_len   = 2 * math.abs(radius) * math.sin(math.abs(step_angle) / 2 * RAD)

    if radius < 0 then step_angle = -step_angle end

    for _ = 1, steps do
        self:left(step_angle / 2)
        self:forward(step_len)
        self:left(step_angle / 2)
    end
end

----------------------------------------------------------------
-- Pen control
----------------------------------------------------------------

function Core:penup()   self.pen_down = false end
function Core:pendown() self.pen_down = true  end

function Core:pensize(width)
    if width then self.pen_size = math.max(1, width) end
    return self.pen_size
end

function Core:pencolor(r, g, b, a)
    if r == nil then return table.unpack(self.pen_color) end
    if type(r) == "string" then
        local colors = require("turtle.colors")
        local c = colors[r:lower()]
        if c then
            local alpha = type(g) == "number" and g or (c[4] or 1)
            self.pen_color = {c[1], c[2], c[3], alpha}
        end
        return
    end
    self.pen_color = Core.normalize_color(r, g, b, a)
end

function Core:fillcolor(r, g, b, a)
    if r == nil then return table.unpack(self.fill_color) end
    if type(r) == "string" then
        local colors = require("turtle.colors")
        local c = colors[r:lower()]
        if c then
            local alpha = type(g) == "number" and g or (c[4] or 1)
            self.fill_color = {c[1], c[2], c[3], alpha}
        end
        return
    end
    self.fill_color = Core.normalize_color(r, g, b, a)
end

function Core:color(pen, fill)
    if pen == nil and fill == nil then return self.pen_color, self.fill_color end
    if fill == nil then fill = pen end
    if pen then
        if type(pen) == "string" then self:pencolor(pen)
        elseif type(pen) == "table" then self:pencolor(pen[1], pen[2], pen[3], pen[4]) end
    end
    if fill then
        if type(fill) == "string" then self:fillcolor(fill)
        elseif type(fill) == "table" then self:fillcolor(fill[1], fill[2], fill[3], fill[4]) end
    end
end

----------------------------------------------------------------
-- Filling
----------------------------------------------------------------

function Core:begin_fill()
    self.filling      = true
    self.fill_vertices = {{self.x, self.y}}
end

function Core:end_fill()
    if not self.filling then return end
    self.filling = false
    if #self.fill_vertices >= 3 then
        self:_log({
            type     = "fill",
            vertices = self.fill_vertices,
            color    = {table.unpack(self.fill_color)},
        })
    end
    self.fill_vertices = {}
end

function Core:is_filling()
    return self.filling
end

----------------------------------------------------------------
-- Drawing extras
----------------------------------------------------------------

function Core:dot(size, r, g, b, a)
    size = size or math.max(self.pen_size + 4, self.pen_size * 2)
    local color
    if r then
        if type(r) == "string" then
            local colors = require("turtle.colors")
            local c = colors[r:lower()]
            if c then
                local alpha = type(g) == "number" and g or (c[4] or 1)
                color = {c[1], c[2], c[3], alpha}
            else
                color = {table.unpack(self.pen_color)}
            end
        else
            color = Core.normalize_color(r, g, b, a)
        end
    else
        color = {table.unpack(self.pen_color)}
    end
    self:_log({ type = "dot", pos = {self.x, self.y}, size = size, color = color })
end

function Core:write(text, _, align, font)
    text  = tostring(text or "")
    align = align or "left"
    self:_log({
        type    = "text",
        pos     = {self.x, self.y},
        content = text,
        align   = align,
        font    = font,
        color   = {table.unpack(self.pen_color)},
    })
end

----------------------------------------------------------------
-- Stamps
----------------------------------------------------------------

function Core:stamp()
    local id = self.screen._next_stamp_id
    self.screen._next_stamp_id = id + 1
    self:_log({
        type       = "stamp",
        id         = id,
        pos        = {self.x, self.y},
        heading    = self.angle,
        shape      = self.shape,
        color      = {table.unpack(self.pen_color)},
        fill_color = {table.unpack(self.fill_color)},
        size       = self.pen_size,
    })
    return id
end

function Core:clearstamp(stamp_id)
    self.screen._cleared_stamps[stamp_id] = true
end

function Core:clearstamps(n)
    -- Collect only this turtle's visible stamps (filtered by turtle_id).
    local stamp_ids = {}
    for _, seg in ipairs(self.screen:visible_segments()) do
        if seg.type == "stamp" and seg.turtle_id == self.turtle_id then
            table.insert(stamp_ids, seg.id)
        end
    end

    if n == nil then
        for _, id in ipairs(stamp_ids) do
            self.screen._cleared_stamps[id] = true
        end
    elseif n > 0 then
        for i = 1, math.min(n, #stamp_ids) do
            self.screen._cleared_stamps[stamp_ids[i]] = true
        end
    elseif n < 0 then
        for i = #stamp_ids + n + 1, #stamp_ids do
            if i >= 1 then
                self.screen._cleared_stamps[stamp_ids[i]] = true
            end
        end
    end
end

----------------------------------------------------------------
-- Canvas operations
----------------------------------------------------------------

function Core:clear()
    -- Clear this turtle's drawing; preserve turtle state.
    -- Wipes undo history and any open fill for this turtle.
    self.filling        = false
    self.fill_vertices  = {}
    self._undo_stack    = {}
    self._hidden_indices = {}  -- no longer need hidden markers; clear supersedes them
    -- Log a clear marker; _segments_after_clears() uses this as the per-turtle boundary.
    self:_log({ type = "clear" })
end

function Core:reset()
    -- Clear drawing AND reset turtle state to defaults.
    self.x           = 0
    self.y           = 0
    self.angle       = 0
    self.pen_down    = true
    self.pen_color   = {1, 1, 1, 1}
    self.pen_size    = 2
    self.filling     = false
    self.fill_vertices = {}
    self.fill_color  = {1, 1, 1, 1}
    self.visible     = true
    self._undo_stack  = {}
    self._hidden_indices = {}
    self:_log({ type = "clear" })
end

----------------------------------------------------------------
-- State queries
----------------------------------------------------------------

function Core:position() return self.x, self.y end
function Core:pos()      return self.x, self.y end
function Core:xcor()     return self.x end
function Core:ycor()     return self.y end
function Core:heading()  return self.angle end
function Core:isdown()   return self.pen_down end
function Core:isvisible() return self.visible end

function Core:towards(x, y)
    if type(x) == "table" then x, y = x[1], x[2] end
    return math.atan(y - self.y, x - self.x) * DEG
end

function Core:distance(x, y)
    if type(x) == "table" then x, y = x[1], x[2] end
    local dx, dy = x - self.x, y - self.y
    return math.sqrt(dx * dx + dy * dy)
end

----------------------------------------------------------------
-- Turtle visibility
----------------------------------------------------------------

function Core:showturtle() self.visible = true  end
function Core:hideturtle() self.visible = false end

----------------------------------------------------------------
-- Speed
----------------------------------------------------------------

function Core:speed(n)
    if n == nil then return self.speed_setting end
    self.speed_setting = math.max(0, math.min(10, math.floor(n)))
end

----------------------------------------------------------------
-- Visibility (delegates to screen)
----------------------------------------------------------------

-- Returns all currently visible segments across all turtles.
-- For per-turtle queries, filter the result by turtle_id.
-- (In multi-turtle scenarios, prefer screen:visible_segments() directly.)
function Core:visible_segments()
    return self.screen:visible_segments()
end

----------------------------------------------------------------
-- Undo (index-marking, per-turtle safe with interleaved segments)
----------------------------------------------------------------

-- Step 1 (called BEFORE the command): snapshot state and record pre-log count.
-- segment_indices is filled by _commit_undo_segments AFTER the command.
function Core:_push_undo()
    local cleared_copy = {}
    for k, v in pairs(self.screen._cleared_stamps) do cleared_copy[k] = v end

    local snap = {
        pre_log_count     = #self.screen.segments,  -- log position BEFORE command
        segment_indices   = {},                      -- filled after by _commit_undo_segments
        fill_vertex_count = #self.fill_vertices,
        -- Per-turtle state
        x           = self.x,
        y           = self.y,
        angle       = self.angle,
        pen_down    = self.pen_down,
        pen_color   = {table.unpack(self.pen_color)},
        pen_size    = self.pen_size,
        fill_color  = {table.unpack(self.fill_color)},
        filling     = self.filling,
        visible     = self.visible,
        -- Shared canvas state (safe to restore; changes here are infrequent)
        bg_color      = {table.unpack(self.screen.bg_color)},
        cleared_stamps = cleared_copy,
        next_stamp_id  = self.screen._next_stamp_id,
    }
    table.insert(self._undo_stack, snap)
    if self._undo_buffer_size and #self._undo_stack > self._undo_buffer_size then
        table.remove(self._undo_stack, 1)
    end
end

-- Step 2 (called AFTER the command): record which log indices this command added.
-- Because Lua is single-threaded, all indices from pre_log_count+1 to current
-- count were added by THIS turtle's command and only this command.
function Core:_commit_undo_segments()
    if #self._undo_stack == 0 then return end
    local snap = self._undo_stack[#self._undo_stack]
    for i = snap.pre_log_count + 1, #self.screen.segments do
        table.insert(snap.segment_indices, i)
    end
end

-- Undo the most recent command: mark its segments hidden and restore state.
-- Returns a description for animated undo (Refactor 4 / M4).
--
-- Return shape:
--   {
--     segments       = { seg, ... },  -- actual segment objects being hidden
--     current_state  = {x, y, angle}, -- turtle state BEFORE restoration
--     previous_state = {x, y, angle}, -- turtle state AFTER restoration
--   }
-- Returns nil if the undo stack is empty.
function Core:undo()
    if #self._undo_stack == 0 then return nil end
    local snap = table.remove(self._undo_stack)

    -- Capture current state BEFORE restoration so turtle.lua can animate from here.
    local cur_x, cur_y, cur_angle = self.x, self.y, self.angle

    -- Collect the actual segment objects being hidden (not just indices).
    local undone_segs = {}
    for _, idx in ipairs(snap.segment_indices) do
        table.insert(undone_segs, self.screen.segments[idx])
    end

    -- Mark segment indices as hidden — does NOT truncate the shared log,
    -- so other turtles' interleaved segments are unaffected.
    for _, idx in ipairs(snap.segment_indices) do
        self._hidden_indices[idx] = true
    end

    -- Restore fill vertices
    while #self.fill_vertices > snap.fill_vertex_count do
        table.remove(self.fill_vertices)
    end

    -- Restore per-turtle state
    self.x          = snap.x
    self.y          = snap.y
    self.angle      = snap.angle
    self.pen_down   = snap.pen_down
    self.pen_color  = snap.pen_color
    self.pen_size   = snap.pen_size
    self.fill_color = snap.fill_color
    self.filling    = snap.filling
    self.visible    = snap.visible

    -- Restore shared canvas state
    self.screen.bg_color        = snap.bg_color
    self.screen._cleared_stamps = snap.cleared_stamps
    self.screen._next_stamp_id  = snap.next_stamp_id

    -- Return description for animated undo (M4)
    return {
        segments       = undone_segs,
        current_state  = { x = cur_x,  y = cur_y,  angle = cur_angle },
        previous_state = { x = snap.x, y = snap.y, angle = snap.angle },
    }
end

function Core:setundobuffer(size)
    self._undo_buffer_size = size
    if size then
        while #self._undo_stack > size do
            table.remove(self._undo_stack, 1)
        end
    end
end

function Core:undobufferentries()
    return #self._undo_stack
end

return Core
