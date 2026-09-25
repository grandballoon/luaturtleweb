-- test/motion_test.lua
--
-- Animated moves and turns (turtle_web.lua's _forward and _right) end
-- exactly where an unanimated one would, however many substeps they took.
--
-- Run from the repo root:  lua test/motion_test.lua

package.path = "public/?.lua;" .. package.path

require("turtle.turtle_web")  -- defines _turtle_make_env and the bridge globals

local failures, passed = 0, 0

-- Runs code at the given speed and returns the values of `query`.
local function after(speed, code, query)
    _bridge_hard_reset()
    local env = _turtle_make_env()
    env.speed(speed)
    assert(load(code, "user_code", "t", env))()
    return env[query]()
end

local function expect_same(code, query)
    local animated = table.pack(after(5, code, query))
    local instant  = table.pack(after(0, code, query))
    for i = 1, instant.n do
        if animated[i] ~= instant[i] then
            failures = failures + 1
            print(string.format("FAIL  %s: %s() is %.17g animated, %.17g instant",
                code:gsub("\n", "; "), query, animated[i], instant[i]))
            return
        end
    end
    passed = passed + 1
end

expect_same("forward(50)", "position")
expect_same("forward(-37.5)", "position")
expect_same("left(90)", "heading")
expect_same("right(45)\nleft(90)", "heading")
expect_same("left(30)\nforward(70)", "position")

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
