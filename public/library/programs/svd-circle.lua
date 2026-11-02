-- The singular value decomposition: A = U Sigma V^T
-- Every matrix sends some pair of perpendicular directions, v1 and v2, to
-- another perpendicular pair, stretched by the singular values: A v1 =
-- sigma1 u1 and A v2 = sigma2 u2. So it turns the unit circle (left) into
-- an ellipse (right) whose axes are sigma1 u1 and sigma2 u2.

local A = { { 1.6, 1.2 }, { -0.4, 1.4 } }

graph(-5.5, -3, 5.5, 3)
hideturtle()
tracer(4)

local function apply(x, y)
    return A[1][1] * x + A[1][2] * y, A[2][1] * x + A[2][2] * y
end

-- V: the eigenvectors of the symmetric A^T A, whose eigenvalues are the
-- squares of the singular values.
local p = A[1][1] ^ 2 + A[2][1] ^ 2                 -- A^T A = [p q; q s]
local q = A[1][1] * A[1][2] + A[2][1] * A[2][2]
local s = A[1][2] ^ 2 + A[2][2] ^ 2
local mid, half = (p + s) / 2, math.sqrt(((p - s) / 2) ^ 2 + q ^ 2)
local sigma = { math.sqrt(mid + half), math.sqrt(mid - half) }
local angle = 0.5 * math.atan(2 * q, p - s)
local v = { { math.cos(angle), math.sin(angle) }, { -math.sin(angle), math.cos(angle) } }

local function arrow(x0, y0, x1, y1, color)
    teleport(x0, y0)
    pencolor(color)
    pensize(3)
    setheading(towards(x1, y1))
    setpos(x1, y1)
    left(150); forward(0.22); back(0.22)
    right(300); forward(0.22); back(0.22)
    left(150)
end

local left_c, right_c = -3, 2.4
local colors = { "crimson", "seagreen" }

-- The circle, and the ellipse A makes of it.
local steps = 200
for side = 1, 2 do
    pencolor("darkgray")
    pensize(2)
    for i = 0, steps do
        local t = i / steps * 2 * math.pi
        local x, y = math.cos(t), math.sin(t)
        local cx = left_c
        if side == 2 then x, y = apply(x, y); cx = right_c end
        if i == 0 then teleport(cx + x, y) else setpos(cx + x, y) end
    end
end

for i = 1, 2 do
    arrow(left_c, 0, left_c + v[i][1], v[i][2], colors[i])
    local x, y = apply(v[i][1], v[i][2])
    arrow(right_c, 0, right_c + x, y, colors[i])
end

arrow(-1.4, 0, -0.4, 0, "dimgray")
pencolor("dimgray")
teleport(-0.9, 0.2)
write("A", false, "center", { "Arial", 14 })
teleport(left_c, -1.6)
write("v1, v2", false, "center", { "Arial", 13 })
teleport(right_c, -2.4)
write(string.format("σ1 = %.2f,  σ2 = %.2f", sigma[1], sigma[2]), false, "center", { "Arial", 13 })
