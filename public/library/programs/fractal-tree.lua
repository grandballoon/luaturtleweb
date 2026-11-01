-- Fractal tree
-- A trunk, then two smaller trees growing from its top, each turned 25
-- degrees, each branch 70% as long as the one it grows from.

local function tree(length, depth)
    if depth == 0 then return end
    pensize(depth)
    if depth > 3 then pencolor("sienna") else pencolor("forestgreen") end
    forward(length)
    left(25)
    tree(length * 0.7, depth - 1)
    right(50)
    tree(length * 0.7, depth - 1)
    left(25)
    penup()
    back(length)
    pendown()
end

local trunk = screen_height() * 0.25

tracer(8)    -- show every 8th move: the tree has 511 branches
teleport(0, -screen_height() * 0.42)
setheading(90)
tree(trunk, 9)
hideturtle()
