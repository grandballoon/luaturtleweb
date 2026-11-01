-- Rose curve: r = cos(k * theta)
-- In polar coordinates a point is a distance r at an angle theta. Here the
-- distance swings in and out as the angle turns. With k = 7/4 the petals
-- only close up after the angle has gone around 4 times.

local R = math.min(screen_width(), screen_height()) * 0.42
local k = 7 / 4
local turns = 4
local steps = 1200

-- A color for each fraction of the way around the color wheel.
local function hsv(h, s, v)
    local i = math.floor(h * 6)
    local f = h * 6 - i
    local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    i = i % 6
    if i == 0 then return v, t, p elseif i == 1 then return q, v, p
    elseif i == 2 then return p, v, t elseif i == 3 then return p, q, v
    elseif i == 4 then return t, p, v else return v, p, q end
end

local function point(theta)
    local r = R * math.cos(k * theta)
    return r * math.cos(theta), r * math.sin(theta)
end

bgcolor("black")
pensize(2)
tracer(6)    -- show every 6th point: the curve has 1200
teleport(point(0))
for i = 1, steps do
    local theta = i / steps * turns * 2 * math.pi
    pencolor(hsv(i / steps, 0.7, 1))
    setpos(point(theta))
end
hideturtle()
