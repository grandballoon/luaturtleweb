-- Linear combinations: b = x a1 + y a2
-- The column picture of 2x - y = 1 and x + y = 5: walk 2 steps of the
-- first column a1 = (2, 1), then 3 steps of the second, a2 = (-1, 1), and
-- you arrive at b = (1, 5). So x = 2 and y = 3. The gray dots are every
-- combination with whole numbers: together they reach all over the plane.

graph(-3, -1, 6, 7)
axes(1, 1)
hideturtle()
tracer(4)

local a1 = { 2, 1 }
local a2 = { -1, 1 }

-- An arrow from (x0, y0) to (x1, y1), with a head sized in graph units.
local function arrow(x0, y0, x1, y1, color, width)
    teleport(x0, y0)
    pencolor(color)
    pensize(width)
    setheading(towards(x1, y1))
    setpos(x1, y1)
    left(150); forward(0.3); back(0.3)
    right(300); forward(0.3); back(0.3)
    left(150)
end

-- Every whole-number combination i a1 + j a2 that lands on the paper.
for i = -4, 6 do
    for j = -6, 8 do
        local x, y = i * a1[1] + j * a2[1], i * a1[2] + j * a2[2]
        if x >= -3 and x <= 6 and y >= -1 and y <= 7 then
            teleport(x, y)
            dot(6, "darkgray")
        end
    end
end

-- Two of a1, tip to tail, then three of a2.
local x, y = 0, 0
for _ = 1, 2 do
    arrow(x, y, x + a1[1], y + a1[2], "royalblue", 3)
    x, y = x + a1[1], y + a1[2]
end
for _ = 1, 3 do
    arrow(x, y, x + a2[1], y + a2[2], "darkorange", 3)
    x, y = x + a2[1], y + a2[2]
end

-- The sum, straight from the origin.
arrow(0, 0, x, y, "purple", 4)

pencolor("royalblue")
teleport(1.2, 0.2)
write("a1", false, "left", { "Arial", 13 })
pencolor("darkorange")
teleport(3.7, 3.1)
write("a2", false, "left", { "Arial", 13 })
pencolor("purple")
teleport(1.3, 5.4)
write("b = 2 a1 + 3 a2", false, "left", { "Arial", 13 })
