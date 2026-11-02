-- Least squares: the best line through scattered points
-- No line goes through all seven points, so take the one whose squared
-- misses (the red bars) add up to the least. Its intercept C and slope D
-- solve the normal equations A^T A x = A^T b, where each row of A is
-- (1, t) and b holds the heights.

local t = { 0, 1, 2, 3, 4, 5, 6 }
local b = { 1.2, 1.9, 3.4, 3.1, 4.8, 5.3, 6.9 }

graph(-0.5, -0.5, 7, 8)
axes(1, 1, "t", "b")
hideturtle()
speed(8)

-- A^T A = [n  sum t; sum t  sum t^2] and A^T b = [sum b; sum t b].
local n, st, stt, sb, stb = #t, 0, 0, 0, 0
for i = 1, n do
    st, stt = st + t[i], stt + t[i] * t[i]
    sb, stb = sb + b[i], stb + t[i] * b[i]
end
local det = n * stt - st * st
local C = (stt * sb - st * stb) / det
local D = (n * stb - st * sb) / det

plot(function(x) return C + D * x end, "royalblue", 3)

-- Each miss: from the point to the line, straight up or down.
pencolor("crimson")
pensize(2)
for i = 1, n do
    teleport(t[i], b[i])
    setpos(t[i], C + D * t[i])
end
for i = 1, n do
    mark(t[i], b[i], "black")
end

pencolor("royalblue")
teleport(0.2, 7.3)
write(string.format("b = %.2f + %.2f t", C, D), false, "left", { "Arial", 13 })
print(string.format("C = %.3f, D = %.3f", C, D))
