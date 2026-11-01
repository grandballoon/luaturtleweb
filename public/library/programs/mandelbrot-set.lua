-- Mandelbrot set
-- For each point c, start at z = 0 and repeat z = z² + c. Some points stay
-- close forever: they are the set, drawn dark. The rest run away, colored by
-- how many steps they took to get farther than 2 from 0. Squaring a complex
-- number doubles its angle and squares its size, which is why the edge is so
-- tangled.
-- The turtle paints it like a lawnmower: along a row, down one, back again.

local MAX_STEPS = 60

-- How many steps z = z² + c takes to escape, or MAX_STEPS if it doesn't.
local function escape(cx, cy)
    local x, y = 0, 0
    for n = 1, MAX_STEPS do
        x, y = x * x - y * y + cx, 2 * x * y + cy
        if x * x + y * y > 4 then return n end
    end
    return MAX_STEPS
end

local function shade(n)
    if n == MAX_STEPS then return 0.08, 0.05, 0.2 end
    local t = math.sqrt(n / MAX_STEPS)
    return 0.15 + 0.85 * t, 0.2 + 0.7 * t * t, 0.45 + 0.4 * math.sin(math.pi * t)
end

-- The part of the plane to show: real parts left..right, imaginary parts
-- bottom..top.
local left_re, right_re, bottom_im, top_im = -2.25, 0.75, -1.2, 1.2

local cell = 4   -- px per painted square
local scale = math.min(screen_width() * 0.92 / (right_re - left_re),
                       screen_height() * 0.92 / (top_im - bottom_im))
local cols = math.floor((right_re - left_re) * scale / cell)
local rows = math.floor((top_im - bottom_im) * scale / cell)
local width, height = cols * cell, rows * cell

-- The point a column and row stand for: the middle of its square.
local function point(col, row)
    return left_re + (col - 0.5) * cell / scale, top_im - (row - 0.5) * cell / scale
end

tracer(0)    -- draw a whole row at a time
pensize(cell * 1.5)   -- wider than a row, so each row overlaps the last without a seam
teleport(-width / 2, height / 2 - cell / 2)
setheading(0)

for row = 1, rows do
    -- Even rows run right to left.
    local function col_at(i) return row % 2 == 1 and i or cols + 1 - i end

    -- Paint each run of same-colored squares as one stroke.
    local run_n, run_length = nil, 0
    for i = 1, cols do
        local n = escape(point(col_at(i), row))
        if n ~= run_n and run_length > 0 then
            pencolor(shade(run_n))
            forward(run_length * cell)
            run_length = 0
        end
        run_n, run_length = n, run_length + 1
    end
    pencolor(shade(run_n))
    forward(run_length * cell)

    update()
    if row < rows then
        -- Turn down to the next row, and back around to face along it.
        local turn = row % 2 == 1 and right or left
        penup()
        turn(90)
        forward(cell)
        turn(90)
        pendown()
    end
end
hideturtle()
update()
