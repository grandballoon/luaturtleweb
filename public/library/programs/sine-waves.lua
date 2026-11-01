-- Sine waves: y = a * sin(b * x)
-- a stretches the wave up and down (its amplitude);
-- b squeezes it side to side, so it repeats b times as often.

graph(-7, -3, 7, 3, "stretch")
axes(1, 1)
hideturtle()
speed(6)

plot(function(x) return math.sin(x) end, "royalblue")          -- y = sin x
plot(function(x) return 2 * math.sin(x) end, "darkorange")     -- twice as tall
plot(function(x) return math.sin(2 * x) end, "seagreen")       -- twice as often

mark(math.pi / 2, 1, "royalblue", "sin x peaks at x = pi/2")
