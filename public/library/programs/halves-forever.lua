-- Halves forever
-- Left: shade half the circle, then half of what's left, then half of that.
-- 1/2 + 1/4 + 1/8 + ... never stops adding, yet never passes 1.
-- Right: split what's left into quarters and give one each to three colors.
-- 1/4 + 1/16 + 1/64 + ... is how much each color gets, so it adds up to 1/3.

local r = math.min(screen_width() * 0.2, screen_height() * 0.36)
local ROUNDS = 10

-- A slice that is the given fraction of a turn, from the center out and
-- back. It ends at the center, turned past the slice.
local function slice(fraction, color)
    fillcolor(color)
    begin_fill()
    forward(r)
    left(90)
    circle(r, 360 * fraction)
    left(90)
    forward(r)
    left(180)
    end_fill()
end

speed(8)
pensize(1.5)
pencolor("dimgray")

-- Writes a label under the pie centered at x.
local function label(x, text)
    teleport(x, -r - 30)
    pencolor("black")
    write(text, false, "center", { "IBM Plex Mono", 14 })
    pencolor("dimgray")
end

-- Halves: each slice half the one before.
teleport(-screen_width() / 4, 0)
setheading(90)
local shades = { "royalblue", "lightskyblue" }
local piece = 1 / 2
for i = 1, ROUNDS do
    slice(piece, shades[i % 2 + 1])
    piece = piece / 2
end
label(-screen_width() / 4, "1/2 + 1/4 + 1/8 + … = 1")

-- Quarters: three slices of a quarter of what's left, then the same again
-- in the quarter that remains.
teleport(screen_width() / 4, 0)
setheading(90)
local thirds = { "crimson", "goldenrod", "seagreen" }
piece = 1 / 4
for _ = 1, ROUNDS / 2 do
    for _, color in ipairs(thirds) do slice(piece, color) end
    piece = piece / 4
end
label(screen_width() / 4, "1/4 + 1/16 + … = 1/3")
hideturtle()
