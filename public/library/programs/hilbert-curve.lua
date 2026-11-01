-- Hilbert curve
-- One line that visits every cell of a 32 by 32 grid without crossing itself.
-- Each level is four copies of the one below, joined by three steps: the
-- first and last copies turned, so they hand over at the right corners.
-- Keep going and the line fills the whole square.

local ORDER = 5
local cells = 2 ^ ORDER
local total = cells * cells - 1   -- steps from the first cell to the last

local side = math.min(screen_width(), screen_height()) * 0.84
local step = side / (cells - 1)

local walked = 0

-- One step, colored by how far along the curve it is.
local function move()
    local t = walked / total
    pencolor(0.85 - 0.7 * t, 0.25 + 0.35 * math.sin(math.pi * t), 0.3 + 0.6 * t)
    forward(step)
    walked = walked + 1
end

-- A curve of the given level. turn is 90 or -90: which way this copy bends.
local function hilbert(level, turn)
    if level == 0 then return end
    right(turn)
    hilbert(level - 1, -turn)
    move()
    left(turn)
    hilbert(level - 1, turn)
    move()
    hilbert(level - 1, turn)
    left(turn)
    move()
    hilbert(level - 1, -turn)
    right(turn)
end

tracer(16)   -- show every 16th move: the curve has 1023 steps
pensize(3)
teleport(-side / 2, side / 2)
setheading(0)
hilbert(ORDER, 90)
hideturtle()
