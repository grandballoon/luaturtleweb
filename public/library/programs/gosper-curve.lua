-- Gosper curve
-- An L-system with two letters that both mean "step forward": A becomes
-- A-B--B+A++AA+B- and B becomes +A-AA--A-B++B+A, with + and - turning 60
-- degrees. Each round makes seven copies of the last, a third of a turn
-- apart, and the curve fills a snowflake-shaped island.

local AXIOM = "A"
local RULES = {
    A = "A-B--B+A++AA+B-",
    B = "+A-AA--A-B++B+A",
}
local ANGLE = 60
local GENERATIONS = 4

local function rewrite(word)
    return (word:gsub(".", function(letter) return RULES[letter] end))
end

local word = AXIOM
for _ = 1, GENERATIONS do word = rewrite(word) end

local steps = 7 ^ GENERATIONS
-- The island is about 55 steps across, all of it left of the start.
local step = math.min(screen_width(), screen_height()) * 0.86 / 55

tracer(30)   -- show every 30th move: the curve has 2,401 steps
pensize(2)
teleport(27 * step, -10 * step)
setheading(-90)

local walked = 0
for letter in word:gmatch(".") do
    if letter == "A" or letter == "B" then
        local t = walked / steps
        pencolor(0.1 + 0.2 * t, 0.35 + 0.4 * t, 0.65 - 0.25 * t)
        forward(step)
        walked = walked + 1
    elseif letter == "+" then
        left(ANGLE)
    elseif letter == "-" then
        right(ANGLE)
    end
end
hideturtle()
