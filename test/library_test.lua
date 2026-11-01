-- test/library_test.lua
--
-- The library's programs (public/library/programs/*.lua): every one runs on
-- the host without an error and draws inside the canvas, on a wide canvas
-- and on a small square one, and avoids what LuaJIT lacks.
-- test/library_test.mjs checks the catalog that names them.
--
-- Run from the repo root:  lua test/library_test.lua

package.path = "public/?.lua;" .. package.path

local programs = dofile("test/program_check.lua")

local DIR = "public/library/programs"

local failures, passed = 0, 0

local function check(ok, message)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL  " .. message)
    end
end

local names = {}
local ls = io.popen('ls "' .. DIR .. '"')
for name in ls:lines() do
    if name:match("%.lua$") then names[#names + 1] = name end
end
ls:close()
check(#names > 0, "there are no programs in " .. DIR)

for _, name in ipairs(names) do
    local file = assert(io.open(DIR .. "/" .. name))
    local code = file:read("a")
    file:close()

    check(not code:find("//", 1, true), name .. " uses //, which LuaJIT lacks")
    check(code:match("^%-%- %S"), name .. " doesn't start with a comment naming it")

    for _, size in ipairs(programs.SIZES) do
        local w, h = size[1], size[2]
        local host, err = programs.run(code, w, h)
        check(host ~= nil, string.format("%s at %dx%d %s", name, w, h, tostring(err)))
        if host then
            local outside, inked = programs.off_canvas(host, w, h)
            check(inked > 0, string.format("%s at %dx%d draws nothing", name, w, h))
            check(outside == 0, string.format("%s at %dx%d draws %d points off the canvas", name, w, h, outside))
        end
    end
end

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
