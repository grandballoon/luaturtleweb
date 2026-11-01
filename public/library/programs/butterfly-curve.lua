-- Butterfly curve
-- Temple Fay's polar curve:
--   r = e^cos(t) - 2 cos(4t) + sin(t / 12)^5
-- The last term changes so slowly that the curve takes 12 turns to repeat,
-- each wing tracing a slightly different path.

local S = math.min(screen_width(), screen_height()) * 0.42
local scale = S / (math.exp(1) + 3)   -- r is never more than e + 3
local steps = 2400

local function point(t)
    local r = math.exp(math.cos(t)) - 2 * math.cos(4 * t) + math.sin(t / 12) ^ 5
    return scale * r * math.sin(t), scale * r * math.cos(t)
end

bgcolor("black")
tracer(24)   -- show every 24th point: the curve has 2400
teleport(point(0))
for i = 1, steps do
    local f = i / steps
    pencolor(1, 0.4 + 0.5 * f, 0.9 - 0.6 * f)
    setpos(point(f * 24 * math.pi))
end
hideturtle()
