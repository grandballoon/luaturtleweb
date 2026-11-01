-- Fibonacci spiral
-- Each square's side is the sum of the two after it: 34 = 21 + 13, 21 = 13 +
-- 8, and so on down to 1, 1. Cut a 55 by 34 rectangle into those squares and
-- a quarter circle in each makes the spiral. The rectangles left over have
-- sides that approach the golden ratio, 1.618…

local fib = { 34, 21, 13, 8, 5, 3, 2, 1, 1 }

local unit = math.min(screen_width() * 0.84 / 55, screen_height() * 0.84 / 34)

-- A square turning right, ending where it began, facing the same way.
local function square(side)
    for _ = 1, 4 do
        forward(side)
        right(90)
    end
end

speed(6)
teleport(-55 * unit / 2, -34 * unit / 2)
setheading(90)
for _, f in ipairs(fib) do
    local side = f * unit
    pencolor("tan")
    pensize(1)
    square(side)

    -- A quarter of a circle turning right carries the turtle to the far
    -- corner of the square, facing along the side where the next one goes.
    pencolor("darkgoldenrod")
    pensize(3)
    circle(-side, 90)
end
hideturtle()
