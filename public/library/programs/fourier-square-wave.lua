-- A square wave from sine waves (a Fourier series)
-- Add up sin(x) + sin(3x)/3 + sin(5x)/5 + ..., times 4/pi. Each odd harmonic
-- squares the wave off a little more: the more terms, the closer it gets.

graph(-7, -1.6, 7, 1.6, "stretch")
axes(1, 0.5)
hideturtle()
speed(6)

-- The sum of the first n terms.
local function partial(n)
    return function(x)
        local sum = 0
        for k = 1, n do
            local h = 2 * k - 1
            sum = sum + math.sin(h * x) / h
        end
        return 4 / math.pi * sum
    end
end

local colors = { "lightsteelblue", "cornflowerblue", "royalblue", "navy" }
for i, n in ipairs({ 1, 2, 4, 12 }) do
    plot(partial(n), colors[i])
end
