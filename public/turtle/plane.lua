-- turtle/plane.lua
--
-- The coordinate plane: which rectangle of the turtle's world the canvas
-- shows, and graph paper and curves drawn on it, as pure functions over
-- values. The host (host.lua) keeps one plane per instance, logs what these
-- return, and projects its output through project() and project_turtles().
--
-- Turtles live in world units. Until a program says otherwise a world unit
-- is a pixel, with (0, 0) at the canvas's center and y up: the standard
-- plane. setworldcoordinates() and graph() make the canvas show a rectangle
-- of the world instead. The segment log stays in world units, and the host
-- projects segments and turtle states to pixels on the way out, so
-- renderers never know. As in Python turtle, only positions scale: pen
-- widths, dot sizes and fonts stay in pixels.
--
-- A rectangle is { left, bottom, right, top }. A plane is
--   { view  = the rectangle the canvas shows; nil for the standard plane,
--     paper = the rectangle graph() spreads across the canvas }.
-- Functions that turn world units into pixels also take the canvas's size
-- in pixels, w and h.
--
-- axes(), plot() and mark() draw on a graph: paper in graph units, and
-- where it sits in the world. A graph on the canvas (Plane.on_canvas) is
-- the plane's own paper, its graph units the world's. A graph in a box
-- (Plane.in_box) has paper of its own, scaled into a rectangle of the
-- world, so the rest of the canvas keeps its coordinates. A graph is
--   { paper  = its rectangle, in graph units,
--     cx, cy = the paper's center, ox, oy = where that sits in the world,
--     kx, ky = world units per graph unit across and up,
--     ux, uy = graph units per pixel across and up, for nudging text },
-- and world = o + (graph - c) · k.
--
-- Pure Lua with no platform code; runs on Lua 5.4 and LuaJIT alike.

local colors = require("turtle.colors")

local Plane = {}

-- The world rectangle graph() spreads its paper across: 80% of the
-- canvas, leaving a margin for the axes' numbers and names.
local FILL = 0.8

-- Grid lines a step of axes() may draw along one axis, at most.
local MAX_LINES = 500

-- Tolerance for a value landing on a grid line, or a point on the paper.
local EPS = 1e-9

local atan2 = math.atan2 or math.atan

----------------------------------------------------------------
-- Planes
----------------------------------------------------------------

-- The plane a program starts on: a pixel per unit, and paper the size of
-- the canvas.
function Plane.standard(w, h)
    return { view = nil, paper = { -w / 2, -h / 2, w / 2, h / 2 } }
end

-- Python turtle's setworldcoordinates: the canvas shows exactly the
-- rectangle r, which may run right to left or top to bottom.
function Plane.world(r)
    return {
        view  = { r[1], r[2], r[3], r[4] },
        paper = { math.min(r[1], r[3]), math.min(r[2], r[4]),
                  math.max(r[1], r[3]), math.max(r[2], r[4]) },
    }
end

-- graph(): paper r (left < right, bottom < top) across 80% of the canvas,
-- centered. With units "equal" (or nil), a unit is as long up as across,
-- so slopes and shapes look true and the paper fills the tighter way only;
-- with "stretch", it fills 80% both ways.
function Plane.graph(r, units, w, h)
    local sx = FILL * w / (r[3] - r[1])
    local sy = FILL * h / (r[4] - r[2])
    if units ~= "stretch" then
        sx = math.min(sx, sy)
        sy = sx
    end
    if not (sx > 0 and sy > 0) then return Plane.world(r) end   -- no canvas
    local cx, cy = (r[1] + r[3]) / 2, (r[2] + r[4]) / 2
    local hw, hh = w / 2 / sx, h / 2 / sy
    return { view = { cx - hw, cy - hh, cx + hw, cy + hh }, paper = { r[1], r[2], r[3], r[4] } }
end

-- The map from world units to pixels, x ↦ (x - cx) · sx and y ↦ (y - cy) · sy,
-- as cx, cy, sx, sy.
function Plane.scale(plane, w, h)
    local v = plane.view
    if not v then return 0, 0, 1, 1 end
    return (v[1] + v[3]) / 2, (v[2] + v[4]) / 2, w / (v[3] - v[1]), h / (v[4] - v[2])
end

-- How long a step of (dx, dy) world units looks, in pixels.
function Plane.pixels(plane, dx, dy, w, h)
    local _, _, sx, sy = Plane.scale(plane, w, h)
    return math.sqrt((dx * sx) ^ 2 + (dy * sy) ^ 2)
end

----------------------------------------------------------------
-- Projection to pixels
----------------------------------------------------------------

