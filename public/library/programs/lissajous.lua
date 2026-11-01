-- Lissajous figure
-- x and y each swing back and forth like a pendulum, x 3 times while y swings
-- 4 times. Together they trace a knot that repeats exactly.

local A = screen_width() * 0.42
local B = screen_height() * 0.42
local a, b = 3, 4
local steps = 600

local function point(t)
    return A * math.sin(a * t + math.pi / 2), B * math.sin(b * t)
end

pensize(2)
pencolor("teal")
tracer(3)    -- show every 3rd point
teleport(point(0))
for i = 1, steps do
    setpos(point(i / steps * 2 * math.pi))
end
hideturtle()
