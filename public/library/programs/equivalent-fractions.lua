-- Equivalent fractions
-- 1/2, 2/4, 3/6 and 4/8 cut the same pie into more, smaller slices, but the
-- shaded part is always half of it. A slice is 1/n of a turn, so its arc is
-- circle(r, 360 / n).

local pies = { { 1, 2 }, { 2, 4 }, { 3, 6 }, { 4, 8 } }

local cell = screen_width() / #pies
local r = math.min(cell * 0.38, screen_height() * 0.3)

-- One slice, 1/n of the pie: out from the center along a radius, around the
-- edge, and back in. It ends at the center turned 1/n of a turn, ready for
-- the next slice.
local function slice(n)
    forward(r)
    left(90)
    circle(r, 360 / n)
    left(90)
    forward(r)
    left(180)
end

speed(8)
pensize(2)
for i, pie in ipairs(pies) do
    local k, n = pie[1], pie[2]
    local x = (i - 0.5) * cell - screen_width() / 2

    teleport(x, 14)
    setheading(90)
    pencolor("saddlebrown")
    for j = 1, n do
        fillcolor(j <= k and "orange" or "cornsilk")
        begin_fill()
        slice(n)
        end_fill()
    end

    teleport(x, 14 - r - 30)
    pencolor("black")
    write(k .. "/" .. n, false, "center", { "IBM Plex Mono", 16 })
end
hideturtle()
