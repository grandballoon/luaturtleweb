-- turtle/random.lua
--
-- A seedable random number generator per program, standing in for
-- math.random and math.randomseed in the sandbox.
--
-- Lua's own generator is one per VM, so two programs in one VM (a learner's
-- program and a reference demo) would draw from, and reseed, the same
-- sequence. It also differs between Lua 5.4 and LuaJIT. This one belongs to
-- a single program, and gives the same sequence for the same seed on both,
-- so a run can be reproduced exactly on the web and on the desktop.
--
-- The generator is Park and Miller's minimal standard (multiplier 48271,
-- modulus 2^31 - 1). Every intermediate product stays below 2^53, so plain
-- floating-point arithmetic computes it exactly, with no integer or bitwise
-- operators that only one Lua has. Plenty for drawing; not for cryptography.

local M = 2147483647   -- 2^31 - 1
local A = 48271

local Random = {}

-- A seed of any number maps to a state in [1, M - 1].
local function state_for(seed)
    local s = math.floor(math.abs(tonumber(seed) or 0)) % (M - 1)
    return s + 1
end

-- Returns random, randomseed: functions with math.random's and
-- math.randomseed's contracts, over a generator seeded with `seed`.
function Random.new(seed)
    local state = state_for(seed)

    local function next_float()
        state = (state * A) % M
        return (state - 1) / (M - 1)   -- [0, 1)
    end

    local function random(m, n)
        if m == nil and n == nil then return next_float() end
        local upper_only = n == nil
        if upper_only then m, n = 1, m end
        if type(m) ~= "number" or type(n) ~= "number" then
            error("bad argument to 'random' (number expected)", 2)
        end
        m, n = math.floor(m), math.floor(n)
        if m > n then
            error("bad argument #" .. (upper_only and 1 or 2) .. " to 'random' (interval is empty)", 2)
        end
        return m + math.floor(next_float() * (n - m + 1))
    end

    local function randomseed(s)
        state = state_for(s)
    end

    return random, randomseed
end

return Random
