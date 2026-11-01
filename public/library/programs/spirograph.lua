-- Spirograph (a hypotrochoid)
-- A wheel of radius r rolls around inside a ring of radius R, and a pen sits d
-- from the wheel's center. Since 8 / 5 is in lowest terms, the wheel goes
-- around the ring 5 times before the pattern closes.

local R, r, d = 8, 5, 5
local scale = math.min(screen_width(), screen_height()) * 0.42 / (R - r + d)
local steps = 1500

local function point(t)
    local x = (R - r) * math.cos(t) + d * math.cos((R - r) / r * t)
    local y = (R - r) * math.sin(t) - d * math.sin((R - r) / r * t)
    return scale * x, scale * y
end

bgcolor("ivory")
pensize(2)
tracer(8)    -- show every 8th point: the curve has 1500
teleport(point(0))
for i = 1, steps do
    local t = i / steps * 2 * math.pi * r
    pencolor(0.9 * i / steps, 0.2, 0.6)
    setpos(point(t))
end
hideturtle()
