-- Solving with sliders: where mx + 5 meets 11 + x
-- The graph sits in a box on the left, so the rest of the canvas keeps
-- its pixels. Drag "slope m" to tilt mx + 5: the crossing, the solution
-- of mx + 5 = 11 + x, slides along 11 + x (at m = 3 it is x = 3). Drag
-- "radius" to size the circle on the right, drawn in plain turtle pixels.

local W, H = screen_width(), screen_height()
local gap = math.min(W, H) * 0.03

graph(-4, -4, 6, 18, {x = -W / 2 + gap, y = H / 2 - gap,
                      width = W / 2 - 2 * gap, height = H - 2 * gap, units = "stretch"})
axes(1, 2)
plot(function(x) return 11 + x end, "darkorange")    -- the right side, 11 + x
hideturtle()

-- Each slider draws with its own turtle: clearing that turtle erases
-- only what it drew, and leaves the graph alone.
local line = Turtle()
line:hideturtle()
line:speed(0)

local function draw_line(m)
    line:clear()
    line:plot(function(x) return m * x + 5 end, "royalblue", 3)   -- the left side, mx + 5
    if m ~= 1 then
        local x = 6 / (m - 1)    -- where mx + 5 = 11 + x
        if x >= -4 and x <= 6 then
            line:mark(x, 11 + x, "crimson", string.format("(%.2g, %.3g)", x, 11 + x))
        end
    end
end

-- The circle fills the right half under the sliders at most.
local top, bottom = H / 2 - gap - 100, -H / 2 + gap
local cx, cy = W / 4, (top + bottom) / 2
local most = math.floor(math.min(W / 4 - gap, (top - bottom) / 2))

local ring = Turtle()
ring:hideturtle()
ring:speed(0)
ring:pensize(3)
ring:pencolor("seagreen")

local function draw_circle(r)
    ring:clear()
    ring:teleport(cx, cy - r)    -- circle() turns around a center r to its left
    ring:circle(r)
end

slider({label = "slope m", min = -2, max = 5, value = 3, step = 0.1,
        x = gap, y = H / 2 - gap, width = W / 2 - 2 * gap, onchange = draw_line})
slider({label = "radius", min = 10, max = most, value = math.floor(most / 2),
        x = gap, y = H / 2 - gap - 50, width = W / 2 - 2 * gap, onchange = draw_circle})

draw_line(3)
draw_circle(math.floor(most / 2))
