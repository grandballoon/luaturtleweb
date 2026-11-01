-- Damped oscillation: y = e^(-x/5) * cos(2x)
-- A spring, a pendulum, a plucked string: each swings back and forth while
-- friction shrinks the swing. The wave stays inside its envelope, +-e^(-x/5).

graph(0, -1.2, 12, 1.2, "stretch")
axes(1, 0.5)
hideturtle()
speed(6)

local function envelope(x) return math.exp(-x / 5) end

plot(envelope, "silver")
plot(function(x) return -envelope(x) end, "silver")
plot(function(x) return envelope(x) * math.cos(2 * x) end, "crimson")
