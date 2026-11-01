-- Star polygons {n/k}
-- Put n points on a circle and join every k-th one. When n and k share no
-- factor, one line visits every point: {5/2} is the pentagram. Each turn is
-- 360 * k / n degrees, and the turns add up to k full turns.

local stars = { { 5, 2 }, { 7, 2 }, { 7, 3 }, { 8, 3 }, { 9, 2 }, { 9, 4 } }
local colors = { "crimson", "darkorange", "goldenrod", "seagreen", "royalblue", "purple" }

local cell_w, cell_h = screen_width() / 3, screen_height() / 2
local r = math.min(cell_w, cell_h) * 0.33

speed(9)
for i, star in ipairs(stars) do
    local n, k = star[1], star[2]
    local cx = ((i - 1) % 3 - 1) * cell_w
    local cy = (i <= 3 and 1 or -1) * cell_h / 2 + 10

    local function vertex(j)
        local a = math.rad(90 - j * 360 * k / n)
        return cx + r * math.cos(a), cy + r * math.sin(a)
    end

    pencolor(colors[i])
    pensize(2)
    teleport(vertex(0))
    setheading(towards(vertex(1)))
    for _ = 1, n do
        forward(2 * r * math.sin(math.pi * k / n))
        right(360 * k / n)
    end

    teleport(cx, cy - r - 24)
    write("{" .. n .. "/" .. k .. "}", false, "center", { "IBM Plex Mono", 14 })
end
hideturtle()
