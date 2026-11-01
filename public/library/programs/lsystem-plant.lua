-- L-system plant
-- Start from the word X and rewrite it five times with two rules, then read
-- the result as turtle moves: F steps forward, + and - turn 25 degrees, [
-- saves where the turtle is and ] goes back there. Aristid Lindenmayer
-- invented these rewriting systems to describe how plants grow.

local AXIOM = "X"
local RULES = {
    X = "F+[[X]-X]-F[-FX]+X",
    F = "FF",
}
local ANGLE = 25
local GENERATIONS = 5

-- Rewrites every letter that has a rule, all at once.
local function rewrite(word)
    return (word:gsub(".", function(letter) return RULES[letter] end))
end

local word = AXIOM
for _ = 1, GENERATIONS do word = rewrite(word) end

-- The plant is about 68 steps tall, and reaches 3 steps left of its root
-- and 65 right.
local step = math.min(screen_width(), screen_height()) * 0.86 / 68

tracer(30)   -- show every 30th move: the plant has 1,488 stems
teleport(-31 * step, -34 * step)
setheading(65)
pensize(1.5)

local saved = {}
for letter in word:gmatch(".") do
    if letter == "F" then
        -- Deeper branches are greener.
        local depth = #saved
        pencolor(0.45 - 0.05 * depth, 0.3 + 0.08 * depth, 0.1)
        forward(step)
    elseif letter == "+" then
        left(ANGLE)
    elseif letter == "-" then
        right(ANGLE)
    elseif letter == "[" then
        saved[#saved + 1] = { xcor(), ycor(), heading() }
    elseif letter == "]" then
        local place = saved[#saved]
        saved[#saved] = nil
        teleport(place[1], place[2])
        setheading(place[3])
    end
end
hideturtle()
