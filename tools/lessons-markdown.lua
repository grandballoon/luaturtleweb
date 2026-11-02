-- tools/lessons-markdown.lua
--
-- Prints the Lessons sidebar's lessons (public/turtle/lessons.lua) as one
-- Markdown document: chapters, lessons with what their ideas are like and
-- are used for, and examples with their prose, and
-- each example's tutorial steps with the code each step explains.
--
-- Run from the repo root:  lua tools/lessons-markdown.lua > lessons.md
--
-- markdown() is pure, lessons in and text out; the bottom of the file is the
-- shell that loads the lessons and prints.

-- One sentence per line: breaks after . ? or ! when the next sentence starts
-- with a capital letter, a quote or a backtick.
local function sentences(paragraph)
    return (paragraph:gsub("([%.%?!]) +([%u\"`])", "%1\n%2"))
end

local function markdown(chapters)
    local out = {}
    local function add(s) out[#out + 1] = s end

    add("# Lua Turtle Lessons")
    add("")
    add("Generated from public/turtle/lessons.lua by tools/lessons-markdown.lua; edit the lessons there, not here.")
    for c, chapter in ipairs(chapters) do
        add("")
        add(string.format("## Chapter %d: %s", c, chapter.title))
        add("")
        add(sentences(chapter.summary))
        for l, lesson in ipairs(chapter.lessons) do
            add("")
            add(string.format("### %d.%d %s", c, l, lesson.title))
            add("")
            add(sentences(lesson.summary))
            for _, part in ipairs({ { "Think of it as", lesson.metaphors }, { "Used for", lesson.applications } }) do
                if part[2] and #part[2] > 0 then
                    add("")
                    add("**" .. part[1] .. "**")
                    add("")
                    for _, item in ipairs(part[2]) do
                        add(string.format("- **%s.** %s", item.name, sentences(item.says):gsub("\n", "\n  ")))
                    end
                end
            end
            for _, example in ipairs(lesson.examples) do
                add("")
                add("#### " .. example.title)
                local meta = {}
                if example.source then meta[#meta + 1] = "*Source:* " .. example.source end
                meta[#meta + 1] = "*Drawn as:* " .. example.kind
                add("")
                add(table.concat(meta, " · "))
                if example.problem then
                    add("")
                    add("> **Problem.** " .. sentences(example.problem):gsub("\n", "\n> "))
                end
                for _, p in ipairs(example.text) do
                    add("")
                    add(sentences(p))
                end
                add("")
                add("**Walkthrough**")
                for s, step in ipairs(example.steps) do
                    add("")
                    local text = {}
                    for _, p in ipairs(step.text) do text[#text + 1] = sentences(p) end
                    add(string.format("%d. %s", s, table.concat(text, "\n\n   "):gsub("\n(%S)", "\n   %1")))
                    if step.code ~= "" then
                        add("")
                        add("   ```lua")
                        add("   " .. step.code:gsub("\n", "\n   "):gsub("\n   \n", "\n\n"))
                        add("   ```")
                    end
                end
            end
        end
    end
    add("")
    return table.concat(out, "\n")
end

package.path = "public/?.lua;" .. package.path
io.write(markdown(require("turtle.lessons")))
