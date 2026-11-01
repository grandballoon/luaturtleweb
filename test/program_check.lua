-- test/program_check.lua
--
-- Running a learner-facing program the way worker.js does, and checking
-- what it drew. Shared by the suites that run whole programs: the Lessons
-- (lessons_test.lua) and the library (library_test.lua).
--
-- Expects package.path to reach public/ (each suite sets it).

local Host = require("turtle.host")

local M = {}

-- Every point a visible segment puts ink on, as {x, y, reach}.
function M.ink(segments)
    local points = {}
    for _, seg in ipairs(segments) do
        if seg.type == "line" then
            points[#points + 1] = { seg.from[1], seg.from[2], seg.width / 2 }
            points[#points + 1] = { seg.to[1], seg.to[2], seg.width / 2 }
        elseif seg.type == "fill" then
            for _, v in ipairs(seg.vertices) do points[#points + 1] = { v[1], v[2], 0 } end
        elseif seg.type == "dot" then
            points[#points + 1] = { seg.pos[1], seg.pos[2], seg.size / 2 }
        elseif seg.type == "text" then
            points[#points + 1] = { seg.pos[1], seg.pos[2], 0 }
        end
    end
    return points
end

-- Runs a program in a fresh host's env as chunk "user_code", and returns
-- the host, or nil and the error.
function M.run(code, width, height)
    local host = Host.new({ width = width, height = height, seed = 0, print = function() end })
    local chunk, err = load(code, "user_code", "t", host.env())
    if not chunk then return nil, "does not compile: " .. tostring(err) end
    local ok, run_err = pcall(chunk)
    if not ok then return nil, "fails: " .. tostring(run_err) end
    return host
end

-- How many of the points a host's drawing inks fall off a width × height
-- canvas, and how many points it inks in all.
function M.off_canvas(host, width, height)
    local points = M.ink(host.visible_segments())
    local outside = 0
    for _, p in ipairs(points) do
        if math.abs(p[1]) + p[3] > width / 2 or math.abs(p[2]) + p[3] > height / 2 then
            outside = outside + 1
        end
    end
    return outside, #points
end

-- The canvas sizes every program is run at: a wide one and a small square.
M.SIZES = { { 900, 640 }, { 420, 420 } }

return M
