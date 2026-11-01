-- Maurer rose
-- Walk along the rose r = sin(n * theta), but in big jumps of d degrees,
-- connecting each point to the next with a straight line. Because 71 and 360
-- share no factor, the jumps visit every whole degree before coming home.

local R = math.min(screen_width(), screen_height()) * 0.42
local n, d = 6, 71

local function point(degrees)
    local theta = math.rad(degrees)
    local r = R * math.sin(n * theta)
    return r * math.cos(theta), r * math.sin(theta)
end

bgcolor("midnightblue")
tracer(4)    -- show every 4th line

pencolor("lightskyblue")
pensize(1)
teleport(point(0))
for i = 1, 360 do setpos(point(i * d)) end

-- The rose itself, one degree at a time.
pencolor("gold")
pensize(2)
for i = 1, 360 do setpos(point(i)) end
hideturtle()
