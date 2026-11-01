-- Squiral
-- Walk forward a little further each time and turn 89 degrees: one degree
-- short of a square, so every lap twists the square spiral a little more.

local laps = 120
local step = math.min(screen_width(), screen_height()) * 0.8 / (laps * math.sqrt(2))

bgcolor("black")
speed(0)
for i = 1, laps do
    pencolor(0.3 + 0.7 * i / laps, 0.9 - 0.5 * i / laps, 1)
    forward(i * step)
    left(89)
end
hideturtle()
