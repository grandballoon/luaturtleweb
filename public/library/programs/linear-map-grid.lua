-- A linear map on a grid: A = [2 1; 0.5 1.5]
-- A matrix moves every point of the plane, and keeps lines straight and
-- evenly spaced: the gray grid becomes the blue one. Its columns are where
-- the two unit arrows land. The unit square becomes a parallelogram whose
-- area is the determinant, 2 * 1.5 - 1 * 0.5 = 2.5.

graph(-3.5, -2.5, 6.5, 4.5)
hideturtle()
tracer(2)

local a, b, c, d = 2, 1, 0.5, 1.5           -- A = [a b; c d]
local function map(x, y) return a * x + b * y, c * x + d * y end

local function line(x0, y0, x1, y1)
    teleport(x0, y0)
    setpos(x1, y1)
end

local function arrow(x0, y0, x1, y1, color)
    teleport(x0, y0)
    pencolor(color)
    pensize(3)
    setheading(towards(x1, y1))
    setpos(x1, y1)
    left(150); forward(0.25); back(0.25)
    right(300); forward(0.25); back(0.25)
    left(150)
end

local function square(corners, fill)
    teleport(corners[1][1], corners[1][2])
    fillcolor(fill)
    pencolor(fill)
    begin_fill()
    for i = 2, #corners do setpos(corners[i][1], corners[i][2]) end
    setpos(corners[1][1], corners[1][2])
    end_fill()
end

-- The unit square, and the parallelogram A makes of it.
square({ { 0, 0 }, { 1, 0 }, { 1, 1 }, { 0, 1 } }, "gainsboro")
local corners = {}
for i, p in ipairs({ { 0, 0 }, { 1, 0 }, { 1, 1 }, { 0, 1 } }) do
    corners[i] = { map(p[1], p[2]) }
end
square(corners, "lightsteelblue")

-- The grid from -1 to 2 both ways, before and after.
pensize(1)
pencolor("darkgray")
for k = -1, 2 do
    line(k, -1, k, 2)
    line(-1, k, 2, k)
end
pensize(2)
pencolor("steelblue")
for k = -1, 2 do
    local x0, y0 = map(k, -1)
    local x1, y1 = map(k, 2)
    line(x0, y0, x1, y1)
    x0, y0 = map(-1, k)
    x1, y1 = map(2, k)
    line(x0, y0, x1, y1)
end

-- Where the unit arrows land: A's columns.
arrow(0, 0, 1, 0, "lightcoral")
arrow(0, 0, 0, 1, "mediumseagreen")
arrow(0, 0, a, c, "crimson")
arrow(0, 0, b, d, "seagreen")

pencolor("dimgray")
teleport(0.5, 0.45)
write("1", false, "center", { "Arial", 12 })
pencolor("navy")
teleport(1.5, 1.25)
write("2.5", false, "center", { "Arial", 13 })
teleport(-3.3, 3.8)
write("A = [2  1; 0.5  1.5]    det A = 2.5", false, "left", { "Arial", 13 })
