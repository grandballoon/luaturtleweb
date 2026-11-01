-- Times tables on a circle
-- Put N points around a circle and join each point i to point m * i, counting
-- around mod N. Times 2 draws a cardioid; try m = 3, 4, 34 or 51.

local R = math.min(screen_width(), screen_height()) * 0.42
local N, m = 200, 2

local function hsv(h, s, v)
    local i = math.floor(h * 6)
    local f = h * 6 - i
    local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    i = i % 6
    if i == 0 then return v, t, p elseif i == 1 then return q, v, p
    elseif i == 2 then return p, v, t elseif i == 3 then return p, q, v
    elseif i == 4 then return t, p, v else return v, p, q end
end

local function point(i)
    local theta = 2 * math.pi * i / N
    return R * math.cos(theta), R * math.sin(theta)
end

speed(5)
pencolor("gray")
teleport(0, -R)
circle(R)

for i = 1, N - 1 do
    pencolor(hsv(i / N, 0.8, 0.85))
    teleport(point(i))
    setpos(point(m * i % N))
end
hideturtle()
