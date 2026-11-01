-- Rosette
-- One circle, drawn 36 times, turning 10 degrees between each: 36 * 10 = 360,
-- so the last circle lands where the first began. Rotational symmetry.

local r = math.min(screen_width(), screen_height()) * 0.2

local function hsv(h, s, v)
    local i = math.floor(h * 6)
    local f = h * 6 - i
    local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    i = i % 6
    if i == 0 then return v, t, p elseif i == 1 then return q, v, p
    elseif i == 2 then return p, v, t elseif i == 3 then return p, q, v
    elseif i == 4 then return t, p, v else return v, p, q end
end

speed(10)
for i = 1, 36 do
    pencolor(hsv(i / 36, 0.6, 0.85))
    circle(r)
    left(10)
end
hideturtle()
