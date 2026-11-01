-- Sunflower seeds (phyllotaxis)
-- Seed n sits at an angle of n times the golden angle, about 137.5 degrees,
-- and at a distance of sqrt(n). Because the golden ratio is so hard to
-- approximate by fractions, the seeds never line up and pack evenly.

local R = math.min(screen_width(), screen_height()) * 0.42
local seeds = 500
local golden_angle = 180 * (3 - math.sqrt(5))   -- in degrees
local c = R / math.sqrt(seeds)

bgcolor("darkslategray")
hideturtle()
speed(8)
for n = 1, seeds do
    local theta = math.rad(n * golden_angle)
    local r = c * math.sqrt(n)
    teleport(r * math.cos(theta), r * math.sin(theta))
    local f = n / seeds
    dot(4 + 6 * f, 1, 0.55 + 0.4 * f, 0.1)
end
