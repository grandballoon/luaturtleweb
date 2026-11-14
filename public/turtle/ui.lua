-- turtle/ui.lua
--
-- A program's on-canvas controls (sliders, buttons, toggles, radio buttons,
-- text fields) and the pointer and keyboard input that works them, as pure
-- functions over values. The host (host.lua) keeps one UI state per
-- instance, feeds it the input the shell reports, runs the effects it
-- returns (the learner's handlers), and sends its layout to the shell to
-- draw. Nothing here calls a handler, draws, or knows the platform.
--
-- A state is
--   { widgets = { [id] = widget }, order = { id, ... } (creation order),
--     next_id, focus = id of the text field typing goes to, or nil,
--     press = what the pointer pressed and still holds:
--             { id, option } on a widget, { canvas = true } off one, or nil }
-- A widget is a plain record of values, never functions (the host keeps
-- each widget's handlers by its id):
--   { id, kind = "slider" | "button" | "toggle" | "radio" | "textfield",
--     label, value, at = { x, y } in world units or nil, width,
--     min, max, step (slider), options (radio), caret (textfield) }
-- Every function returns a new state and leaves the one it was given as it
-- was, so the host can tell a change by identity.
--
-- Geometry is in canvas pixels with (0, 0) at the center and y up, the
-- space the host projects segments into. A widget's box is its top-left
-- corner x, y and its size w, h, so it spans x..x+w and y-h..y. A widget
-- with no position stacks down the canvas's top-left corner; one with x
-- and y has its top-left corner at that point of the world. The renderer
-- (ui-renderer.js) draws from the same constants, so the two must change
-- together.
--
-- Input events are what the shell reports, in the same pixels:
--   { type = "down" | "move" | "up", x, y }   the pointer
--   { type = "key", key, text }               a key pressed (or repeating);
--                                             text is the character it types
--   { type = "keyup", key }                   a key let go
--   { type = "blur" }                         the canvas lost the keyboard
-- handle() turns one into effects, as data, for the host to run in order:
--   { kind = "click" | "drag" | "release", x, y }   the canvas, off any widget
--   { kind = "keypress" | "keyrelease", key }        while no text field types
--   { kind = "change", id, value }                   a widget's value changed
--   { kind = "press", id }                           a button was clicked
--   { kind = "submit", id, value }                   Return in a text field
--
-- Pure Lua with no platform code; runs on Lua 5.4 and LuaJIT alike.

local UI = {}

----------------------------------------------------------------
-- Sizes, in pixels. ui-renderer.js draws with the same ones.
----------------------------------------------------------------

UI.FONT        = 13    -- every widget's text
UI.LABEL_H     = 18    -- the label row above a slider, radio group or text field
UI.SLIDER_H    = 38    -- label row, then the track
UI.BUTTON_H    = 30
UI.TOGGLE_H    = 22    -- the switch is TOGGLE_W by TOGGLE_H, its label beside it
UI.TOGGLE_W    = 38
UI.OPTION_H    = 24    -- one radio option's row
UI.FIELD_H     = 28    -- a text field's box
UI.KNOB_R      = 8     -- a slider's knob; the track stops this far inside its box
UI.MARGIN      = 16    -- the stacked widgets' distance from the canvas's corner
UI.GAP         = 10    -- between stacked widgets
UI.WIDTH       = 200   -- a slider's or text field's width unless given
UI.MAX_TEXT    = 200   -- characters a text field holds

-- Text can't be measured here, so widths that follow their text use a
-- generous estimate of a character's width; the renderer shrinks text that
-- would still overflow.
local CHAR_W = 0.62 * UI.FONT

----------------------------------------------------------------
-- Text, by UTF-8 character
----------------------------------------------------------------

local function chars(s)
    local out = {}
    for ch in s:gmatch("[^\128-\191][\128-\191]*") do out[#out + 1] = ch end
    return out
end

local function length(s) return #chars(s) end

local function text_width(s) return length(s) * CHAR_W end

-- How a number reads in a label: 50, not 50.0; 0.3, not 0.30000000000000004.
function UI.format(v)
    return (string.format("%.10g", v))
end

----------------------------------------------------------------
-- Values
----------------------------------------------------------------

local function copy(t)
    local c = {}
    for k, v in pairs(t) do c[k] = v end
    return c
end

-- A whole number as an integer, so print(s.value) shows 50, not 50.0.
local function tidy(v)
    if v == math.floor(v) and math.abs(v) < 2 ^ 53 then return math.floor(v) end
    return v
end
UI.tidy = tidy

-- A slider's value moved onto its steps and inside its range.
local function snap(w, v)
    v = math.max(w.min, math.min(w.max, v))
    v = w.min + math.floor((v - w.min) / w.step + 0.5) * w.step
    v = math.max(w.min, math.min(w.max, v))
    v = math.floor(v * 1e10 + 0.5) / 1e10   -- 0.1 * 3 is 0.30000000000000004
    return tidy(v)
end

-- A slider's step when the program gives none: 1 between whole numbers at
-- least 2 apart (sides of a polygon, a size), else a hundredth of the range
-- (0 to 1 moves by 0.01).
local function default_step(min, max)
    if min == math.floor(min) and max == math.floor(max) and max - min >= 2 then return 1 end
    return (max - min) / 100
end

----------------------------------------------------------------
-- Checking a widget's options, before the host adds it
----------------------------------------------------------------

-- The fields each kind of widget takes, in the order a message lists them.
UI.FIELDS = {
    slider    = { "label", "min", "max", "value", "step", "x", "y", "width", "onchange" },
    button    = { "label", "x", "y", "width", "onclick" },
    toggle    = { "label", "value", "x", "y", "onchange" },
    radio     = { "label", "options", "value", "x", "y", "onchange" },
    textfield = { "label", "value", "x", "y", "width", "onchange", "onsubmit" },
}

local function is_finite(v)
    return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

local function describe(v)
    if type(v) == "string" then return '"' .. v .. '"' end
    if type(v) == "number" or type(v) == "boolean" or v == nil then return tostring(v) end
    return "a " .. type(v)
end

-- What a field's value must be, as a test and the words for it.
local KINDS = {
    number   = { is_finite, "a number" },
    positive = { function(v) return is_finite(v) and v > 0 end, "a number more than 0" },
    boolean  = { function(v) return type(v) == "boolean" end, "true or false" },
    string   = { function(v) return type(v) == "string" end, "a string" },
    text     = { function(v) return type(v) == "string" or type(v) == "number" end, "a string or a number" },
    func     = { function(v) return type(v) == "function" end, "a function" },
}

local FIELD_KINDS = {
    label = "text", min = "number", max = "number", step = "positive",
    x = "number", y = "number", width = "positive",
    onchange = "func", onclick = "func", onsubmit = "func",
}
local VALUE_KINDS = { slider = "number", toggle = "boolean", textfield = "text" }

-- nil if `spec` describes a `kind` widget, else what is wrong with it, read
-- as the rest of "<kind>: ...".
function UI.check(kind, spec)
    if type(spec) ~= "table" then
        return "options must be a table like {label = \"size\"}, got " .. describe(spec)
    end
    local allowed = {}
    for _, f in ipairs(UI.FIELDS[kind]) do allowed[f] = true end
    for k in pairs(spec) do
        if not allowed[k] then
            return "there is no option " .. describe(k) .. "; a " .. kind .. " takes "
                .. table.concat(UI.FIELDS[kind], ", ")
        end
    end
    for _, f in ipairs(UI.FIELDS[kind]) do
        local v = spec[f]
        local want = (f == "value" and VALUE_KINDS[kind]) or FIELD_KINDS[f]
        if v ~= nil and want and not KINDS[want][1](v) then
            return f .. " must be " .. KINDS[want][2] .. ", got " .. describe(v)
        end
    end
    if (spec.x == nil) ~= (spec.y == nil) then
        return "give both x and y, or neither"
    end
    if kind == "slider" then
        local min, max = spec.min or 0, spec.max or 100
        if max <= min then
            return "max must be more than min, got " .. describe(min) .. " and " .. describe(max)
        end
    elseif kind == "button" then
        if spec.label == nil then return "label is missing" end
    elseif kind == "radio" then
        local options = spec.options
        if type(options) ~= "table" or #options == 0 then
            return 'options must be a list like {"red", "green"}, got ' .. describe(options)
        end
        for i, o in ipairs(options) do
            if not KINDS.text[1](o) then
                return "option " .. i .. " must be a string or a number, got " .. describe(o)
            end
        end
        if spec.value ~= nil then
            local found = false
            for _, o in ipairs(options) do found = found or o == spec.value end
            if not found then return "value must be one of the options, got " .. describe(spec.value) end
        end
    end
    return nil
end

----------------------------------------------------------------
-- Adding, changing and removing widgets
----------------------------------------------------------------

function UI.new()
    return { widgets = {}, order = {}, next_id = 1, focus = nil, press = nil }
end

-- Returns the new state and the new widget's id. `spec` has passed check();
-- its handlers are ignored here.
function UI.add(state, kind, spec)
    local id = state.next_id
    local w = { id = id, kind = kind, width = spec.width }
    if spec.label ~= nil then w.label = tostring(spec.label) end
    if spec.x ~= nil then w.at = { spec.x, spec.y } end
    if kind == "slider" then
        w.min, w.max = spec.min or 0, spec.max or 100
        w.step = spec.step or default_step(w.min, w.max)
        w.value = snap(w, spec.value or w.min)
    elseif kind == "toggle" then
        w.value = spec.value == true
    elseif kind == "radio" then
        w.options = {}
        for i, o in ipairs(spec.options) do w.options[i] = o end
        w.value = spec.value == nil and w.options[1] or spec.value
    elseif kind == "textfield" then
        w.value = spec.value == nil and "" or tostring(spec.value)
        w.caret = length(w.value)
    end
    local s = copy(state)
    s.widgets = copy(state.widgets)
    s.widgets[id] = w
    s.order = copy(state.order)
    s.order[#s.order + 1] = id
    s.next_id = id + 1
    return s, id
end

local function with_widget(state, w)
    local s = copy(state)
    s.widgets = copy(state.widgets)
    s.widgets[w.id] = w
    return s
end

-- What setting a widget's value to v would make it, or nil and why not
-- (read as the rest of "value must be ...").
local function settled(w, v)
    if w.kind == "slider" then
        if not is_finite(v) then return nil, "a number" end
        return snap(w, v)
    elseif w.kind == "toggle" then
        if type(v) ~= "boolean" then return nil, "true or false" end
        return v
    elseif w.kind == "radio" then
        for _, o in ipairs(w.options) do
            if o == v then return v end
        end
        return nil, "one of the options"
    elseif w.kind == "textfield" then
        if type(v) ~= "string" and type(v) ~= "number" then return nil, "a string or a number" end
        local cs = chars(tostring(v))
        return table.concat(cs, "", 1, math.min(#cs, UI.MAX_TEXT))
    end
    return nil, "nothing: a button has no value"
end

-- Sets widget id's value as the program asks (s.value = 10): the new
-- state, or nil and what the value must be. Fires no change effect, so a
-- program setting a value from its own onchange can't loop.
function UI.set_value(state, id, v)
    local w = state.widgets[id]
    local value, why = settled(w, v)
    if value == nil then return nil, why end
    if value == w.value then return state end
    w = copy(w)
    w.value = value
    if w.kind == "textfield" then w.caret = length(value) end
    return with_widget(state, w)
end

function UI.set_label(state, id, label)
    local w = copy(state.widgets[id])
    w.label = label ~= nil and tostring(label) or nil
    return with_widget(state, w)
end

function UI.remove(state, id)
    if not state.widgets[id] then return state end
    local s = copy(state)
    s.widgets = copy(state.widgets)
    s.widgets[id] = nil
    s.order = {}
    for _, other in ipairs(state.order) do
        if other ~= id then s.order[#s.order + 1] = other end
    end
    if s.focus == id then s.focus = nil end
    if s.press and s.press.id == id then s.press = nil end
    return s
end

----------------------------------------------------------------
-- Layout: where each widget is, in pixels
----------------------------------------------------------------

local function label_row(w) return w.label and UI.LABEL_H or 0 end

-- A widget's width and height.
local function size(w)
    if w.kind == "slider" then
        return w.width or UI.WIDTH, UI.SLIDER_H
    elseif w.kind == "button" then
        return w.width or math.max(64, math.floor(text_width(w.label) + 28 + 0.5)), UI.BUTTON_H
    elseif w.kind == "toggle" then
        local text = w.label and 8 + text_width(w.label) or 0
        return math.floor(UI.TOGGLE_W + text + 0.5), UI.TOGGLE_H
    elseif w.kind == "radio" then
        local widest = w.label and text_width(w.label) or 0
        for _, o in ipairs(w.options) do widest = math.max(widest, 22 + text_width(tostring(o))) end
        return math.floor(widest + 0.5), label_row(w) + UI.OPTION_H * #w.options
    end
    return w.width or UI.WIDTH, label_row(w) + UI.FIELD_H   -- textfield
end

-- The track a slider's knob runs along: its ends' x and its y.
local function track(r)
    return r.x + UI.KNOB_R, r.x + r.w - UI.KNOB_R, r.y - UI.LABEL_H - 10
end

-- What the renderer draws and the pointer hits, one record per widget in
-- creation order (later ones on top):
--   { id, kind, x, y, w, h,   the box: top-left corner and size
--     text,                   the label as shown (a slider's with its value)
--     value, fraction,        a slider's value and how far along it is, 0..1
--     options, selected,      a radio group's options and which (1-based)
--     caret,                  a text field's caret, in characters
--     focused, pressed }
-- `place(x, y)` turns a world point into pixels; w and h are the canvas's
-- size, for the stacked widgets' corner.
function UI.layout(state, place, w, h)
    local records = {}
    local stack_x, stack_y = -w / 2 + UI.MARGIN, h / 2 - UI.MARGIN
    for _, id in ipairs(state.order) do
        local wd = state.widgets[id]
        local width, height = size(wd)
        local x, y
        if wd.at then
            x, y = place(wd.at[1], wd.at[2])
        else
            x, y = stack_x, stack_y
            stack_y = stack_y - height - UI.GAP
        end
        local r = {
            id = id, kind = wd.kind, x = x, y = y, w = width, h = height,
            text = wd.label, value = wd.value,
            focused = state.focus == id,
            pressed = state.press ~= nil and state.press.id == id,
        }
        if wd.kind == "slider" then
            local shown = UI.format(wd.value)
            r.text = wd.label and (wd.label .. ": " .. shown) or shown
            r.fraction = (wd.value - wd.min) / (wd.max - wd.min)
        elseif wd.kind == "radio" then
            r.options = {}
            for i, o in ipairs(wd.options) do
                r.options[i] = tostring(o)
                if o == wd.value then r.selected = i end
            end
        elseif wd.kind == "textfield" then
            r.caret = wd.caret
        end
        records[#records + 1] = r
    end
    return records
end

----------------------------------------------------------------
-- Input
----------------------------------------------------------------

local function inside(r, x, y)
    return x >= r.x and x <= r.x + r.w and y <= r.y and y >= r.y - r.h
end

-- The topmost record under (x, y) and, for a radio group, which option.
local function hit(layout, x, y)
    for i = #layout, 1, -1 do
        local r = layout[i]
        if inside(r, x, y) then
            if r.kind ~= "radio" then return r end
            local top = r.y - (r.text and UI.LABEL_H or 0)
            local option = math.floor((top - y) / UI.OPTION_H) + 1
            if option >= 1 and option <= #r.options then return r, option end
            return r
        end
    end
    return nil
end

-- A slider's value at pointer x.
local function value_at(w, r, x)
    local x1, x2 = track(r)
    local f = math.max(0, math.min(1, (x - x1) / (x2 - x1)))
    return snap(w, w.min + f * (w.max - w.min))
end

local function find(layout, id)
    for _, r in ipairs(layout) do
        if r.id == id then return r end
    end
end

-- Slides widget w to pointer x: the new state and its change effect, if any.
local function slide(state, w, r, x, effects)
    local v = value_at(w, r, x)
    if v == w.value then return state end
    w = copy(w)
    w.value = v
    effects[#effects + 1] = { kind = "change", id = w.id, value = v }
    return with_widget(state, w)
end

local function with(state, key, value)
    if state[key] == value then return state end
    local s = copy(state)
    s[key] = value
    return s
end

local function pointer_down(state, layout, e, effects)
    local r, option = hit(layout, e.x, e.y)
    if not r then
        state = with(state, "focus", nil)
        state = with(state, "press", { canvas = true })
        effects[#effects + 1] = { kind = "click", x = e.x, y = e.y }
        return state
    end
    local w = state.widgets[r.id]
    state = with(state, "press", { id = r.id, option = option })
    if w.kind == "textfield" then
        if state.focus ~= r.id then
            w = copy(w)
            w.caret = length(w.value)
            state = with_widget(state, w)
        end
        return with(state, "focus", r.id)
    end
    state = with(state, "focus", nil)
    if w.kind == "slider" then state = slide(state, w, r, e.x, effects) end
    return state
end

local function pointer_move(state, layout, e, effects)
    local press = state.press
    if not press then return state end
    if press.canvas then
        effects[#effects + 1] = { kind = "drag", x = e.x, y = e.y }
        return state
    end
    local w = state.widgets[press.id]
    local r = find(layout, press.id)
    if w and r and w.kind == "slider" then return slide(state, w, r, e.x, effects) end
    return state
end

local function pointer_up(state, layout, e, effects)
    local press = state.press
    if not press then return state end
    state = with(state, "press", nil)
    if press.canvas then
        effects[#effects + 1] = { kind = "release", x = e.x, y = e.y }
        return state
    end
    local w = state.widgets[press.id]
    local r, option = hit(layout, e.x, e.y)
    if not w or not r or r.id ~= press.id then return state end   -- let go elsewhere: no click
    if w.kind == "button" then
        effects[#effects + 1] = { kind = "press", id = w.id }
    elseif w.kind == "toggle" then
        w = copy(w)
        w.value = not w.value
        state = with_widget(state, w)
        effects[#effects + 1] = { kind = "change", id = w.id, value = w.value }
    elseif w.kind == "radio" and option and option == press.option then
        local v = w.options[option]
        if v ~= w.value then
            w = copy(w)
            w.value = v
            state = with_widget(state, w)
            effects[#effects + 1] = { kind = "change", id = w.id, value = v }
        end
    end
    return state
end

-- A key typed into the focused text field w.
local function edit(state, w, e, effects)
    local cs = chars(w.value)
    local caret = w.caret
    local key = e.key
    if key == "return" then
        effects[#effects + 1] = { kind = "submit", id = w.id, value = w.value }
        return state
    elseif key == "left" then
        caret = math.max(0, caret - 1)
    elseif key == "right" then
        caret = math.min(#cs, caret + 1)
    elseif key == "home" or key == "up" then
        caret = 0
    elseif key == "end" or key == "down" then
        caret = #cs
    elseif key == "backspace" then
        if caret == 0 then return state end
        table.remove(cs, caret)
        caret = caret - 1
    elseif key == "delete" then
        if caret == #cs then return state end
        table.remove(cs, caret + 1)
    elseif e.text and e.text ~= "" and #cs < UI.MAX_TEXT then
        for i, ch in ipairs(chars(e.text)) do table.insert(cs, caret + i, ch) end
        caret = caret + length(e.text)
    else
        return state
    end
    local value = table.concat(cs)
    if value == w.value and caret == w.caret then return state end
    local changed = value ~= w.value
    w = copy(w)
    w.value, w.caret = value, caret
    if changed then effects[#effects + 1] = { kind = "change", id = w.id, value = value } end
    return with_widget(state, w)
end

-- One input event: the new state and the effects it has, in order.
-- `layout` is UI.layout() of `state`.
function UI.handle(state, layout, e)
    local effects = {}
    local t = e.type
    if t == "down" then
        state = pointer_down(state, layout, e, effects)
    elseif t == "move" then
        state = pointer_move(state, layout, e, effects)
    elseif t == "up" then
        state = pointer_up(state, layout, e, effects)
    elseif t == "key" then
        local w = state.focus and state.widgets[state.focus]
        if w then
            state = edit(state, w, e, effects)
        else
            effects[#effects + 1] = { kind = "keypress", key = e.key }
        end
    elseif t == "keyup" then
        if not state.focus then effects[#effects + 1] = { kind = "keyrelease", key = e.key } end
    elseif t == "blur" then
        state = with(state, "focus", nil)
        state = with(state, "press", nil)
    end
    return state, effects
end

-- Whether any text field is on the canvas, so the program wants the keyboard.
function UI.has_textfield(state)
    for _, w in pairs(state.widgets) do
        if w.kind == "textfield" then return true end
    end
    return false
end

----------------------------------------------------------------
-- Key names
----------------------------------------------------------------

-- The names onkeypress() and onkeyrelease() accept besides a single
-- character, as the shell reports them, and the other spellings a learner
-- might use (Python turtle's Tk names among them), matched in any case.
UI.KEYS = {
    left = "left", right = "right", up = "up", down = "down",
    space = "space", ["return"] = "return", enter = "return",
    backspace = "backspace", delete = "delete", home = "home", ["end"] = "end",
    shift = "shift", ctrl = "ctrl", control = "ctrl", alt = "alt",
    pageup = "pageup", pagedown = "pagedown", prior = "pageup", next = "pagedown",
}
for i = 1, 12 do UI.KEYS["f" .. i] = "f" .. i end

-- The key name a learner's spelling means, or nil if it names no key.
function UI.key_name(s)
    if type(s) ~= "string" then return nil end
    if s == " " then return "space" end
    if length(s) == 1 and s:match("^%S") then return s:lower() end
    return UI.KEYS[s:lower()]
end

return UI