-- A heading in degrees as it looks once x and y scale by sx and sy.
local function seen_heading(angle, sx, sy)
    if sx == sy and sx > 0 then return angle end
    local a = math.rad(angle)
    return math.deg(atan2(math.sin(a) * sy, math.cos(a) * sx))
end

local function copy(t)
    local c = {}
    for k, v in pairs(t) do c[k] = v end
    return c
end

-- The visible segments, in pixels: copies with every position (and a
-- stamp's heading) projected. The standard plane returns them as they are.
function Plane.project(plane, segments, w, h)
    if not plane.view then return segments end
    local cx, cy, sx, sy = Plane.scale(plane, w, h)
    local function at(p) return { (p[1] - cx) * sx, (p[2] - cy) * sy } end
    local out = {}
    for i, seg in ipairs(segments) do
        local s = copy(seg)
        if seg.from then s.from = at(seg.from) end
        if seg.to then s.to = at(seg.to) end
        if seg.pos then s.pos = at(seg.pos) end
        if seg.heading then s.heading = seen_heading(seg.heading, sx, sy) end
        if seg.vertices then
            s.vertices = {}
            for k, v in ipairs(seg.vertices) do s.vertices[k] = at(v) end
        end
        out[i] = s
    end
    return out
end

-- One world point in pixels.
function Plane.point(plane, x, y, w, h)
    local cx, cy, sx, sy = Plane.scale(plane, w, h)
    return (x - cx) * sx, (y - cy) * sy
end

-- The world point at pixel (px, py): point()'s inverse, for where the
-- pointer is.
function Plane.unproject(plane, px, py, w, h)
    local cx, cy, sx, sy = Plane.scale(plane, w, h)
    return px / sx + cx, py / sy + cy
end

-- World units per pixel across and up, for nudging text a few pixels;
-- 0 with no canvas.
local function per_pixel(plane, w, h)
    local _, _, sx, sy = Plane.scale(plane, w, h)
    return sx ~= 0 and 1 / sx or 0, sy ~= 0 and 1 / sy or 0
end

-- Turtle states ({ x, y, angle, ... }), in pixels, likewise.
function Plane.project_turtles(plane, states, w, h)
    if not plane.view then return states end
    local cx, cy, sx, sy = Plane.scale(plane, w, h)
    local out = {}
    for i, t in ipairs(states) do
        local s = copy(t)
        s.x, s.y = (t.x - cx) * sx, (t.y - cy) * sy
        s.angle = seen_heading(t.angle, sx, sy)
        out[i] = s
    end
    return out
end

----------------------------------------------------------------
-- Graphs
----------------------------------------------------------------

-- The graph on the whole canvas: the plane's paper, in world units.
function Plane.on_canvas(plane, w, h)
    local ux, uy = per_pixel(plane, w, h)
    local p = plane.paper
    return { paper = { p[1], p[2], p[3], p[4] },
             cx = 0, cy = 0, ox = 0, oy = 0, kx = 1, ky = 1, ux = ux, uy = uy }
end

-- The options a box takes, in the order a message lists them, and the
-- size of a box that leaves out width or height.
Plane.BOX_FIELDS = { "x", "y", "width", "height", "units" }
Plane.BOX_SIZE   = 300

local function is_finite(v)
    return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

local function describe(v)
    if type(v) == "string" then return '"' .. v .. '"' end
    if type(v) == "number" or type(v) == "boolean" or v == nil then return tostring(v) end
    return "a " .. type(v)
end

-- nil if `box` describes a box for graph(), else what is wrong with it,
-- read as the rest of "graph: ...".
function Plane.check_box(box)
    local allowed = {}
    for _, f in ipairs(Plane.BOX_FIELDS) do allowed[f] = true end
    for k in pairs(box) do
        if not allowed[k] then
            return "a box has no option " .. describe(k) .. "; it takes "
                .. table.concat(Plane.BOX_FIELDS, ", ")
        end
    end
    for _, f in ipairs({ "x", "y" }) do
        if box[f] ~= nil and not is_finite(box[f]) then
            return "the box's " .. f .. " must be a number, got " .. describe(box[f])
        end
    end
    for _, f in ipairs({ "width", "height" }) do
        local v = box[f]
        if v ~= nil and not (is_finite(v) and v > 0) then
            return "the box's " .. f .. " must be a number more than 0, got " .. describe(v)
        end
    end
    if box.units ~= nil and box.units ~= "equal" and box.units ~= "stretch" then
        return 'the box\'s units must be "equal" or "stretch", got ' .. describe(box.units)
    end
    if (box.x == nil) ~= (box.y == nil) then
        return "give the box both x and y, or neither"
    end
    return nil
end

-- A graph of paper r (left < right, bottom < top) in a box: its top-left
-- corner at the world point (x, y), or centered on (0, 0) without them,
-- width by height world units. The paper spreads across 80% of the box,
-- as graph() spreads it across the canvas, with units "equal" (or nil)
-- or "stretch" alike: equal units look equal on screen even when the
-- world itself is stretched.
function Plane.in_box(plane, w, h, r, box)
    local bw, bh = box.width or Plane.BOX_SIZE, box.height or Plane.BOX_SIZE
    local left, top = box.x or -bw / 2, box.y or bh / 2
    local _, _, sx, sy = Plane.scale(plane, w, h)
    if sx == 0 or sy == 0 then sx, sy = 1, 1 end   -- no canvas: measure in world units
    -- Pixels per graph unit, across and up.
    local px = FILL * math.abs(bw * sx) / (r[3] - r[1])
    local py = FILL * math.abs(bh * sy) / (r[4] - r[2])
    if box.units ~= "stretch" then
        px = math.min(px, py)
        py = px
    end
    return {
        paper = { r[1], r[2], r[3], r[4] },
        cx = (r[1] + r[3]) / 2, cy = (r[2] + r[4]) / 2,
        ox = left + bw / 2, oy = top - bh / 2,
        kx = px / sx, ky = py / sy,   -- signed, so a flipped world shows the graph upright
        ux = 1 / px, uy = 1 / py,
    }
end

-- A graph point in world units, and back.
function Plane.to_world(g, x, y)
    return g.ox + (x - g.cx) * g.kx, g.oy + (y - g.cy) * g.ky
end

function Plane.to_graph(g, x, y)
    return g.cx + (x - g.ox) / g.kx, g.cy + (y - g.oy) / g.ky
end

-- Records drawn in graph units, as copies placed in the world.
local function placed(g, records)
    local function at(p) return { Plane.to_world(g, p[1], p[2]) } end
    local out = {}
    for i, rec in ipairs(records) do
        local s = copy(rec)
        if rec.from then s.from = at(rec.from) end
        if rec.to then s.to = at(rec.to) end
        if rec.pos then s.pos = at(rec.pos) end
        out[i] = s
    end
    return out
end

----------------------------------------------------------------
-- Graph paper
----------------------------------------------------------------

-- A grid step for a span of `span` units: 1, 2 or 5 times a power of ten,
-- making about 10 grid lines.
function Plane.nice_step(span)
    if not (span > 0) or span == math.huge then return 1 end
    local rough = span / 10
    local power = 10 ^ math.floor(math.log(rough) / math.log(10) + EPS)
    for _, m in ipairs({ 1, 2, 5 }) do
        if m * power >= rough * (1 - EPS) then return m * power end
    end
    return 10 * power
end

-- The multiples of step from lo to hi, or nil if there are too many.
local function multiples(lo, hi, step)
    local first, last = math.ceil(lo / step - EPS), math.floor(hi / step + EPS)
    if last - first + 1 > MAX_LINES then return nil end
    local out = {}
    for k = first, last do out[#out + 1] = k * step end
    return out
end

local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

local function ink(name) return copy(colors[name]) end

local AXIS_FONT = { "Arial", 10 }

-- Graph paper on graph g: a grid line every xstep across and ystep up
-- (nil picks a step, see nice_step), the axes through 0 (or along the
-- paper's nearest edge, when 0 is off it), each grid line's number beside
-- its axis, and the axes' names (default "x" and "y"). Returns the segment
-- records to log, in world units, or nil and why not.
function Plane.paper(g, xstep, ystep, xname, yname)
    local l, b, r, t = g.paper[1], g.paper[2], g.paper[3], g.paper[4]
    xstep = xstep or Plane.nice_step(r - l)
    ystep = ystep or Plane.nice_step(t - b)
    local xs, ys = multiples(l, r, xstep), multiples(b, t, ystep)
    if not xs then
        return nil, string.format("xstep %g would draw more than %d grid lines; use a bigger step", xstep, MAX_LINES)
    end
    if not ys then
        return nil, string.format("ystep %g would draw more than %d grid lines; use a bigger step", ystep, MAX_LINES)
    end
    local ux, uy = g.ux, g.uy
    local x0, y0 = clamp(0, l, r), clamp(0, b, t)   -- where the axes run

    local out = {}
    local function line(x1, y1, x2, y2, color)
        out[#out + 1] = { type = "line", from = { x1, y1 }, to = { x2, y2 }, color = ink(color), width = 1 }
    end
    local function text(x, y, dx, dy, content, align)
        out[#out + 1] = { type = "text", pos = { x + dx * ux, y + dy * uy }, content = tostring(content),
                          align = align, font = { AXIS_FONT[1], AXIS_FONT[2] }, color = ink("gray") }
    end

    for _, x in ipairs(xs) do line(x, b, x, t, "gainsboro") end
    for _, y in ipairs(ys) do line(l, y, r, y, "gainsboro") end
    line(l, y0, r, y0, "gray")
    line(x0, b, x0, t, "gray")
    -- 0 sits where the axes cross, so neither axis numbers it.
    for _, x in ipairs(xs) do
        if math.abs(x) > EPS then text(x, y0, 0, -15, string.format("%g", x), "center") end
    end
    for _, y in ipairs(ys) do
        if math.abs(y) > EPS then text(x0, y, -5, -5, string.format("%g", y), "right") end
    end
    text(r, y0, 0, -30, xname or "x", "right")
    text(x0, t, 0, 10, yname or "y", "center")
    return placed(g, out)
end

----------------------------------------------------------------
-- Curves and marks
----------------------------------------------------------------

-- The part of the segment from (x1, y1) to (x2, y2) inside rectangle r
-- (Liang–Barsky), as four numbers, or nil if none of it is.
local function clip(x1, y1, x2, y2, r)
    local dx, dy = x2 - x1, y2 - y1
    local enter, leave = 0, 1
    for _, edge in ipairs({ { -dx, x1 - r[1] }, { dx, r[3] - x1 }, { -dy, y1 - r[2] }, { dy, r[4] - y1 } }) do
        local p, q = edge[1], edge[2]
        if p == 0 then
            if q < 0 then return nil end
        else
            local u = q / p
            if p < 0 then
                if u > leave then return nil end
                enter = math.max(enter, u)
            else
                if u < enter then return nil end
                leave = math.min(leave, u)
            end
        end
    end
    return x1 + enter * dx, y1 + enter * dy, x1 + leave * dx, y1 + leave * dy
end

local function on(r, x, y)
    return x >= r[1] - EPS and x <= r[3] + EPS and y >= r[2] - EPS and y <= r[4] + EPS
end

local function finite(v) return v == v and v ~= math.huge and v ~= -math.huge end

-- y = f(x) across the paper r, sampled at samples + 1 evenly spaced x, as
-- line pieces { {x1, y1}, {x2, y2} } clipped to the paper. The curve breaks
-- wherever f gives nil (or an infinity, or nan), and a piece is kept only if
-- one of its ends is on the paper, so a curve that leaps past an asymptote
-- between two samples is not joined up across it. Returns nil and why not
-- if f gives anything but a number or nil.
function Plane.curve(f, r, samples)
    local pieces = {}
    local px, py
    for i = 0, samples do
        local x = r[1] + (r[3] - r[1]) * i / samples
        local y = f(x)
        if y ~= nil and type(y) ~= "number" then
            return nil, string.format("the function must return a number or nil, but f(%g) returned %s", x, type(y))
        end
        if y and not finite(y) then y = nil end
        if y and py and (on(r, px, py) or on(r, x, y)) then
            local x1, y1, x2, y2 = clip(px, py, x, y, r)
            if x1 and (x1 ~= x2 or y1 ~= y2) then   -- not just a touch of the edge
                pieces[#pieces + 1] = { { x1, y1 }, { x2, y2 } }
            end
        end
        px, py = x, y
    end
    return pieces
end

-- curve() on graph g's paper, its pieces placed in the world.
function Plane.plot(g, f, samples)
    local pieces, why = Plane.curve(f, g.paper, samples)
    if not pieces then return nil, why end
    local out = {}
    for i, piece in ipairs(pieces) do
        out[i] = { { Plane.to_world(g, piece[1][1], piece[1][2]) },
                   { Plane.to_world(g, piece[2][1], piece[2][2]) } }
    end
    return out
end

-- A dot 12 pixels wide at graph point (x, y) in `color`, and `label`
-- beside it (if any) in `label_color`: the segment records to log, in
-- world units.
function Plane.mark(g, x, y, color, label, label_color)
    local out = { { type = "dot", pos = { x, y }, size = 12, color = color } }
    if label ~= nil then
        out[2] = { type = "text", pos = { x + 9 * g.ux, y + 4 * g.uy }, content = tostring(label),
                   align = "left", font = { "Arial", 12 }, color = label_color }
    end
    return placed(g, out)
end

return Plane
