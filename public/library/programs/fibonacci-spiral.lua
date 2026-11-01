-- Fibonacci spiral
-- Each square's side is the sum of the two before it: 1, 1, 2, 3, 5, 8, ...
-- Laid around each other they make rectangles whose sides approach the golden
-- ratio, and a quarter circle in each square makes the spiral.

local fib = { 1, 1, 2, 3, 5, 8, 13, 21, 34 }

-- The squares go right, up, left, down around the rectangle so far, which
-- spans x0..x1 and y0..y1. Each arc turns about one corner of its square.
local squares = {}
local x0, y0, x1, y1 = 0, 0, 1, 1
squares[1] = { x = 0, y = 0, size = 1, cx = 1, cy = 1, start = 180 }
for i = 2, #fib do
    local f = fib[i]
    local side = i % 4
    local sq
    if side == 2 then       -- right
        sq = { x = x1, y = y0, cx = x1, cy = y1, start = -90 }
        x1 = x1 + f
    elseif side == 3 then   -- up
        sq = { x = x0, y = y1, cx = x0, cy = y1, start = 0 }
        y1 = y1 + f
    elseif side == 0 then   -- left
        sq = { x = x0 - f, y = y0, cx = x0, cy = y0, start = 90 }
        x0 = x0 - f
    else                    -- down
        sq = { x = x0, y = y0 - f, cx = x1, cy = y0, start = 180 }
        y0 = y0 - f
    end
    sq.size = f
    squares[i] = sq
end

graph(x0, y0, x1, y1)
hideturtle()
speed(6)

pencolor("tan")
for _, sq in ipairs(squares) do
    teleport(sq.x, sq.y)
    setpos(sq.x + sq.size, sq.y)
    setpos(sq.x + sq.size, sq.y + sq.size)
    setpos(sq.x, sq.y + sq.size)
    setpos(sq.x, sq.y)
end

pencolor("darkgoldenrod")
pensize(3)
for _, sq in ipairs(squares) do
    for step = 0, 30 do
        local a = math.rad(sq.start + 90 * step / 30)
        local x, y = sq.cx + sq.size * math.cos(a), sq.cy + sq.size * math.sin(a)
        if step == 0 then teleport(x, y) else setpos(x, y) end
    end
end
