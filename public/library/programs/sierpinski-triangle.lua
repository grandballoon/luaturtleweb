-- Sierpinski triangle
-- A triangle made of three half-size copies of itself, each made of three
-- copies of itself, and so on: the middle quarter is always left empty.

local depth = 5
local side = math.min(screen_width() * 0.84, screen_height() * 0.84 * 2 / math.sqrt(3))

-- Draws a triangle of the given side, starting and ending at its bottom-left
-- corner facing east.
local function sierpinski(length, level)
    if level == 0 then
        local x = xcor() / side + 0.5
        fillcolor(0.9 - 0.6 * x, 0.3, 0.3 + 0.6 * x)
        pencolor(0.9 - 0.6 * x, 0.3, 0.3 + 0.6 * x)
        begin_fill()
        for _ = 1, 3 do
            forward(length)
            left(120)
        end
        end_fill()
        return
    end
    local half = length / 2
    sierpinski(half, level - 1)
    forward(half)
    sierpinski(half, level - 1)
    back(half)
    left(60)
    forward(half)
    right(60)
    sierpinski(half, level - 1)
    left(60)
    back(half)
    right(60)
end

tracer(20)   -- show every 20th move: there are 243 triangles
teleport(-side / 2, -side * math.sqrt(3) / 4)
sierpinski(side, depth)
hideturtle()
