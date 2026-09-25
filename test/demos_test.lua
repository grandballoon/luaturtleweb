-- test/demos_test.lua
--
-- The command reference's demos (public/turtle/demos.lua): one for every
-- entry in the reference list in public/index.html, none for an entry that
-- isn't there, and every one runs without an error.
--
-- Run from the repo root:  lua test/demos_test.lua

package.path = "public/?.lua;" .. package.path

require("turtle.turtle_web")  -- defines _turtle_make_env and the bridge globals

local demos = _bridge_get_demos()

local failures, passed = 0, 0

local function check(ok, message)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL  " .. message)
    end
end

-- Every entry's call, as the reference list shows it, in page order.
local function reference_calls()
    local file = assert(io.open("public/index.html"))
    local html = file:read("a")
    file:close()
    local calls = {}
    for call in html:gmatch("<li><code>(.-)</code>") do
        calls[#calls + 1] = call:gsub("&quot;", '"'):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&amp;", "&")
    end
    return calls
end

local calls = reference_calls()
check(#calls > 0, "found no entries in the reference list in public/index.html")

local listed = {}
for _, call in ipairs(calls) do
    listed[call] = true
    check(demos[call] ~= nil, "no demo for the reference entry " .. call)
end

for call in pairs(demos) do
    check(listed[call], "demo for " .. call .. ", which is not in the reference list")
end

-- Runs a demo the way worker.js does: in a fresh env, as chunk "user_code".
-- print() output is dropped, so it stays out of the test report.
for call, code in pairs(demos) do
    _bridge_hard_reset()
    local env = _turtle_make_env()
    env.print = function() end
    local chunk, err = load(code, "user_code", "t", env)
    if chunk then
        local ok, run_err = pcall(chunk)
        check(ok, "the demo for " .. call .. " fails: " .. tostring(run_err))
    else
        check(false, "the demo for " .. call .. " does not compile: " .. tostring(err))
    end
end

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
