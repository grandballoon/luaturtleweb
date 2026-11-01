-- Archimedean spiral: r = a * theta
-- The distance from the center grows in step with the angle, so each turn of
-- the spiral sits the same distance outside the last one.

local R = math.min(screen_width(), screen_height()) * 0.42
local turns = 6
local a = R / (turns * 2 * math.pi)
local steps = 900

local function point(theta)
    local r = a * theta
    return r * math.cos(theta), r * math.sin(theta)
end

pensize(2)
tracer(5)    -- show every 5th point
teleport(0, 0)
for i = 1, steps do
    local theta = i / steps * turns * 2 * math.pi
    pencolor(0.1, 0.3 + 0.4 * i / steps, 0.5)
    setpos(point(theta))
end
hideturtle()
