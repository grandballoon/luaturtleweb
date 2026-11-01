-- Koch snowflake
-- Replace every straight side with four sides a third as long, with a bump in
-- the middle, then do the same to those, and so on. The outline grows by a
-- third each time, without end, while the area stays finite.

local function koch(length, depth)
    if depth == 0 then
        forward(length)
        return
    end
    koch(length / 3, depth - 1)
    left(60)
    koch(length / 3, depth - 1)
    right(120)
    koch(length / 3, depth - 1)
    left(60)
    koch(length / 3, depth - 1)
end

-- Every point stays within side / sqrt(3) of the center.
local side = math.min(screen_width(), screen_height()) * 0.42 * math.sqrt(3)

color("steelblue", "lightcyan")
tracer(10)   -- show every 10th move: the outline has 768 sides
teleport(-side / 2, side / (2 * math.sqrt(3)))
begin_fill()
for _ = 1, 3 do
    koch(side, 4)
    right(120)
end
end_fill()
hideturtle()
