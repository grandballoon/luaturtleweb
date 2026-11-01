-- Parabolas: y = a * x^2
-- The bigger a is, the narrower the parabola. Shifting x and y moves its
-- vertex: y = (x - 2)^2 - 1 has its vertex at (2, -1).

graph(-5, -2, 5, 10)
axes(1, 1)
hideturtle()
speed(6)

local colors = { "crimson", "darkorange", "seagreen", "royalblue" }
for i, a in ipairs({ 2, 1, 0.5, 0.25 }) do
    plot(function(x) return a * x * x end, colors[i])
end

plot(function(x) return (x - 2) ^ 2 - 1 end, "purple")
mark(2, -1, "purple", "vertex (2, -1)")
