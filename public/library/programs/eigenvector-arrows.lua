-- Eigenvectors: A v = lambda v
-- Each thin line runs from a point v on the unit circle to A v, for
-- A = [2 1; 1 2]. Most vectors turn as A moves them. Two directions don't:
-- along (1, 1) A stretches by 3, and along (1, -1) it leaves the length
-- alone, by 1. Those are the eigenvectors, and 3 and 1 the eigenvalues.

graph(-3.6, -3.6, 3.6, 3.6)
axes(1, 1)
hideturtle()
tracer(6)

local function apply(x, y) return 2 * x + y, x + 2 * y end

local function arrow(x0, y0, x1, y1, color, width)
    teleport(x0, y0)
    pencolor(color)
    pensize(width)
    setheading(towards(x1, y1))
    setpos(x1, y1)
    left(150); forward(0.22); back(0.22)
    right(300); forward(0.22); back(0.22)
    left(150)
end

-- The unit circle, and the ellipse A turns it into.
local steps = 240
for _, curve in ipairs({ { "darkgray", false }, { "lightsteelblue", true } }) do
    pencolor(curve[1])
    pensize(2)
    for i = 0, steps do
        local t = i / steps * 2 * math.pi
        local x, y = math.cos(t), math.sin(t)
        if curve[2] then x, y = apply(x, y) end
        if i == 0 then teleport(x, y) else setpos(x, y) end
    end
end

-- From v to A v, every 15 degrees.
for k = 0, 23 do
    local t = math.rad(k * 15)
    local x, y = math.cos(t), math.sin(t)
    local ax, ay = apply(x, y)
    if k % 6 ~= 3 then
        arrow(x, y, ax, ay, "steelblue", 1)
    end
end

-- The eigen-directions: A v stays on v's line.
local r = math.sqrt(0.5)
for _, s in ipairs({ 1, -1 }) do
    arrow(0, 0, 3 * r * s, 3 * r * s, "crimson", 3)
    arrow(0, 0, r * s, -r * s, "darkorange", 3)
end

pencolor("crimson")
teleport(2.35, 2.0)
write("λ = 3", false, "left", { "Arial", 13 })
pencolor("darkorange")
teleport(0.9, -1.05)
write("λ = 1", false, "left", { "Arial", 13 })
