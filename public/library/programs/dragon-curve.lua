-- Dragon curve
-- Fold a strip of paper in half again and again, then open every fold to a
-- right angle. Each level is two copies of the last, the second one turned.

local function dragon(length, depth, turn)
    if depth == 0 then
        forward(length)
        return
    end
    right(45 * turn)
    dragon(length / math.sqrt(2), depth - 1, 1)
    left(90 * turn)
    dragon(length / math.sqrt(2), depth - 1, -1)
    right(45 * turn)
end

-- The curve from (0, 0) to (L, 0) fits in x from -L/3 to 7L/6 and y
-- from -2L/3 to L/3.
local L = math.min(screen_width() * 0.84 / 1.5, screen_height() * 0.84)

pencolor("firebrick")
tracer(64)   -- show every 64th move: the curve has 2048 segments
teleport(-5 * L / 12, L / 6)
dragon(L, 11, 1)
hideturtle()
