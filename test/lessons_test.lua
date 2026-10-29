-- test/lessons_test.lua
--
-- The Lessons sidebar's lessons (public/turtle/lessons.lua): every chapter,
-- lesson and example has what the sidebar shows, slugs are unique where
-- the sidebar uses them as ids, every example's steps are chunks of its
-- program that together cover it, and every program runs on the host
-- without an error and draws inside the canvas, on a wide canvas and on a
-- small square one.
--
-- Run from the repo root:  lua test/lessons_test.lua

package.path = "public/?.lua;" .. package.path

local Host    = require("turtle.host")
local lessons = require("turtle.lessons")

local failures, passed = 0, 0

local function check(ok, message)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL  " .. message)
    end
end

local function nonempty(v) return type(v) == "string" and v:match("%S") ~= nil end

local function lines(text)
    local out = {}
    for line in (text .. "\n"):gmatch("(.-)\n") do out[#out + 1] = line end
    return out
end

local KINDS = { plane = true, turtle = true }
local SIZES = { { 900, 640 }, { 420, 420 } }

-- Every point a visible segment puts ink on, as {x, y, reach}.
local function ink(segments)
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

-- Runs a program the way worker.js does, in a fresh host's env as chunk
-- "user_code", and returns the host, or nil and the error.
local function run(code, width, height)
    local host = Host.new({ width = width, height = height, seed = 0, print = function() end })
    local chunk, err = load(code, "user_code", "t", host.env())
    if not chunk then return nil, "does not compile: " .. tostring(err) end
    local ok, run_err = pcall(chunk)
    if not ok then return nil, "fails: " .. tostring(run_err) end
    return host
end

check(#lessons > 0, "there are no chapters")
local ids = {}
for c, chapter in ipairs(lessons) do
    local where = "chapter " .. c
    check(nonempty(chapter.title), where .. " has no title")
    check(nonempty(chapter.summary), where .. " has no summary")
    check(type(chapter.lessons) == "table" and #chapter.lessons > 0, where .. " has no lessons")
    for l, lesson in ipairs(chapter.lessons or {}) do
        local lwhere = where .. ", lesson " .. l
        check(nonempty(lesson.slug), lwhere .. " has no slug")
        check(nonempty(lesson.title), lwhere .. " has no title")
        check(nonempty(lesson.summary), lwhere .. " has no summary")
        check(type(lesson.examples) == "table" and #lesson.examples > 0, lwhere .. " has no examples")
        local kinds = {}
        for _, example in ipairs(lesson.examples or {}) do
            local id = tostring(lesson.slug) .. "/" .. tostring(example.slug)
            check(nonempty(example.slug), id .. " has no slug")
            check(not ids[id], id .. " is not unique")
            ids[id] = true
            check(nonempty(example.title), id .. " has no title")
            check(KINDS[example.kind], id .. " has kind " .. tostring(example.kind))
            kinds[example.kind or ""] = true
            check(type(example.text) == "table" and #example.text > 0, id .. " has no text")
            for p, paragraph in ipairs(example.text or {}) do
                check(nonempty(paragraph), id .. " paragraph " .. p .. " is empty")
                check(select(2, paragraph:gsub("`", "")) % 2 == 0, id .. " paragraph " .. p .. " has an unclosed `")
            end
            check(example.problem == nil or nonempty(example.problem), id .. " has an empty problem")
            check(example.source == nil or nonempty(example.source), id .. " has an empty source")
            check(nonempty(example.code), id .. " has no program")
            check(not tostring(example.code):find("\n%-%-:") and not tostring(example.code):find("^%-%-:"),
                id .. "'s program still has a --: line")

            -- The steps: each explains a chunk of the program, found at its
            -- `first` line, and together they cover every line, in order.
            local steps = example.steps or {}
            check(#steps >= 2, id .. " has fewer than 2 steps")
            check(example.kind ~= "plane" or (steps[1] and steps[1].code:find("^graph%(")),
                id .. " is on the plane but its first step doesn't start with graph()")
            local program = lines(example.code or "")
            local covered = {}
            for s, step in ipairs(steps) do
                local where = id .. " step " .. s
                check(type(step.text) == "table" and #step.text > 0 and nonempty(step.text[1]), where .. " has no text")
                check(nonempty(step.code), where .. " has no code")
                local chunk = lines(step.code or "")
                for k, line in ipairs(chunk) do
                    check(program[step.first + k - 1] == line, where .. " line " .. k .. " is not line "
                        .. tostring(step.first + k - 1) .. " of the program")
                    if line:match("%S") then covered[#covered + 1] = line end
                end
            end
            local nonblank = {}
            for _, line in ipairs(program) do
                if line:match("%S") then nonblank[#nonblank + 1] = line end
            end
            check(table.concat(covered, "\n") == table.concat(nonblank, "\n"), id .. "'s steps don't cover its program")
            check(not tostring(example.code):find("//", 1, true), id .. " uses //, which LuaJIT lacks")

            for _, size in ipairs(SIZES) do
                local w, h = size[1], size[2]
                local host, err = run(example.code, w, h)
                check(host ~= nil, string.format("%s at %dx%d %s", id, w, h, tostring(err)))
                if host then
                    local points = ink(host.visible_segments())
                    check(#points > 0, string.format("%s at %dx%d draws nothing", id, w, h))
                    local outside = 0
                    for _, p in ipairs(points) do
                        if math.abs(p[1]) + p[3] > w / 2 or math.abs(p[2]) + p[3] > h / 2 then
                            outside = outside + 1
                        end
                    end
                    check(outside == 0, string.format("%s at %dx%d draws %d points off the canvas", id, w, h, outside))
                end
            end
        end
        -- Each lesson shows its idea both ways: on the plane and with the turtle.
        check(kinds.plane and kinds.turtle, lwhere .. " (" .. tostring(lesson.slug) .. ") lacks a plane or a turtle example")
    end
end

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
