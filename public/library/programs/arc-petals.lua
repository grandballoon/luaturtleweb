-- Petals from arcs
-- A petal is two arcs, each the same fraction of a circle, back to back.
-- After an arc of 1/f of a turn, turning 180 - 360/f degrees points the
-- turtle home along the second. The smaller the fraction, the thinner the
-- petal: 1/12 for the outer ring, 1/6 for the middle, 1/4 inside.

-- A petal of the given length, its arcs each 1/f of a circle. It ends where
-- it began, facing the same way.
local function petal(length, f)
    local arc = 360 / f
    local radius = length / (2 * math.sin(math.rad(arc / 2)))
    for _ = 1, 2 do
        circle(radius, arc)
        left(180 - arc)
    end
end

-- A ring of n petals, each of the given fraction, around the center.
local function ring(n, length, f, pen, fill)
    color(pen, fill)
    for _ = 1, n do
        -- A petal leans arc/2 left of the way it starts, so start that much
        -- to the right to point it straight out.
        right(180 / f)
        begin_fill()
        petal(length, f)
        end_fill()
        left(180 / f)
        right(360 / n)
    end
end

local L = math.min(screen_width(), screen_height()) * 0.45

speed(9)
pensize(2)
teleport(0, 0)
setheading(90)
ring(12, L, 12, "darkmagenta", "plum")
ring(8, L * 0.68, 6, "mediumvioletred", "hotpink")
ring(6, L * 0.4, 4, "darkorange", "gold")
dot(L * 0.14, "saddlebrown")
hideturtle()
