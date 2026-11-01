-- test/catalog_test.lua
--
-- The command catalog (public/turtle/catalog.lua) lists exactly what the
-- reference in public/index.html lists: the same sections, in the same
-- order, with the same calls and descriptions. The desktop app reads the
-- catalog; the web reads index.html; this keeps them one list. Every
-- entry's insert runs, as a whole program, without an error.
--
-- Run from the repo root:  lua test/catalog_test.lua

package.path = "public/?.lua;" .. package.path

local catalog = require("turtle.catalog")

local failures, passed = 0, 0

local function check(ok, message)
    if ok then
        passed = passed + 1
    else
        failures = failures + 1
        print("FAIL  " .. message)
    end
end

local function unescape(s)
    return (s:gsub("&quot;", '"'):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&amp;", "&"))
end

-- The reference's sections, as index.html writes them.
local function reference_sections()
    local file = assert(io.open("public/index.html"))
    local html = file:read("*a")
    file:close()
    local sections = {}
    for body in html:gmatch('<section class="api%-section">(.-)</section>') do
        local section = { title = unescape(body:match("<h2>(.-)</h2>")), commands = {} }
        for call, about in body:gmatch('<li><code>(.-)</code><span class="api%-about">(.-)</span></li>') do
            section.commands[#section.commands + 1] = { call = unescape(call), about = unescape(about) }
        end
        sections[#sections + 1] = section
    end
    return sections
end

local reference = reference_sections()
check(#reference > 0, "found no sections in the reference list in public/index.html")
check(#catalog == #reference, string.format("the catalog has %d sections, the reference %d", #catalog, #reference))

for i, section in ipairs(reference) do
    local entry = catalog[i] or { commands = {} }
    check(entry.title == section.title,
        string.format("section %d is %q in the reference, %q in the catalog", i, section.title, tostring(entry.title)))
    check(#entry.commands == #section.commands,
        string.format("%s has %d commands in the reference, %d in the catalog", section.title, #section.commands, #entry.commands))
    for j, command in ipairs(section.commands) do
        local c = entry.commands[j] or {}
        check(c.call == command.call and c.about == command.about,
            string.format("%s, entry %d: the reference has %s (%s), the catalog %s (%s)", section.title, j,
                command.call, command.about, tostring(c.call), tostring(c.about)))
    end
end

-- Every entry names its arguments, one per argument of its call; an
-- argument the call spells as a name ("forward(n)") keeps that name.
local KINDS = { number = true, color = true, string = true, boolean = true, any = true }
for _, section in ipairs(catalog) do
    for _, c in ipairs(section.commands) do
        local inside = c.call:match("^[%w_]+%((.-)%)") or ""
        local spelled = {}
        for arg in inside:gmatch("[^,]+") do spelled[#spelled + 1] = arg:match("^%s*(.-)%s*$") end
        local params = c.params
        check(type(params) == "table" and #params == #spelled,
            string.format("%s has %d arguments but %s params", c.call, #spelled, type(params) == "table" and #params or "no"))
        for i, p in ipairs(type(params) == "table" and params or {}) do
            check(type(p[1]) == "string" and KINDS[p[2]], string.format("%s, param %d: %s", c.call, i, tostring(p[2])))
            if spelled[i] and spelled[i]:match("^[%a_][%w_]*$") then
                check(p[1] == spelled[i], string.format("%s, param %d is named %s", c.call, i, tostring(p[1])))
            end
        end
    end
end

require("turtle.turtle_web")  -- defines _turtle_make_env and the bridge globals

for _, section in ipairs(catalog) do
    for _, c in ipairs(section.commands) do
        _bridge_hard_reset()
        local env = _turtle_make_env()
        env.print = function() end
        local chunk, err = load(tostring(c.insert), "user_code", "t", env)
        local ok, run_err = false, err
        if chunk then ok, run_err = pcall(chunk) end
        check(type(c.insert) == "string" and ok, "the insert for " .. c.call .. " fails: " .. tostring(run_err))
    end
end

print(string.format("%d passed, %d failed", passed, failures))
os.exit(failures == 0 and 0 or 1)
