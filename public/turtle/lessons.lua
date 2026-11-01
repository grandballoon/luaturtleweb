-- turtle/lessons.lua
--
-- The lessons the Lessons sidebar teaches (lessons-panel.js): the Linear
-- Equations and Quadratic Equations chapters of Triangle Lab, after chapters
-- 3 and 6 of The Art of Problem Solving, Volume 1. Chapters hold lessons,
-- and lessons hold examples; the sidebar shows one example per page.
--
-- Each example is { slug, title, kind, text, code }, plus `problem` and
-- `source` for a word problem. `kind` says how the example draws its idea:
--   "plane"   on a Cartesian graph, the usual picture;
--   "turtle"  as turtle geometry: headings, walks and vectors.
-- `text` is a list of paragraphs; `backticks` mark code. `code` is a whole
-- program, run as it is on the canvas or opened in the editor.
--
-- A program is also a tutorial. Lines starting `--:` at the left edge
-- explain the chunk of code below them, up to the next `--:` line; a bare
-- `--:` starts a new paragraph, and `--::` starts a step the sidebar shows
-- folded. When this file loads, tutorial() splits each program into
-- `steps`, { text, code, first, fold } where `first` is the line the chunk
-- starts on in the program, and takes the `--:` lines out of `code`.
--
-- Every plane example starts with its graph paper, drawn by the turtle
-- library's own graph() and axes(), so its program stays complete on its
-- own and its coordinates are the graph's. Programs avoid `//` and printing
-- bare floats, which differ between Lua 5.4 and LuaJIT.
--
-- Pure data: edit freely. test/lessons_test.lua checks the shape, and runs
-- every program on the host at two canvas sizes, checking that it draws
-- inside the canvas.

local linear = {
    title = "Linear Equations",
    summary = "Equations whose unknowns are only scaled and added. "
        .. "Solve for one unknown by doing the same to both sides, for two by substitution or elimination, "
        .. "and solve word problems by naming the unknowns first.",
    lessons = {
        {
            slug = "linear-balance",
            title = "Keep It Balanced",
            summary = "One unknown: do the same thing to both sides until the unknown stands alone.",
            examples = {
                {
                    slug = "two-lines",
                    title = "Each side is a line",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 3-2",
                    text = {
                        "An equation says that two expressions are equal. In 3x + 5 = 11 + x, each side gives a number for every x, so each side can be drawn as a line: y = 3x + 5 and y = 11 + x.",
                        "A solution is an x where the two sides agree, which is where the two lines cross. Here they cross above x = 3, at a height of 14.",
                        "Check an answer by putting it back into the equation: both sides come out as 14.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -4 to 6 and y from -4 to 18,
--: stretched to fill the canvas. `axes` rules a grid line every 1 across and 2
--: up.
graph(-4, -4, 6, 18, "stretch")
axes(1, 2)
hideturtle()

--: Draw each side of the equation as a line: `plot`
--: draws y = 3x + 5 in blue and y = 11 + x in orange. `mark` puts a dot where
--: they cross, at (3, 14).
plot(function(x) return 3 * x + 5 end, "royalblue")    -- the left side, 3x + 5
plot(function(x) return 11 + x end, "darkorange")      -- the right side, 11 + x
mark(3, 14, "crimson", "(3, 14)")

--: Check the answer by putting x = 3 back into both sides. The two printed
--: lines should end in the same number.
-- Check the answer by putting it back into both sides.
local x = 3
print("left side:  3x + 5 = " .. 3 * x + 5)
print("right side: 11 + x = " .. 11 + x)
]],
                },
                {
                    slug = "moves-keep-the-crossing",
                    title = "Every move keeps the crossing",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 3-2",
                    text = {
                        "Solve 3x + 5 = 11 + x one move at a time: take 5 from both sides, then take x from both sides, then divide both sides by 2.",
                        "Each move does the same thing to both sides, so it moves both lines alike. The crossing slides up or down, but it never moves sideways: every equation along the way has the same solution.",
                        "The last equation, x = 3, is a flat line and a slanted one that cross above 3. Nothing is left to solve.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -2 to 6 and y from -2 to 16,
--: stretched to fill the canvas. `axes` rules a grid line every 1 across and 2
--: up.
graph(-2, -2, 6, 16, "stretch")
axes(1, 2)
hideturtle()

--: List the equation as it stands after each move: a
--: name, its two sides, and a color. Each side is a function of x, written
--: `function(x) return ... end`, so `plot` can draw it.

-- The equation after each move: its name, its two sides, and a color.
local stages = {
    { "3x + 5 = 11 + x", function(x) return 3 * x + 5 end, function(x) return 11 + x end, "royalblue" },
    { "3x = 6 + x",      function(x) return 3 * x end,     function(x) return 6 + x end,  "seagreen" },
    { "2x = 6",          function(x) return 2 * x end,     function(x) return 6 end,      "darkorange" },
    { "x = 3",           function(x) return x end,         function(x) return 3 end,      "crimson" },
}
--: Draw both sides of every stage in that stage's color, and mark where they
--: cross. `stage[2](3)` works out the left side at x = 3, which is the
--: crossing's height.
for _, stage in ipairs(stages) do
    plot(stage[2], stage[4])
    plot(stage[3], stage[4])
    mark(3, stage[2](3), stage[4], stage[1])
end

--: Last, a thin red line straight up through x = 3 shows that every crossing
--: sits on it.
-- Every crossing is above x = 3.
pencolor("crimson")
pensize(1)
teleport(3, -2)
setpos(3, 16)
]],
                },
                {
                    slug = "equal-walks",
                    title = "Two walks that end together",
                    kind = "turtle",
                    text = {
                        "Read 3x + 5 = 11 + x as two walks along the same heading. A stride, x long, is the unknown; a step is 1 long. The left side walks 3 strides and then 5 steps, and the right side walks 1 stride and then 11 steps.",
                        "The equation says both walks end at the same spot. Take the same pieces, a stride and 5 steps, off both walks and they still end together: 2 strides match 6 steps, so a stride is 3 steps.",
                        "In vector terms, each side is a sum of arrows that all point the same way, and solving keeps the two sums equal while making them simpler.",
                    },
                    code = [[
--: Choose the scale: U pixels for one step. Balancing gives 2x = 6, so a
--: stride is 3 steps; the program works that out instead of typing 3.
-- A stride (blue) is the unknown x; a step (orange) is 1.
local U = screen_width() / 26              -- pixels in one step
local x = (11 - 5) / (3 - 1)               -- balancing gives 2x = 6

--: `walk` lays pieces end to end, heading east from the same starting x on
--: every row. Each piece has a length and a color. Lifting the pen for 3
--: pixels leaves a gap where one piece ends, and a red dot marks where the
--: walk stops.
-- Walks the pieces end to end, heading east from the left, marks where
-- the walk ends, and labels it.
local function walk(row, pieces, label)
    teleport(-10 * U, row * U)
    setheading(0)
    for _, piece in ipairs(pieces) do
        pencolor(piece.color)
        forward(piece.length * U - 3)
        penup()
        forward(3)                         -- a small gap between pieces
        pendown()
    end
    dot(12, "crimson")
    pencolor("dimgray")
    write("  " .. label, false, "left", { "Arial", 12 })
end

--: Two shorthands: `stride` is the blue piece x long, and `steps(n)` makes an
--: orange piece n long.
local stride = { length = x, color = "royalblue" }
local function steps(n) return { length = n, color = "darkorange" } end

--: Walk both sides of 3x + 5 = 11 + x: their dots line up. Then walk what is
--: left after taking a stride and 5 steps from each, 2x and 6: they still end
--: together.
pensize(8)
speed(6)
walk(4, { stride, stride, stride, steps(5) }, "3x + 5")
walk(2, { stride, steps(11) }, "11 + x")
-- Take a stride and 5 steps off both walks: they still end together.
walk(-2, { stride, stride }, "2x")
walk(-4, { steps(6) }, "6")
hideturtle()
print(string.format("a stride is %g steps", x))
]],
                },
                {
                    slug = "ages",
                    title = "Word problem: two ages",
                    kind = "turtle",
                    problem = "Johnny is twice as old as Gina, and he is also five years older than her. How old is Johnny?",
                    source = "AoPS Vol. 1, Example 3-10",
                    text = {
                        "Name the unknowns first: Gina is G years old and Johnny is J. Then the two facts are two equations, J = 2G and J = G + 5.",
                        "Draw Johnny's age twice, as bars of years. The top bar is two of Gina's bars; the bottom bar is one of Gina's bars and then 5 more years.",
                        "Both bars are Johnny's age, so they end together. Their first pieces match, so the rest must match too: Gina's second bar is 5 years long. Gina is 5 and Johnny is 10.",
                    },
                    code = [[
--: One year is U pixels. G + G = G + 5 says Gina's second bar is 5 years
--: long, so G = 5, and Johnny is J = 2G.
local U = screen_width() / 16              -- pixels in one year
local G = 5                                -- G + G = G + 5, so take G away: G = 5
local J = 2 * G

--: `bar` lays pieces end to end along a row, like the walks on the last page,
--: then writes the row's equation after it.
-- Lays bars end to end from the left, then labels the row.
local function bar(row, pieces, label)
    teleport(-6 * U, row * U)
    setheading(0)
    for _, piece in ipairs(pieces) do
        pencolor(piece[2])
        forward(piece[1] * U - 3)
        penup()
        forward(3)
        pendown()
    end
    pencolor("dimgray")
    write("  " .. label, false, "left", { "Arial", 12 })
end

--: Draw Johnny's age both ways: as two of Gina's bars, and as one of Gina's
--: bars and then 5 years.
pensize(14)
speed(6)
bar(1, { { G, "royalblue" }, { G, "royalblue" } }, "J = 2G")
bar(-1, { { G, "royalblue" }, { 5, "darkorange" } }, "J = G + 5")

--: Thin gray lines drop through where Gina's first bar ends and where both
--: bars end, to show that the pieces match.
-- Where the pieces meet, and where both bars end.
pensize(1)
pencolor("gray")
for _, years in ipairs({ G, J }) do
    teleport(-6 * U + years * U, 2 * U)
    setheading(270)
    forward(4 * U)
end
hideturtle()
print(string.format("Gina is %d and Johnny is %d", G, J))
]],
                },
            },
        },
        {
            slug = "linear-solution-sets",
            title = "What Makes It Linear",
            summary = "An equation is linear when its unknowns are only scaled and added. Its solutions then line up.",
            examples = {
                {
                    slug = "solutions-line-up",
                    title = "The solutions line up",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 3.3",
                    text = {
                        "x + y = 3 has two unknowns, so one answer is a pair (x, y). Pick any x, and y is whatever makes the sum 3: (3, 0), (0, 3), (1, 2), (6, -3), and so on without end.",
                        "Plot them and they all lie on one line. That is what makes an equation linear: every term is a number times a single unknown, so its degree is one, and its solutions form a line.",
                        "The line also holds the answers between the dots, like (1.5, 1.5).",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -4 to 7 and y from -4 to 7, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-4, -4, 7, 7)
axes(1, 1)
hideturtle()

--: Try each whole number x from -3 to 6. For each, y =
--: 3 - x makes the sum 3: mark the point, and print the check.

-- Some solutions of x + y = 3: pick x, and y is whatever makes the sum 3.
for x = -3, 6 do
    local y = 3 - x
    mark(x, y, "crimson")
    print(string.format("(%d, %d): %d + %d = 3", x, y, x, y))
end

--: Draw the line y = 3 - x through the dots, and mark one solution that falls
--: between them, (1.5, 1.5).
-- They all lie on one line.
plot(function(x) return 3 - x end, "royalblue")
mark(1.5, 1.5, "seagreen", "(1.5, 1.5)")
]],
                },
                {
                    slug = "not-linear",
                    title = "When they don't line up",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 3-1",
                    text = {
                        "xy = 4 and x² + y = 4 have degree two: x times y, and x times x. Their solutions don't line up.",
                        "The solutions of xy = 4 (orange) lie on a curve in two pieces, and those of x² + y = 4 (green) on an arch. For comparison, the linear x + y = 3 (blue) is straight.",
                        "Degree two is where the second chapter, Quadratic Equations, begins.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -6 to 6 and y from -6 to 6, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-6, -6, 6, 6)
axes(1, 1)
hideturtle()

--: Mark some solutions of xy = 4: for each x in the
--: list, y = 4 / x.

-- Solutions of xy = 4: pick x, then y = 4 / x.
for _, x in ipairs({ -4, -2, -1, -0.8, 0.8, 1, 2, 4 }) do mark(x, 4 / x, "darkorange") end
--: Mark some solutions of x² + y = 4, where y = 4 - x · x.
-- Solutions of x^2 + y = 4: pick x, then y = 4 - x^2.
for x = -3, 3 do mark(x, 4 - x * x, "seagreen") end

--: Plot the curve through each set in its color, and the straight line x + y
--: = 3 in blue to compare.
-- Join each set up to see what it lies on.
plot(function(x) return 4 / x end, "darkorange")
plot(function(x) return 4 - x * x end, "seagreen")
plot(function(x) return 3 - x end, "royalblue")      -- x + y = 3, for comparison
]],
                },
                {
                    slug = "start-and-direction",
                    title = "A line is a start and a direction",
                    kind = "turtle",
                    text = {
                        "From the solution (3, 0), x can go down by any amount as long as y goes up by the same amount: the sum stays 3. So every solution is (3, 0) plus some multiple t of the direction (-1, 1).",
                        "The turtle starts on (3, 0), faces the direction (-1, 1), and walks. `towards()` finds the heading of that direction: 135°. Each stride is the length of (-1, 1), which is √2.",
                        "Walking straight, the turtle never leaves the line, forwards or backwards: at every stop, x + y is still 3. Linear means exactly this: a start, plus any amount of one direction.",
                    },
                    code = [[
--: U pixels make one unit of the graph. `round` rounds to two decimal places,
--: so the printed coordinates don't show tiny floating-point errors.
local U = math.min(screen_width(), screen_height()) / 14   -- pixels per unit
local function round(v) return math.floor(v * 100 + 0.5) / 100 end

--: Faint axes for reference, drawn at speed 0 so they appear at once.
-- Faint axes, for reference.
speed(0)
pencolor("gainsboro")
teleport(-6 * U, 0); setpos(6 * U, 0)
teleport(0, -6 * U); setpos(0, 6 * U)

--: Move to (3, 0) without drawing and face the direction (-1, 1). `towards(2
--: * U, 1 * U)` is the heading from (3, 0) to (2, 1), one step along that
--: direction away. The heading prints as 135.
-- Start on the solution (3, 0) and face the direction (-1, 1).
teleport(3 * U, 0)
setheading(towards(2 * U, 1 * U))
print(string.format("heading %g degrees", heading()))
dot(12, "seagreen")

--: `report` marks where the turtle stands, and prints its position and x + y
--: there, in graph units.
-- Shows where the turtle is, and that x + y is still 3 there.
local function report(t)
    dot(10, "crimson")
    local x, y = round(xcor() / U), round(ycor() / U)
    print(string.format("t = %d: (%g, %g), x + y = %g", t, x, y, x + y))
end

--: Walk five strides forward, each the length of (-1, 1), reporting after
--: each one: x + y stays 3.
pencolor("royalblue")
pensize(3)
speed(5)
local stride = math.sqrt(2) * U            -- the length of (-1, 1)
for t = 1, 5 do
    forward(stride)
    report(t)
end
--: Then walk backwards past the start. Negative multiples of the direction
--: are solutions too.
-- And backwards, past the start: negative multiples of the direction.
for t = 4, -3, -1 do
    back(stride)
    report(t)
end
]],
                },
                {
                    slug = "slope-as-heading",
                    title = "Slope is a heading",
                    kind = "turtle",
                    text = {
                        "The line y = ⅔x + 1 rises 2 for every 3 across. The turtle can walk it two ways.",
                        "As a staircase (orange): 3 across, turn left, 2 up, turn right, again and again. Every corner it reaches is on the line.",
                        "Or straight (blue): face the direction (3, 2) and walk. `towards()` turns the slope into a heading, about 33.7°, and four times the length of (3, 2), 4√13, brings the turtle to the same last corner. Slope and heading are two names for the same direction.",
                    },
                    code = [[
--: U pixels per unit, a rounding helper, and faint axes, as on the last page.
local U = math.min(screen_width(), screen_height()) / 16   -- pixels per unit
local function round(v) return math.floor(v * 100 + 0.5) / 100 end

-- Faint axes, for reference.
speed(0)
pencolor("gainsboro")
teleport(-7 * U, 0); setpos(7 * U, 0)
teleport(0, -7 * U); setpos(0, 7 * U)

--: From (-6, -3), walk the staircase: 3 across, turn left, 2 up, turn right,
--: and mark each corner.
-- The staircase, from the point (-6, -3) on the line.
teleport(-6 * U, -3 * U)
setheading(0)
pencolor("darkorange")
pensize(2)
speed(7)
for i = 1, 4 do
    forward(3 * U)      -- run 3
    left(90)
    forward(2 * U)      -- rise 2
    right(90)
    dot(10, "crimson")
end

--: Go back to (-6, -3) and face the direction (3, 2) with `towards`. Four
--: lengths of (3, 2), which is 4√13, end at the staircase's last corner: the
--: print says (6, 5).
-- The straight walk: face (3, 2) and go.
teleport(-6 * U, -3 * U)
setheading(towards(-3 * U, -1 * U))       -- from (-6, -3) towards (-3, -1)
print(string.format("heading %.1f degrees", heading()))
pencolor("royalblue")
pensize(3)
forward(4 * math.sqrt(13) * U)            -- four times the length of (3, 2)
print(string.format("ends at (%g, %g)", round(xcor() / U), round(ycor() / U)))
]],
                },
            },
        },
        {
            slug = "linear-substitution",
            title = "Substitution",
            summary = "Two unknowns, two equations: solve one equation for an unknown, and put that into the other.",
            examples = {
                {
                    slug = "try-points-of-one-line",
                    title = "Try the first line's points in the second",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 3.3",
                    text = {
                        "x + y = 3 and x - y = 1 are two lines, and the pair (x, y) that solves both is where they cross.",
                        "The first equation says x = 3 - y, so its points are (3 - y, y). Try them in the second equation: (3 - y) - y = 1 holds only at y = 1, which makes x = 2.",
                        "That is substitution: put what one equation says an unknown is into the other, leaving one equation with one unknown.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -2 to 5 and y from -3 to 5, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-2, -3, 5, 5)
axes(1, 1)
hideturtle()

--: Draw the two lines, each solved for y: x + y = 3 is y = 3 - x, and x - y =
--: 1 is y = x - 1.
plot(function(x) return 3 - x end, "royalblue")       -- x + y = 3
plot(function(x) return x - 1 end, "darkorange")      -- x - y = 1

--: Let y run from -1 to 3 in halves. Each point (3 - y, y) is on the first
--: line; test it in the second equation, and color it red only where x - y =
--: 1 holds.
-- Points of the first line, (3 - y, y), tried in the second equation.
for y = -1, 3, 0.5 do
    local x = 3 - y
    local holds = x - y == 1
    mark(x, y, holds and "crimson" or "gray")
    print(string.format("y = %g: x = %g, x - y = %g%s", y, x, x - y, holds and "  <- holds" or ""))
end
--: Label the crossing: `mark` again, in the same red, with a label this time.
mark(2, 1, "crimson", "(2, 1)")
]],
                },
                {
                    slug = "walk-until-it-holds",
                    title = "Walk until the second equation holds",
                    kind = "turtle",
                    text = {
                        "As a walk: the turtle starts at (3, 0) on the first line and heads along it, in the direction (-1, 1). After walking t of those, it is at (3 - t, t), and x + y = 3 never stops holding.",
                        "It keeps walking until the second equation, x - y = 1, holds too. That happens at t = 1, at the crossing (2, 1).",
                        "Substitution finds the same t without walking: put (3 - t, t) into x - y = 1 to get 3 - 2t = 1, so t = 1.",
                    },
                    code = [[
--: U pixels per unit.
local U = math.min(screen_width(), screen_height()) / 12   -- pixels per unit

--: Draw faint axes, the second line, x - y = 1, in pale orange, and the first
--: line, x + y = 3, in pale blue.
-- Faint axes, and the second line, x - y = 1.
speed(0)
pensize(1)
pencolor("gainsboro")
teleport(-5 * U, 0); setpos(5 * U, 0)
teleport(0, -5 * U); setpos(0, 5 * U)
pensize(3)
pencolor("navajowhite")
teleport(-4 * U, -5 * U); setpos(5 * U, 4 * U)
-- And the first line, x + y = 3, which the turtle walks.
pencolor("lightsteelblue")
teleport(-2 * U, 5 * U); setpos(5 * U, -2 * U)

--: Start at (3, 0) facing (-1, 1), and step a tenth of that direction at a
--: time for as long as x - y is more than 1. The `1e-9` allows for rounding.
--: Each step leaves a small gray dot, and t counts the steps.
-- Walk the first line from (3, 0) in tenths of (-1, 1) until x - y = 1.
teleport(3 * U, 0)
setheading(towards(2 * U, 1 * U))
pencolor("royalblue")
speed(2)
local t = 0
while (xcor() - ycor()) / U > 1 + 1e-9 do
    forward(0.1 * math.sqrt(2) * U)
    t = t + 0.1
    dot(5, "gray")
end
--: Mark where the walk stopped, and print the t it found beside the t that
--: substitution gives.
dot(12, "crimson")
print(string.format("walked t = %.1f, stopped at (%.1f, %.1f)", t, xcor() / U, ycor() / U))
print(string.format("substitution: 3 - 2t = 1, so t = %g", (3 - 1) / 2))
]],
                },
                {
                    slug = "split-66",
                    title = "Word problem: splitting 66",
                    kind = "turtle",
                    problem = "66 is split into two numbers, and the larger is 3 more than twice the smaller. What is the larger number?",
                    source = "AoPS Vol. 1, Problem 3.31",
                    text = {
                        "Call the smaller number x and the larger y. Then x + y = 66 and y = 2x + 3.",
                        "The second equation already says what y is, so substitute: x + (2x + 3) = 66. Laid end to end, that is three x's and a 3 making 66, so 3x = 63 and x = 21. The larger number is y = 45.",
                        "The turtle lays the pieces along one line: 66 above, and below it x, then y built from two more x's and 3. The two rows end together.",
                    },
                    code = [[
--: Solve first: substituting y = 2x + 3 gives 3x + 3 = 66, so x = 21. U makes
--: 66 fill 80% of the canvas's width.
local x = (66 - 3) / 3                    -- x + 2x + 3 = 66
local y = 2 * x + 3
local U = screen_width() * 0.8 / 66       -- pixels per 1
local start = -33 * U

--: `row` lays pieces along a line from the same left edge, and writes a label
--: above them.
-- Lays pieces end to end along a row, from the left.
local function row(height, pieces, label)
    teleport(start, height)
    setheading(0)
    for _, piece in ipairs(pieces) do
        pencolor(piece[2])
        forward(piece[1] * U - 3)
        penup()
        forward(3)
        pendown()
    end
    teleport(start, height + 14)
    pencolor("dimgray")
    write(label, false, "left", { "Arial", 12 })
end

--: Draw 66 as one bar, and under it x, then y as x, x and 3. The two rows end
--: together.
pensize(14)
speed(5)
row(50, { { 66, "silver" } }, "66")
row(-10, { { x, "royalblue" }, { x, "darkorange" }, { x, "darkorange" }, { 3, "crimson" } },
    "x, then y = 2x + 3")
hideturtle()
print(string.format("x = %g and y = %g; together %g", x, y, x + y))
]],
                },
                {
                    slug = "tickets",
                    title = "Word problem: adult and student tickets",
                    kind = "plane",
                    problem = "Adult tickets cost $3.25 and student tickets $1.75. 1350 fans paid $2700 in all. How many adults came?",
                    source = "AoPS Vol. 1, Exercise 3-4",
                    text = {
                        "Let a be the number of adults and s the number of students. Counting fans gives a + s = 1350, and counting money gives 3.25a + 1.75s = 2700.",
                        "Each equation is a line on a graph of a across and s up. The answer is where they cross.",
                        "Substitute s = 1350 - a into the money equation: 3.25a + 1.75(1350 - a) = 2700, which is 1.5a = 337.5. So 225 adults came, and 1125 students.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 1400 and y from 0 to 1600,
--: stretched to fill the canvas. `axes` rules a grid line every 200 across and
--: 200 up, and names the axes "adults" and "students".
graph(0, 0, 1400, 1600, "stretch")
axes(200, 200, "adults", "students")
hideturtle()

--: Adults run across and students up. Each equation, solved for
--: s, is a line: s = 1350 - a, and s = (2700 - 3.25a) / 1.75.
plot(function(a) return 1350 - a end, "royalblue")                 -- 1350 fans
plot(function(a) return (2700 - 3.25 * a) / 1.75 end, "darkorange") -- $2700

--: Do the substitution in code, then mark the crossing, and print the answer
--: and a check of the money.
-- Substitute s = 1350 - a into the money equation, and solve for a.
local a = (2700 - 1.75 * 1350) / (3.25 - 1.75)
local s = 1350 - a
mark(a, s, "crimson", string.format("(%g, %g)", a, s))
print(string.format("%g adults and %g students", a, s))
print(string.format("check: $%.2f + $%.2f = $%.2f", 3.25 * a, 1.75 * s, 3.25 * a + 1.75 * s))
]],
                },
            },
        },
        {
            slug = "linear-elimination",
            title = "Elimination",
            summary = "Add multiples of the two equations so that one unknown cancels.",
            examples = {
                {
                    slug = "sums-through-the-crossing",
                    title = "Every sum passes through the crossing",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 3-5",
                    text = {
                        "Solve 2x + 3y = -1 and 3x - 4y = 7. At the crossing both equations hold, so any sum of multiples of them holds there too, and is another line through the crossing.",
                        "Plain adding gives 5x - y = 6 (gray), which still has both unknowns. But -3 times the first plus 2 times the second cancels x and leaves -17y = 17 (green): y = -1. And 4 times the first plus 3 times the second cancels y and leaves 17x = 17 (purple): x = 1.",
                        "Elimination picks the multiples that turn a slanted line flat or upright, so it can be read off.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -3 to 5 and y from -4 to 4, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-3, -4, 5, 4)
axes(1, 1)
hideturtle()

--: Plot the two equations, each solved for y.
plot(function(x) return (-1 - 2 * x) / 3 end, "royalblue")   -- 2x + 3y = -1
plot(function(x) return (3 * x - 7) / 4 end, "darkorange")   -- 3x - 4y = 7

--: Plot three sums of multiples of them: plain adding (gray), the one that
--: cancels x (green, flat), and the one that cancels y (purple, upright). An
--: upright line isn't y = f(x), so it is drawn with `teleport` and `setpos`.
-- Plain adding: 5x - y = 6, another line through the crossing.
plot(function(x) return 5 * x - 6 end, "silver")
-- -3 times the first plus 2 times the second: -17y = 17.
plot(function(x) return -1 end, "seagreen")
-- 4 times the first plus 3 times the second: 17x = 17.
pencolor("purple")
teleport(1, -4)
setpos(1, 4)

--: Mark the crossing, and check it in both equations.
mark(1, -1, "crimson", "(1, -1)")
print("check: 2(1) + 3(-1) = " .. 2 * 1 + 3 * -1 .. " and 3(1) - 4(-1) = " .. 3 * 1 - 4 * -1)
]],
                },
                {
                    slug = "parallel-or-same",
                    title = "Parallel, or the same line",
                    kind = "plane",
                    source = "AoPS Vol. 1, Examples 3-6 and 3-7",
                    text = {
                        "When one equation's left side is a multiple of the other's, elimination cancels both unknowns at once.",
                        "2x - 4y = 7 and x - 2y = 2: take 2 times the second from the first and get 0 = 3, which is never true. The lines are parallel (blue and orange), and there is no solution.",
                        "2x - 2y = 6 and x - y = 3: the first is exactly 2 times the second, and elimination gives 0 = 0. They are the same line (green, drawn twice), and every point of it is a solution.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -4 to 6 and y from -5 to 5, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-4, -5, 6, 5)
axes(1, 1)
hideturtle()

--: Plot the first pair, which elimination turns into 0 = 3: two parallel
--: lines.

-- 2x - 4y = 7 and x - 2y = 2 are parallel.
plot(function(x) return (2 * x - 7) / 4 end, "royalblue")
plot(function(x) return (x - 2) / 2 end, "darkorange")
print("2x - 4y = 7 minus 2(x - 2y = 2):  0 = " .. 7 - 2 * 2)

--: Plot the second pair: one line wide and pale, then the other thin and dark
--: on top, so both show although they are the same line.
-- 2x - 2y = 6 and x - y = 3 are the same line: thick, then thin on top.
plot(function(x) return (2 * x - 6) / 2 end, "palegreen", 10)
plot(function(x) return x - 3 end, "darkgreen", 2)
print("2x - 2y = 6 minus 2(x - y = 3):   0 = " .. 6 - 2 * 3)
]],
                },
                {
                    slug = "column-picture",
                    title = "The column picture: walking two vectors",
                    kind = "turtle",
                    source = "AoPS Vol. 1, Example 3-5",
                    text = {
                        "Read 2x + 3y = -1 and 3x - 4y = 7 down the columns instead: x times the vector (2, 3), plus y times the vector (3, -4), is the vector (-1, 7).",
                        "So a solution is a walk: x copies of a = (2, 3), then y copies of b = (3, -4), ending on the target (-1, 7). A negative number of copies walks backwards.",
                        "A guess like (2, 1) ends somewhere else (gray). The solution (1, -1) walks a once and b once backwards, and lands on the target. Elimination finds those amounts without guessing.",
                    },
                    code = [[
--: U pixels per unit, and the two column vectors, a = (2, 3) and b = (3, -4).
local U = math.min(screen_width(), screen_height()) / 22   -- pixels per unit
local a, b = { 2, 3 }, { 3, -4 }

--: `walk` moves the turtle by n copies of a vector. It faces where the vector
--: leads with `towards`, goes forward the vector's length, and draws an
--: arrowhead. A negative n turns the vector around.
-- Walks n copies of vector v, ending in an arrowhead.
local function walk(n, v, color)
    pencolor(color)
    local dx, dy = n * v[1] * U, n * v[2] * U
    setheading(towards(xcor() + dx, ycor() + dy))
    forward(math.sqrt(dx * dx + dy * dy))
    left(150); forward(10); back(10); right(300); forward(10); back(10); left(150)
end

--: `try` starts at the origin, walks x copies of a and then y copies of b,
--: and prints where it ends.
-- Walks x copies of a and y copies of b from the start.
local function try(x, y, color_a, color_b)
    teleport(0, 0)
    walk(x, a, color_a)
    walk(y, b, color_b)
    print(string.format("x = %d, y = %d ends at (%g, %g)", x, y,
        math.floor(xcor() / U + 0.5), math.floor(ycor() / U + 0.5)))
end

--: Mark the start and the target, (-1, 7), then walk a guess and the
--: solution.
speed(0)
dot(10, "seagreen")                       -- the start
teleport(-1 * U, 7 * U)
dot(16, "crimson")                        -- the target
pencolor("dimgray")
write("  target (-1, 7)", false, "left", { "Arial", 12 })

pensize(3)
speed(7)
try(2, 1, "silver", "silver")             -- a guess
try(1, -1, "royalblue", "darkorange")     -- the solution
]],
                },
                {
                    slug = "coins",
                    title = "Word problem: nickels and dimes",
                    kind = "turtle",
                    problem = "A bank holds 16 coins, all nickels and dimes, worth $1.05 together. How many nickels are there?",
                    source = "AoPS Vol. 1, Problem 3.29",
                    text = {
                        "With n nickels and d dimes, n + d = 16 coins and 5n + 10d = 105 cents. As vectors, each coin is a step: one coin across, and its value in cents up. A nickel is (1, 5) and a dime is (1, 10), and the walk must end at (16, 105).",
                        "All nickels (gray) ends at (16, 80), 25 cents short. Swapping a nickel for a dime raises the end by 5, so it takes 5 swaps. That is elimination: subtract 5 times the coin equation from the money equation, and 5d = 25.",
                        "So there are 5 dimes and 11 nickels: 11 nickel steps (blue), then 5 dime steps (orange), ending on the target.",
                    },
                    code = [[
--: Coins go across and cents go up, each with its own scale, so the whole
--: walk fits the canvas.
local W, H = screen_width() * 0.8, screen_height() * 0.8
local SX, SY = W / 16, H / 110            -- pixels per coin, pixels per cent

--: `coins` takes one step per coin: one coin across and its value up. It aims
--: with `towards` and walks the `distance` to the next point.
-- Takes `count` coin steps, each one coin across and `value` cents up.
local function coins(count, value, color)
    pencolor(color)
    for i = 1, count do
        local x, y = xcor() + SX, ycor() + value * SY
        setheading(towards(x, y))
        forward(distance(x, y))
        dot(6)
    end
end

--: Mark the target: 16 coins worth 105 cents.
speed(0)
teleport(-W / 2 + 16 * SX, -H / 2 + 105 * SY)
dot(16, "crimson")                        -- the target: 16 coins, 105 cents
teleport(xcor(), ycor() + 12)
pencolor("dimgray")
write("16 coins, 105 cents", false, "right", { "Arial", 12 })

--: Walk all nickels first: 25 cents short. Elimination says each swap for a
--: dime adds 5 cents, so walk 11 nickels and then 5 dimes, which land on the
--: target.
pensize(2)
speed(6)
teleport(-W / 2, -H / 2)
coins(16, 5, "silver")                    -- all nickels: 80 cents
local d = (105 - 5 * 16) / (10 - 5)       -- each swap adds 5 cents
local n = 16 - d
teleport(-W / 2, -H / 2)
pensize(3)
coins(n, 5, "royalblue")
coins(d, 10, "darkorange")
print(string.format("%d nickels and %d dimes: %d cents", n, d, 5 * n + 10 * d))
]],
                },
            },
        },
        {
            slug = "catching-up",
            title = "Rate Times Time",
            summary = "Rate × time = distance. Name the unknowns, write the equations, and solve.",
            examples = {
                {
                    slug = "overtaking-graph",
                    title = "Word problem: the overtaking car",
                    kind = "plane",
                    problem = "A car leaves a city at 2 PM at 40 miles an hour. A second car leaves at 4 PM on the same road and overtakes the first at 9 PM. How fast is the second car?",
                    source = "AoPS Vol. 1, Problem 3.43",
                    text = {
                        "Measure time t in hours after 2 PM. The first car has gone 40t miles, so its distance is a line through the start with slope 40.",
                        "The second car starts at t = 2 and goes v miles an hour, so its distance is v(t - 2). Overtaking at 9 PM means the lines cross at t = 7: 40 × 7 = v × 5.",
                        "So v = 56 miles an hour, and they meet 280 miles out.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 8 and y from 0 to 320,
--: stretched to fill the canvas. `axes` rules a grid line every 1 across and 40
--: up, and names the axes "hours after 2 PM" and "miles".
graph(0, 0, 8, 320, "stretch")
axes(1, 40, "hours after 2 PM", "miles")
hideturtle()

--: Find the second car's speed first, from 40 × 7 = v × 5. Then plot each
--: car's distance. The second car's function gives no value before t = 2, so
--: its line starts there.
-- Overtaking at t = 7: 40 * 7 = v * (7 - 2).
local v = 40 * 7 / (7 - 2)
plot(function(t) return 40 * t end, "royalblue")
plot(function(t) if t >= 2 then return v * (t - 2) end end, "darkorange")
--: Mark the overtaking, and print the speed.
mark(7, 280, "crimson", "9 PM, 280 miles")
print(string.format("the second car drives %g miles an hour", v))
]],
                },
                {
                    slug = "overtaking-road",
                    title = "The same race, on the road",
                    kind = "turtle",
                    problem = "The same two cars: 40 miles an hour from 2 PM, and 56 miles an hour from 4 PM.",
                    text = {
                        "Now the cars are two turtles on a road. Each hour, each car moves forward by its speed: its position is its start plus its speed times the time, a vector along the road.",
                        "The second car starts two hours late, but closes 16 miles an hour. It has 80 miles to make up, which takes 5 hours: at 9 PM they are side by side.",
                    },
                    code = [[
--: Pixels per mile, so that 300 miles fit, and where the road starts.
local U = screen_width() * 0.8 / 300      -- pixels per mile
local start = -150 * U

--: Draw the road, with a tick every 40 miles.
-- The road, with a tick every 40 miles.
hideturtle()
speed(0)
pencolor("gainsboro")
teleport(start, 0); setpos(start + 300 * U, 0)
for miles = 0, 280, 40 do teleport(start + miles * U, -6); setpos(start + miles * U, 6) end

--: Make two turtles, one for each car, each with its own color and lane.
--: `a:forward(...)` moves only turtle a.
local a, b = Turtle(), Turtle()
a:color("royalblue"); b:color("darkorange")
a:pensize(3); b:pensize(3)
a:teleport(start, 20); b:teleport(start, -20)
a:speed(4); b:speed(4)

--: Hour by hour, move each car forward by its speed and drop a dot; the
--: second car only starts at 4 PM. They meet 280 miles out.
for hour = 1, 7 do
    a:forward(40 * U)
    a:dot(8)
    if hour > 2 then
        b:forward(56 * U)
        b:dot(8)
    end
    print(string.format("%d PM: first car %d miles, second car %d miles",
        2 + hour, 40 * hour, hour > 2 and 56 * (hour - 2) or 0))
end
teleport(start + 280 * U, 40)
pencolor("crimson")
write("9 PM", false, "center", { "Arial", 12 })
]],
                },
                {
                    slug = "average-speed",
                    title = "Word problem: the average speed trap",
                    kind = "plane",
                    problem = "Jim drives 40 miles to his mother's house at 40 miles an hour, and back at 20 miles an hour. What is his average speed?",
                    source = "AoPS Vol. 1, Example 3-12",
                    text = {
                        "It is not 30. Average speed is total distance over total time. Going takes 1 hour and coming back takes 2, so 80 miles take 3 hours: 26⅔ miles an hour.",
                        "On a graph of miles driven against hours, the trip is two pieces with slopes 40 and 20. The average speed is the slope of the straight line (red) from the start to the end.",
                        "The slow leg counts for more because Jim spends more time on it. The gray line shows where 30 miles an hour would have finished.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 3.5 and y from 0 to 90,
--: stretched to fill the canvas. `axes` rules a grid line every 0.5 across and
--: 10 up, and names the axes "hours" and "miles driven".
graph(0, 0, 3.5, 90, "stretch")
axes(0.5, 10, "hours", "miles driven")
hideturtle()

--: Draw the trip: 1 hour out to (1, 40), then 2 hours back, reaching 80 miles
--: after 3 hours.

-- Out: 40 miles at 40 mph takes 1 hour. Back: 40 miles at 20 mph takes 2.
pencolor("royalblue")
pensize(3)
speed(3)
teleport(0, 0)
setpos(1, 40)
setpos(3, 80)
mark(1, 40, "royalblue", "at his mother's")

--: The straight red line from start to finish has the average speed as its
--: slope. The gray line shows where 30 miles an hour would have finished:
--: sooner.
-- The average: total distance over total time, a straight line.
pencolor("crimson")
pensize(2)
teleport(0, 0)
setpos(3, 80)
-- Where 30 miles an hour would have finished.
pencolor("silver")
teleport(0, 0)
setpos(80 / 30, 80)
print(string.format("average speed %.2f miles an hour, not 30", 80 / 3))
]],
                },
                {
                    slug = "frog",
                    title = "Word problem: the frog and the current",
                    kind = "turtle",
                    problem = "A frog swims 8 miles downstream in 2 hours and back upstream in 14 hours. How fast does she swim in still water?",
                    source = "AoPS Vol. 1, Example 3-13",
                    text = {
                        "Let the frog swim x miles an hour in still water, with a current of y. Velocities are vectors, and they add: downstream the current pushes along with her, x + y, and upstream it pushes against her, x - y.",
                        "Rate × time = distance gives (x + y) × 2 = 8 and (x - y) × 14 = 8, so x + y = 4 and x - y = 4/7.",
                        "Adding the equations eliminates y: 2x = 32/7, so x = 16/7, about 2.29 miles an hour. The arrows are the frog (green), the current (blue), and their sum (purple) each way.",
                    },
                    code = [[
--: U pixels per mile an hour. The two speeds come from rate = distance /
--: time, and adding and subtracting the two equations gives x and y.
local U = screen_width() / 10             -- pixels per mile an hour
local down, up = 8 / 2, 8 / 14            -- rate = distance / time
local x = (down + up) / 2                 -- add the equations: 2x = down + up
local y = (down - up) / 2                 -- subtract them:     2y = down - up

--: `arrow` draws a level arrow from a point, east for a positive length and
--: west for a negative one, and labels its middle.
-- An arrow `length` pixels east (or west, if negative) from (x0, y0),
-- labeled above its middle.
local function arrow(x0, y0, length, color, label)
    teleport(x0, y0)
    setheading(length >= 0 and 0 or 180)
    pencolor(color)
    pensize(3)
    forward(math.abs(length))
    left(150); forward(10); back(10); right(300); forward(10); back(10); left(150)
    teleport(x0 + length / 2, y0 + 8)
    pencolor("dimgray")
    write(label, false, "center", { "Arial", 11 })
end

--: Draw the downstream vectors tip to tail, and their sum. Then the upstream
--: ones: the frog points west, and the current still points east.
speed(8)
-- Downstream: frog then current, tip to tail, and their sum.
arrow(-2 * U, 110, x * U, "seagreen", "frog")
arrow(-2 * U + x * U, 110, y * U, "steelblue", "current")
arrow(-2 * U, 70, (x + y) * U, "purple", "downstream: 4")
-- Upstream: the frog swims west, and the current still pushes east.
arrow(2 * U, -20, -x * U, "seagreen", "frog")
arrow(2 * U - x * U, -55, y * U, "steelblue", "current")
arrow(2 * U, -95, -(x - y) * U, "purple", "upstream: 4/7")
hideturtle()
print(string.format("frog %.2f mph, current %.2f mph", x, y))
]],
                },
                {
                    slug = "flea",
                    title = "Word problem: the flea between two dogs",
                    kind = "turtle",
                    problem = "Two dogs 500 feet apart run toward each other at 10 feet a second each. A flea flies from one dog's nose to the other's and back, at 25 feet a second, until the dogs meet. How far does the flea fly?",
                    source = "AoPS Vol. 1, Problem 3.51",
                    text = {
                        "The long way follows the flea, leg by leg (red), with the dogs (brown) closing in, one leg per row. Each leg is shorter than the last, and after a handful the dogs are less than a foot apart.",
                        "The short way is rate × time. The dogs close at 20 feet a second, so they meet after 500 ÷ 20 = 25 seconds. The flea flies the whole 25 seconds at 25 feet a second: 625 feet.",
                        "The legs, added up, come to the same answer.",
                    },
                    code = [[
--: Set the scene in feet: the two dogs, the flea on the left dog's nose, and
--: counters for time, distance and legs. Each leg is drawn one row lower.
local U = screen_width() * 0.8 / 500      -- pixels per foot
local left_dog, right_dog = -250, 250     -- positions, in feet
local flea, direction = left_dog, 1       -- the flea starts on the left dog
local time, flown, legs = 0, 0, 0
local row, drop = screen_height() * 0.35, screen_height() * 0.08

--: `dog` draws one dog's move during a leg, from one row to the next.
-- Moves a dog from `from` to `to` feet, a row down, and marks it.
local function dog(from, to)
    pencolor("sienna")
    pensize(1)
    teleport(from * U, row)
    setpos(to * U, row - drop)
    dot(10)
end

--: Leg by leg: the flea flies at the dog ahead of it, and they close at 35
--: feet a second, so the leg takes the gap ÷ 35 seconds. Move both dogs, draw
--: the flea's leg, and turn the flea around, until the dogs are less than a
--: foot apart.
speed(4)
teleport(left_dog * U, row); dot(10, "sienna")
teleport(right_dog * U, row); dot(10, "sienna")
while right_dog - left_dog > 1 do
    -- The flea and the dog ahead of it close at 25 + 10 feet a second.
    local target = direction > 0 and right_dog or left_dog
    local t = math.abs(target - flea) / (25 + 10)
    local landing = flea + direction * 25 * t
    dog(left_dog, left_dog + 10 * t)
    dog(right_dog, right_dog - 10 * t)
    left_dog, right_dog = left_dog + 10 * t, right_dog - 10 * t
    pencolor("crimson")
    pensize(2)
    teleport(flea * U, row)
    setpos(landing * U, row - drop)
    flea, direction = landing, -direction
    time, flown, legs = time + t, flown + 25 * t, legs + 1
    row = row - drop
end
--: Print the total the long way, and the rate × time way.
hideturtle()
print(string.format("after %d legs: %.2f seconds, %.1f feet flown", legs, time, flown))
print(string.format("rate x time: %g seconds x 25 feet a second = %g feet", 500 / 20, 500 / 20 * 25))
]],
                },
            },
        },
        {
            slug = "work-rates",
            title = "Working Together",
            summary = "Work problems are rate problems: a rate is the fraction of the job done in one unit of time, and rates add.",
            examples = {
                {
                    slug = "pipes-graph",
                    title = "Word problem: two pipes",
                    kind = "plane",
                    problem = "Pipe A fills a pool in 5 hours, and pipe B in 4. How long do they take together?",
                    source = "AoPS Vol. 1, Example 3-14",
                    text = {
                        "In one hour pipe A fills 1/5 of the pool and pipe B fills 1/4, so together they fill 1/5 + 1/4 = 9/20 of it.",
                        "Graph the fraction filled against time: each pipe is a line through the start, and the two together make the steepest line. The pool is full where that line reaches 1.",
                        "x(1/5 + 1/4) = 1 gives x = 20/9, about 2 hours and 13 minutes.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 5 and y from 0 to 1.2,
--: stretched to fill the canvas. `axes` rules a grid line every 1 across and
--: 0.2 up, and names the axes "hours" and "pool filled".
graph(0, 0, 5, 1.2, "stretch")
axes(1, 0.2, "hours", "pool filled")
hideturtle()

--: Plot each pipe's share of the pool against time, and both together; a gray
--: line marks a full pool.
plot(function(t) return t / 5 end, "royalblue")                 -- pipe A
plot(function(t) return t / 4 end, "darkorange")                -- pipe B
plot(function(t) return t * (1 / 5 + 1 / 4) end, "seagreen")    -- both
pencolor("gray")
pensize(1)
teleport(0, 1)
setpos(5, 1)                                                     -- full

--: Full means t(1/5 + 1/4) = 1. Mark that time, and print it in hours and
--: minutes.
local t = 1 / (1 / 5 + 1 / 4)
mark(t, 1, "crimson", string.format("%.2f hours", t))
print(string.format("together: %.2f hours, about 2 hours %.0f minutes", t, (t - 2) * 60))
]],
                },
                {
                    slug = "pipes-bar",
                    title = "Rates laid end to end",
                    kind = "turtle",
                    problem = "The same two pipes: 1/5 of the pool an hour, and 1/4.",
                    text = {
                        "Now the pool is a bar, filled hour by hour. Each hour pipe A adds a fifth of the bar (blue) and pipe B a quarter (orange), laid end to end like vectors along one line.",
                        "After 2 hours, 9/10 of the pool is full. The last tenth fills at the same 9/20 an hour, which takes 1/10 ÷ 9/20 = 2/9 of an hour (the pale pieces).",
                    },
                    code = [[
--: The pool is a bar L pixels long, drawn empty first.
local L = screen_width() * 0.8            -- the whole pool, in pixels
local x0 = -L / 2

-- The empty pool.
speed(0)
pencolor("gray")
teleport(x0, 30); setpos(x0 + L, 30); setpos(x0 + L, -30); setpos(x0, -30); setpos(x0, 30)

--: `pour` fills the next part of the bar as a rectangle, and counts it in
--: `filled`.
-- Fills the next `fraction` of the pool.
local filled = 0
local function pour(fraction, color)
    teleport(x0 + filled * L, -30)
    setheading(0)
    pencolor("white")
    fillcolor(color)
    begin_fill()
    forward(fraction * L); left(90); forward(60); left(90)
    forward(fraction * L); left(90); forward(60); left(90)
    end_fill()
    filled = filled + fraction
end

--: Pour two whole hours, then the part of an hour that the rest takes at 9/20
--: of the pool an hour.
speed(9)
for hour = 1, 2 do
    pour(1 / 5, "royalblue")
    pour(1 / 4, "darkorange")
    print(string.format("after hour %d: %g of the pool", hour, filled))
end
-- The rest fills at the same 9/20 an hour.
local part = (1 - filled) / (1 / 5 + 1 / 4)
pour(part / 5, "lightsteelblue")
pour(part / 4, "navajowhite")
hideturtle()
print(string.format("the last %.2f of an hour fills the rest: %.2f hours in all", part, 2 + part))
]],
                },
                {
                    slug = "fence",
                    title = "Word problem: painting the fence",
                    kind = "turtle",
                    problem = "Tom and Huck paint a fence for 4 hours, then Jim joins them and they finish 2 hours later. Without Jim, Tom and Huck would have needed 5 more hours instead of 2. How long would Jim take alone?",
                    source = "AoPS Vol. 1, Example 3-15",
                    text = {
                        "Without Jim, Tom and Huck would have painted for 4 + 5 = 9 hours, so together they paint 1/9 of the fence an hour.",
                        "Give the fence 18 pickets so the rates are whole numbers: Tom and Huck paint 2 an hour, 8 in the first 4 hours (green). The last 10 take all three 2 hours, 5 an hour, so Jim paints 3 an hour (orange).",
                        "Alone, Jim paints 18 pickets in 18 ÷ 3 = 6 hours.",
                    },
                    code = [[
--: P pixels per picket, and `picket`, which draws picket number i: a filled
--: board with a pointed top.
local P = screen_width() * 0.8 / 18       -- pixels per picket
local x0 = -9 * P

-- Paints picket number i, a board with a pointed top.
local function picket(i, color)
    local x, w = x0 + (i - 1) * P + 2, P - 4
    pencolor("dimgray")
    fillcolor(color)
    teleport(x, -40)
    begin_fill()
    setpos(x, 30); setpos(x + w / 2, 30 + w / 2); setpos(x + w, 30)
    setpos(x + w, -40); setpos(x, -40)
    end_fill()
end

--: Draw all 18 pickets, unpainted.
speed(0)
for i = 1, 18 do picket(i, "white") end

--: Paint hour by hour: Tom and Huck 2 pickets an hour, and from hour 5, Jim 3
--: more.
speed(6)
local painted = 0
for hour = 1, 6 do
    for k = 1, 2 do painted = painted + 1; picket(painted, "seagreen") end    -- Tom and Huck
    if hour > 4 then
        for k = 1, 3 do painted = painted + 1; picket(painted, "darkorange") end -- Jim
    end
    print(string.format("hour %d: %d of 18 pickets", hour, painted))
end
hideturtle()
print(string.format("Jim alone: 18 / 3 = %d hours", 18 / 3))
]],
                },
            },
        },
    },
}

local quadratic = {
    title = "Quadratic Equations",
    summary = "Equations with a squared unknown. Factor them, complete the square, or use the quadratic formula, "
        .. "and check for answers that the algebra added.",
    lessons = {
        {
            slug = "quadratic-falling-rock",
            title = "Why Squares Appear",
            summary = "A steady change in speed makes the distance grow with the square of the time.",
            examples = {
                {
                    slug = "rock-graph",
                    title = "Word problem: a rock off a tower",
                    kind = "plane",
                    problem = "A rock is thrown down from a 100-foot tower at 5 feet a second. Its height after t seconds is 100 - 5t - 16t². When does it land?",
                    source = "AoPS Vol. 1, Section 6.1",
                    text = {
                        "At a steady 5 feet a second the rock would take 20 seconds (gray line). Gravity speeds it up, and the 16t² term bends the line into a curve that reaches the ground much sooner.",
                        "It lands when 100 - 5t - 16t² = 0. Because of the t², moving terms around can't get t alone, so this needs the quadratic formula (later in the chapter): t ≈ 2.35 seconds.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 3 and y from 0 to 110,
--: stretched to fill the canvas. `axes` rules a grid line every 0.5 across and
--: 10 up, and names the axes "seconds" and "feet up".
graph(0, 0, 3, 110, "stretch")
axes(0.5, 10, "seconds", "feet up")
hideturtle()

--: Plot the height at a steady 5 feet a second, and the height with gravity.
plot(function(t) return 100 - 5 * t end, "silver")                   -- steady 5 ft/s
plot(function(t) return 100 - 5 * t - 16 * t * t end, "royalblue")   -- with gravity

--: Find when the height is 0 with the quadratic formula, and mark it.
-- 16t^2 + 5t - 100 = 0, solved by the quadratic formula.
local t = (-5 + math.sqrt(5 * 5 + 4 * 16 * 100)) / (2 * 16)
mark(t, 0, "crimson", string.format("lands at %.2f s", t))
print(string.format("lands after %.2f seconds", t))
]],
                },
                {
                    slug = "velocity-arrows",
                    title = "Velocity changes by the same vector",
                    kind = "turtle",
                    problem = "The same rock, thrown from the tower at 30 feet a second sideways and 5 feet a second down.",
                    text = {
                        "The rock's velocity is a vector: 30 feet a second across, and down by 5 at first. Every half second gravity adds the same downward vector to it, 16 feet a second.",
                        "The red arrows show the velocity every half second, along the path. Drawn again from one point (purple), their tips march straight down in equal steps: the sideways part never changes, and the downward part grows evenly, like a line.",
                        "The distance fallen adds those growing speeds up, which is why it grows like t², and the path is a parabola.",
                    },
                    code = [[
--: Pixels per foot, and `spot`, which turns feet into a place on the canvas,
--: with the tower's foot at (0, 0).
local U = math.min(screen_width() * 0.8 / 90, screen_height() * 0.8 / 110)  -- pixels per foot
local function spot(x, y) return (x - 40) * U, (y - 55) * U end

--: Draw the ground, and the tower as a filled rectangle.
-- The ground and the tower.
speed(0)
pencolor("gray")
teleport(spot(-10, 0)); setpos(spot(75, 0))
fillcolor("gainsboro")
teleport(spot(-8, 0))
begin_fill()
setpos(spot(-8, 100)); setpos(spot(0, 100)); setpos(spot(0, 0)); setpos(spot(-8, 0))
end_fill()

--: The rock's position and velocity at time t, each a pair of numbers.
local function position(t) return 30 * t, 100 - 5 * t - 16 * t * t end
local function velocity(t) return 30, -5 - 32 * t end

--: Draw the path through 60 positions, up to the landing.
-- The path.
pencolor("royalblue")
pensize(2)
teleport(spot(position(0)))
local landing = (-5 + math.sqrt(25 + 6400)) / 32
for i = 1, 60 do setpos(spot(position(landing * i / 60))) end

--: Every half second, draw the velocity as an arrow from the rock, aimed with
--: `towards`, and print it.
-- The velocity every half second, drawn as how far it would carry the
-- rock in a quarter of a second.
pencolor("crimson")
speed(8)
for t = 0, 2, 0.5 do
    local x, y = position(t)
    local vx, vy = velocity(t)
    teleport(spot(x, y))
    local tx, ty = spot(x + vx / 4, y + vy / 4)
    setheading(towards(tx, ty))
    forward(distance(tx, ty))
    left(150); forward(8); back(8); right(300); forward(8); back(8); left(150)
    print(string.format("t = %.1f s: height %5.1f ft, velocity (%d, %d) ft/s", t, y, vx, vy))
end

--: Draw the same velocities again from one point. Their tips march straight
--: down.
-- The same velocities, drawn from one point (as far as each would carry the
-- rock in half a second): each tip is the last one moved straight down by
-- the same amount.
pencolor("purple")
for t = 0, 2, 0.5 do
    local vx, vy = velocity(t)
    teleport(spot(45, 95))
    local tx, ty = spot(45 + vx / 2, 95 + vy / 2)
    setheading(towards(tx, ty))
    forward(distance(tx, ty))
    dot(7)
end
teleport(spot(45, 98))
pencolor("dimgray")
write("velocities from one point", false, "left", { "Arial", 11 })
hideturtle()
]],
                },
                {
                    slug = "area-under-speed",
                    title = "Distance is the area under the speed",
                    kind = "plane",
                    text = {
                        "A dropped rock falls 32 feet a second faster every second, so its speed after t seconds is 32t: a line on a graph of speed against time.",
                        "In a short moment the rock falls its speed times the moment, a thin strip under the line. Added up, the distance fallen is the whole area under the line: a triangle t wide and 32t tall.",
                        "Its area is ½ × t × 32t = 16t². That is where the square comes from: the shaded triangle, after 2 seconds, holds 64 feet.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 3 and y from 0 to 100,
--: stretched to fill the canvas. `axes` rules a grid line every 0.5 across and
--: 10 up, and names the axes "seconds" and "feet per second".
graph(0, 0, 3, 100, "stretch")
axes(0.5, 10, "seconds", "feet per second")
hideturtle()

--: Fill the triangle under the speed line up to 2 seconds: `begin_fill`, its
--: three corners, then `end_fill`.

-- The distance fallen in the first 2 seconds: the area under the speed.
fillcolor("lightsteelblue")
pencolor("lightsteelblue")
teleport(0, 0)
begin_fill()
setpos(2, 0)
setpos(2, 64)
setpos(0, 0)
end_fill()

--: Plot the speed, 32t, over it, mark the corner, and print the distance
--: fallen, 16t², every half second.
plot(function(t) return 32 * t end, "royalblue")                 -- speed: 32t
mark(2, 64, "crimson", "after 2 s: area 64")

for t = 0.5, 3, 0.5 do
    print(string.format("after %.1f s: speed %g ft/s, fallen %g ft", t, 32 * t, 16 * t * t))
end
]],
                },
                {
                    slug = "ball-toss",
                    title = "Word problem: a ball tossed up",
                    kind = "turtle",
                    problem = "A ball is tossed up at 64 feet a second from an 80-foot roof. Its height is 80 + 64t - 16t². When does it land?",
                    text = {
                        "It lands when 80 + 64t - 16t² = 0. Divide by -16: t² - 4t - 5 = 0, which factors as (t - 5)(t + 1) = 0.",
                        "So t = 5 or t = -1. A time before the throw makes no sense here, so the ball lands after 5 seconds.",
                        "The turtle draws the throw with a little sideways drift so the way up and the way down don't overlap, with a dot every half second.",
                    },
                    code = [[
--: Pixels per foot, `spot`, and the ball's height at time t.
local U = math.min(screen_width() * 0.8 / 52, screen_height() * 0.8 / 150)  -- pixels per foot
local function spot(x, y) return (x - 14) * U, (y - 72) * U end
local function height(t) return 80 + 64 * t - 16 * t * t end

--: Draw the ground and the building.
-- The ground and the building.
speed(0)
pencolor("gray")
teleport(spot(-12, 0)); setpos(spot(40, 0))
fillcolor("gainsboro")
teleport(spot(-10, 0))
begin_fill()
setpos(spot(-10, 80)); setpos(spot(0, 80)); setpos(spot(0, 0)); setpos(spot(-10, 0))
end_fill()

--: Trace the throw a tenth of a second at a time, drifting 6 feet a second
--: sideways, with a red dot every half second. Then print the height each
--: second.
-- t^2 - 4t - 5 = (t - 5)(t + 1): the ball lands at t = 5.
pencolor("royalblue")
pensize(2)
speed(3)
teleport(spot(0, height(0)))
for step = 1, 50 do
    local t = step / 10
    setpos(spot(6 * t, height(t)))
    if step % 5 == 0 then dot(8, "crimson") end
end
for t = 0, 5 do print(string.format("t = %d s: %d feet up", t, height(t))) end
]],
                },
            },
        },
        {
            slug = "quadratic-factoring",
            title = "Roots From Factors",
            summary = "A product is zero only when a factor is. Factor a quadratic, and its roots can be read off.",
            examples = {
                {
                    slug = "product-of-lines",
                    title = "A parabola from two lines",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 6.2",
                    text = {
                        "(x + 2)(x + 3) multiplies out to x² + 5x + 6. Each factor is a line (pale), and their product is the parabola (blue).",
                        "A product is zero exactly when one of its factors is zero. So x² + 5x + 6 = 0 where x + 2 = 0 or x + 3 = 0: at -2 and -3, the two places the pale lines cross the axis.",
                        "These are the roots of the quadratic. Between them, one factor is negative and the other positive, so the parabola dips below the axis.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -6 to 2 and y from -3 to 6, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-6, -3, 2, 6)
axes(1, 1)
hideturtle()

--: Plot the two factors as pale lines and their product as the parabola, and
--: mark the roots.
plot(function(x) return x + 2 end, "lightsteelblue")           -- x + 2
plot(function(x) return x + 3 end, "navajowhite")              -- x + 3
plot(function(x) return (x + 2) * (x + 3) end, "royalblue")    -- their product
mark(-2, 0, "crimson", "-2")
mark(-3, 0, "crimson", "-3")

--: Print both factors and their product at a few x's: the product is 0 only
--: where a factor is.
for _, x in ipairs({ -4, -3, -2.5, -2, 0 }) do
    print(string.format("x = %g: (%g)(%g) = %g", x, x + 2, x + 3, (x + 2) * (x + 3)))
end
]],
                },
                {
                    slug = "sum-and-product",
                    title = "Hunting for a sum and a product",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 6-2",
                    text = {
                        "To factor x² - x - 30 as (x + u)(x + v), multiply out: x² + (u + v)x + uv. So u and v must have product -30 and sum -1.",
                        "The program lists every pair of whole numbers with product -30 and finds the one with sum -1: -6 and 5. So x² - x - 30 = (x - 6)(x + 5), and the roots are 6 and -5.",
                        "Signs help: a negative product means one number is negative, and a sum of -1 means they are 1 apart in size.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -7 to 8 and y from -32 to 12,
--: stretched to fill the canvas. `axes` rules a grid line every 1 across and 4
--: up.
graph(-7, -32, 8, 12, "stretch")
axes(1, 4)
hideturtle()

--: Try every u from -30 to -1 that divides 30 evenly; then v = -30 / u makes
--: the product -30. Print each pair's sum, and flag the one that is -1.

-- Pairs u <= v with u * v = -30; the one with u + v = -1 factors it.
for u = -30, -1 do
    if 30 % u == 0 then
        local v = -30 / u
        local found = u + v == -1
        print(string.format("%d and %d: sum %d%s", u, v, u + v, found and "  <- this one" or ""))
    end
end

--: Plot the parabola, and mark its roots, 6 and -5.
-- x^2 - x - 30 = (x - 6)(x + 5).
plot(function(x) return x * x - x - 30 end, "royalblue")
mark(6, 0, "crimson", "6")
mark(-5, 0, "crimson", "-5")
]],
                },
                {
                    slug = "area-tiles",
                    title = "Factoring as a rectangle",
                    kind = "turtle",
                    text = {
                        "A product of two lengths is the area of a rectangle. Make a rectangle x + 3 wide and x + 2 tall, and cut it along the x's.",
                        "It comes apart into one x by x square (blue), 5 strips 1 by x (orange), and 6 unit squares (gold). So (x + 2)(x + 3) = x² + 5x + 6.",
                        "Factoring runs this backwards: given the tiles x² + 5x + 6, find the rectangle they make. The length x is unknown, so any length draws the same picture.",
                    },
                    code = [[
--: Pick any x. U makes the rectangle fit, and its corner is at (x0, y0).
local x = 4                                -- any length will do
local U = math.min(screen_width(), screen_height()) * 0.8 / (x + 4)
local x0, y0 = -(x + 3) * U / 2, -(x + 2) * U / 2

--: `tile` fills a w by h rectangle placed in units from the corner, and
--: `label` writes text centered on a point.
-- A filled w by h tile with its corner (col, row) units from the corner.
local function tile(col, row, w, h, color)
    teleport(x0 + col * U, y0 + row * U)
    setheading(0)
    fillcolor(color)
    begin_fill()
    for i = 1, 2 do forward(w * U); left(90); forward(h * U); left(90) end
    end_fill()
end

-- Writes text centered at (col, row) units from the corner.
local function label(col, row, text)
    teleport(x0 + col * U, y0 + row * U - 8)
    write(text, false, "center", { "Arial", 16 })
end

--: Lay the tiles: the x by x square, 3 strips beside it, 2 above it, and 6
--: unit squares in the corner. White outlines show the cuts.
pencolor("white")
pensize(2)
speed(10)
tile(0, 0, x, x, "royalblue")                                    -- x^2
for i = 0, 2 do tile(x + i, 0, 1, x, "darkorange") end           -- 3x
for j = 0, 1 do tile(0, x + j, x, 1, "darkorange") end           -- 2x
for i = 0, 2 do for j = 0, 1 do tile(x + i, x + j, 1, 1, "gold") end end   -- 6

--: Label the square and the sides, and print the areas for this x.
pencolor("white")
label(x / 2, x / 2, "x²")
pencolor("dimgray")
label((x + 3) / 2, -0.6, "x + 3")
label(-0.9, (x + 2) / 2, "x + 2")
hideturtle()
print(string.format("with x = %d: (x + 2)(x + 3) = %d = %d + %d + %d",
    x, (x + 2) * (x + 3), x * x, 5 * x, 6))
]],
                },
                {
                    slug = "garden",
                    title = "Word problem: a garden's sides",
                    kind = "turtle",
                    problem = "A rectangular garden is 3 meters longer than it is wide, and its area is 40 square meters. How wide is it?",
                    text = {
                        "Call the width w; then the length is w + 3, and w(w + 3) = 40, or w² + 3w - 40 = 0.",
                        "Look for two numbers with product -40 and sum 3: 8 and -5. So (w + 8)(w - 5) = 0, and w = 5 or w = -8.",
                        "A width can't be negative, so the garden is 5 by 8. The turtle lays it out in square meters: 40 of them.",
                    },
                    code = [[
--: Solve by factoring: w = 5. U makes the garden fit, and `square` draws one
--: square meter.
-- w^2 + 3w - 40 = (w + 8)(w - 5) = 0; a width can't be -8.
local w = 5
local U = math.min(screen_width(), screen_height()) * 0.8 / (w + 4)
local x0, y0 = -(w + 3) * U / 2, -w * U / 2

-- One square meter, at column i and row j.
local function square(i, j, color)
    teleport(x0 + i * U, y0 + j * U)
    setheading(0)
    fillcolor(color)
    begin_fill()
    for k = 1, 4 do forward(U); left(90) end
    end_fill()
end

--: Lay out w rows of w + 3 squares in two greens, counting them, then print
--: the count and the other root's area.
pencolor("white")
speed(0)
local count = 0
for j = 0, w - 1 do
    for i = 0, w + 2 do
        square(i, j, (i + j) % 2 == 0 and "seagreen" or "mediumseagreen")
        count = count + 1
    end
end
hideturtle()
print(string.format("%d by %d: %d square meters", w, w + 3, count))
print(string.format("the other root, w = -8, gives %d too, but no garden", -8 * (-8 + 3)))
]],
                },
            },
        },
        {
            slug = "completing-the-square",
            title = "Completing the Square",
            summary = "Add what is missing to make a perfect square, then take a square root.",
            examples = {
                {
                    slug = "al-khwarizmi",
                    title = "Word problem: a square and ten roots",
                    kind = "turtle",
                    problem = "A square and ten of its sides make 39. What is the side? In symbols: x² + 10x = 39.",
                    text = {
                        "This is al-Khwarizmi's problem from the 9th century, solved with a picture. Draw x² as a square (blue), and split the 10x into two strips, 5 by x each (orange), along two of its sides.",
                        "The shape is almost a square of side x + 5; only the 5 by 5 corner (gold) is missing. Add 25 to both sides to complete it: (x + 5)² = 64.",
                        "So x + 5 = 8, and x = 3. (The equation also allows x + 5 = -8, but no square has a side of -13.)",
                    },
                    code = [[
--: Complete the square in code: (x + 5)² = 64, so x = 3. Then the same `tile`
--: and `label` helpers as on the rectangle page.
local x = math.sqrt(39 + 25) - 5          -- (x + 5)^2 = 39 + 25
local U = math.min(screen_width(), screen_height()) * 0.8 / (x + 6)
local x0, y0 = -(x + 5) * U / 2, -(x + 5) * U / 2

local function tile(col, row, w, h, color)
    teleport(x0 + col * U, y0 + row * U)
    setheading(0)
    fillcolor(color)
    begin_fill()
    for i = 1, 2 do forward(w * U); left(90); forward(h * U); left(90) end
    end_fill()
end

local function label(col, row, text)
    teleport(x0 + col * U, y0 + row * U - 8)
    write(text, false, "center", { "Arial", 16 })
end

--: Lay the square and the two 5x strips, then the gold corner that completes
--: the square, and label each piece.
pencolor("white")
pensize(2)
speed(8)
tile(0, 0, x, x, "royalblue")             -- x^2
tile(x, 0, 5, x, "darkorange")            -- 5x
tile(0, x, x, 5, "darkorange")            -- 5x
tile(x, x, 5, 5, "gold")                  -- the missing corner, 25
pencolor("white")
label(x / 2, x / 2, "x²")
label(x + 2.5, x / 2, "5x")
label(x / 2, x + 2.5, "5x")
pencolor("dimgray")
label(x + 2.5, x + 2.5, "25")
hideturtle()
print(string.format("x^2 + 10x + 25 = 39 + 25 = %d, so x + 5 = %g and x = %g", 39 + 25, x + 5, x))
]],
                },
                {
                    slug = "vertex-form",
                    title = "The square shows the vertex",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 6.3",
                    text = {
                        "Complete the square in x² - 4x - 5: half of -4 is -2, and (-2)² = 4, so x² - 4x - 5 = (x² - 4x + 4) - 9 = (x - 2)² - 9.",
                        "In that form the graph can be read: (x - 2)² is never negative and is 0 at x = 2, so the lowest point, the vertex, is (2, -9).",
                        "The roots follow: (x - 2)² = 9, so x - 2 = 3 or -3, and x = 5 or x = -1. The gray curve is y = x² for comparison: the same shape, moved.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -4 to 7 and y from -10 to 8,
--: stretched to fill the canvas. `axes` rules a grid line every 1 across and 2
--: up.
graph(-4, -10, 7, 8, "stretch")
axes(1, 2)
hideturtle()

--: Plot y = x² in gray and y = x² - 4x - 5 in blue, then mark the vertex and
--: the roots.
plot(function(x) return x * x end, "silver")                       -- y = x^2
plot(function(x) return x * x - 4 * x - 5 end, "royalblue")        -- y = x^2 - 4x - 5
mark(2, -9, "crimson", "vertex (2, -9)")
mark(5, 0, "seagreen", "5")
mark(-1, 0, "seagreen", "-1")

--: Print the completed square and the two roots.
print("x^2 - 4x - 5 = (x^2 - 4x + 4) - 9 = (x - 2)^2 - 9")
print(string.format("(x - 2)^2 = 9, so x = 2 + 3 = %d or x = 2 - 3 = %d", 2 + 3, 2 - 3))
]],
                },
                {
                    slug = "slide-by-a-vector",
                    title = "Completing the square is a slide",
                    kind = "turtle",
                    text = {
                        "(x - 2)² - 9 says: take y = x² and slide every point of it by the same vector, 2 across and 9 down.",
                        "The turtle draws y = x² (gray), then an arrow from each of its points to that point plus (2, -9). Every arrow is the same vector, and the arrows land on y = x² - 4x - 5 (blue).",
                        "Check one point: (1, 1) slides to (3, -8), and 3² - 4 × 3 - 5 = -8.",
                    },
                    code = [[
--: Pixels per unit, and `spot`, which places a point so the picture is
--: centered.
local U = math.min(screen_width(), screen_height()) * 0.8 / 19     -- pixels per unit
local function spot(x, y) return (x - 1) * U, y * U end

--: Faint axes.
-- Faint axes.
speed(0)
pencolor("gainsboro")
teleport(spot(-4, 0)); setpos(spot(6, 0))
teleport(spot(0, -9.5)); setpos(spot(0, 9.5))

--: `curve` draws y = f(x) from a to b in 60 straight pieces. Draw y = x² and
--: y = x² - 4x - 5.
-- Draws the curve through (x, f(x)) for x from a to b.
local function curve(f, a, b, color)
    pencolor(color)
    pensize(3)
    teleport(spot(a, f(a)))
    for i = 1, 60 do
        local x = a + (b - a) * i / 60
        setpos(spot(x, f(x)))
    end
end
curve(function(x) return x * x end, -3, 3, "silver")
curve(function(x) return x * x - 4 * x - 5 end, -1, 5, "royalblue")

--: From each point (x, x²), draw an arrow to (x + 2, x² - 9), and print the
--: check that it lands on the blue curve.
-- Each point (x, x^2) slides by (2, -9).
pencolor("crimson")
pensize(2)
speed(9)
for x = -3, 3 do
    teleport(spot(x, x * x))
    local tx, ty = spot(x + 2, x * x - 9)
    setheading(towards(tx, ty))
    forward(distance(tx, ty))
    left(150); forward(8); back(8); right(300); forward(8); back(8); left(150)
    local X = x + 2
    print(string.format("(%d, %d) slides to (%d, %d); X^2 - 4X - 5 = %d", x, x * x, X, x * x - 9, X * X - 4 * X - 5))
end
hideturtle()
]],
                },
            },
        },
        {
            slug = "quadratic-formula",
            title = "The Quadratic Formula",
            summary = "Completing the square once, for every quadratic, gives x = (-b ± √(b² - 4ac)) / 2a.",
            examples = {
                {
                    slug = "mirror-and-reach",
                    title = "A mirror line and a reach",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 6.3",
                    text = {
                        "x² + x - 1 doesn't factor with whole numbers. Completing the square on ax² + bx + c = 0 in general gives the quadratic formula: x = (-b ± √(b² - 4ac)) / 2a.",
                        "Read it on the graph. -b/2a is the parabola's mirror line (dashed), and the roots sit the same distance either side of it: √(b² - 4ac)/2a, the reach (green arrows).",
                        "For x² + x - 1, the mirror is at -½ and the reach is √5/2, so the roots are (-1 ± √5)/2: about 0.618 and -1.618.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -3 to 2 and y from -2 to 3, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-3, -2, 2, 3)
axes(1, 1)
hideturtle()

--: Plot y = ax² + bx + c for x² + x - 1, and work out the mirror line, -b/2a,
--: and the reach, √(b² - 4ac)/2a.
local a, b, c = 1, 1, -1
plot(function(x) return a * x * x + b * x + c end, "royalblue")

local mirror = -b / (2 * a)
local reach = math.sqrt(b * b - 4 * a * c) / (2 * a)

--: Draw the mirror line dashed: a quarter of a unit on, a quarter off.
-- The mirror line, dashed.
pencolor("gray")
pensize(1)
for y = -2, 2.75, 0.5 do
    teleport(mirror, y)
    setpos(mirror, y + 0.25)
end
--: Draw the reach both ways from the mirror, mark the two roots, and print
--: them.
-- The reach, either way from the mirror.
pencolor("seagreen")
pensize(3)
teleport(mirror, 0); setpos(mirror + reach, 0)
teleport(mirror, 0); setpos(mirror - reach, 0)
mark(mirror + reach, 0, "crimson", string.format("%.3f", mirror + reach))
mark(mirror - reach, 0, "crimson", string.format("%.3f", mirror - reach))
print(string.format("mirror %g, reach %.4f", mirror, reach))
print(string.format("x = (-1 + √5)/2 = %.4f or (-1 - √5)/2 = %.4f", mirror + reach, mirror - reach))
]],
                },
                {
                    slug = "discriminant",
                    title = "Two roots, one, or none",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 6.3",
                    text = {
                        "b² - 4ac, under the square root, is the discriminant. It decides how many real roots there are.",
                        "Raise y = x² - 2x + c by changing c. At c = -3 the discriminant is 16, and the parabola crosses the axis twice. At c = 1 it is 0: the reach is 0, and the parabola just touches the axis. At c = 3 it is -8, which has no real square root, and the parabola misses the axis.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -2 to 4 and y from -5 to 6, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-2, -5, 4, 6)
axes(1, 1)
hideturtle()

--: Here a and b stay the same; only c changes.
local a, b = 1, -2
--: For each c, plot y = x² - 2x + c and work out its discriminant, b² - 4ac.
--: Positive: mark two roots. Zero: one. Negative: none.
for _, p in ipairs({ { -3, "royalblue" }, { 1, "seagreen" }, { 3, "darkorange" } }) do
    local c, color = p[1], p[2]
    plot(function(x) return a * x * x + b * x + c end, color)
    local D = b * b - 4 * a * c
    if D > 0 then
        mark((-b + math.sqrt(D)) / (2 * a), 0, color)
        mark((-b - math.sqrt(D)) / (2 * a), 0, color)
        print(string.format("c = %d: discriminant %d, two roots", c, D))
    elseif D == 0 then
        mark(-b / (2 * a), 0, color)
        print(string.format("c = %d: discriminant %d, one root", c, D))
    else
        print(string.format("c = %d: discriminant %d, no real roots", c, D))
    end
end
]],
                },
                {
                    slug = "ray-meets-circle",
                    title = "Where a walk meets a circle",
                    kind = "turtle",
                    text = {
                        "A turtle at P walking along a unit direction d is at P + t·d after t steps. It is on a circle of radius r around C when that point is r from C. With w = P - C, squaring the distance gives t² + 2(w·d)t + (w·w - r²) = 0, a quadratic in t.",
                        "The discriminant says whether the walk meets the circle at all. Three turtles walk east at different heights: one passes through the circle, entering and leaving at the two roots; one only grazes it, at a double root; and one misses, with a negative discriminant.",
                    },
                    code = [[
--: Whole numbers of pixels for the radius and the starting x, so the grazing
--: case comes out exactly 0.
local r = math.floor(math.min(screen_width(), screen_height()) * 0.3)
local px = -math.floor(screen_width() * 0.45)

--: Draw the circle. Starting at its bottom facing east, `circle(r)` goes
--: around a center r to the turtle's left: the origin.
-- The circle, centered on the origin.
speed(0)
pencolor("gray")
pensize(2)
teleport(0, -r)
setheading(0)
circle(r)

--: For each height, start at the left facing east, and build the quadratic in
--: t from w, the turtle's position, and d, its heading. Then act on the
--: discriminant: walk to where the walk enters, then to where it leaves, then
--: on; or to where it touches, and on; or straight past.
for _, height in ipairs({ math.floor(r / 2), r, r + math.floor(r / 3) }) do
    teleport(px, height)
    setheading(0)
    -- The quadratic in t: w = P - C, d = the heading as a unit vector.
    local dx, dy = math.cos(math.rad(heading())), math.sin(math.rad(heading()))
    local wx, wy = xcor(), ycor()
    local B = 2 * (wx * dx + wy * dy)
    local C = wx * wx + wy * wy - r * r
    local D = B * B - 4 * C
    speed(5)
    pensize(3)
    if D > 0 then
        local t1, t2 = (-B - math.sqrt(D)) / 2, (-B + math.sqrt(D)) / 2
        pencolor("royalblue"); forward(t1); dot(12, "crimson")
        pencolor("darkorange"); forward(t2 - t1); dot(12, "crimson")
        pencolor("royalblue"); forward(-2 * px - t2)
        print(string.format("height %d: discriminant %g > 0, in at t = %.1f and out at t = %.1f", height, D, t1, t2))
    elseif D == 0 then
        pencolor("royalblue"); forward(-B / 2); dot(12, "crimson")
        pencolor("royalblue"); forward(-px)
        print(string.format("height %d: discriminant 0, touches at t = %g", height, -B / 2))
    else
        pencolor("silver"); forward(-2 * px)
        print(string.format("height %d: discriminant %g < 0, misses", height, D))
    end
end
hideturtle()
]],
                },
                {
                    slug = "two-ships",
                    title = "Word problem: two ships",
                    kind = "turtle",
                    problem = "Ship A sails east at 8 km an hour. Ship B starts 20 km north of it and sails south at 6 km an hour. When are they 17 km apart? When are they 15 km apart?",
                    text = {
                        "After t hours, A is at (8t, 0) and B at (0, 20 - 6t). The vector from A to B is (-8t, 20 - 6t), and its length squared is 64t² + (20 - 6t)² = 100t² - 240t + 400.",
                        "For 17 km: 100t² - 240t + 400 = 289, or 100t² - 240t + 111 = 0. The discriminant is 13200, so there are two times, about 0.63 and 1.77 hours (red): once closing in, once drawing apart.",
                        "For 15 km the discriminant is -32400: never. The closest they come is at the mirror line, t = 240/200 = 1.2 hours, 16 km apart (green).",
                    },
                    code = [[
--: Pixels per km, `spot`, and where the two ships are at time t.
local U = math.min(screen_width(), screen_height()) * 0.8 / 24     -- pixels per km
local function spot(x, y) return (x - 9) * U, (y - 10) * U end
local function ships(t) return 8 * t, 0, 0, 20 - 6 * t end

--: Two turtles sail in tenths of an hour, drawing their tracks.
-- Two turtles sail for 2.4 hours.
hideturtle()
local a, b = Turtle(), Turtle()
a:color("royalblue"); b:color("darkorange")
a:pensize(2); b:pensize(2)
a:teleport(spot(0, 0)); b:teleport(spot(0, 20))
a:speed(0); b:speed(0)
for step = 1, 24 do
    local ax, ay, bx, by = ships(step / 10)
    a:setpos(spot(ax, ay))
    b:setpos(spot(bx, by))
end

--: Label where the ships start. `join` draws the segment between the ships at
--: time t.
pencolor("dimgray")
teleport(spot(-0.6, -0.5)); write("A", false, "right", { "Arial", 12 })
teleport(spot(-0.6, 19.5)); write("B", false, "right", { "Arial", 12 })

-- Joins the ships at time t.
local function join(t, color)
    local ax, ay, bx, by = ships(t)
    pencolor(color)
    teleport(spot(ax, ay))
    setpos(spot(bx, by))
end

--: For 17 km and 15 km, solve the quadratic and join the ships at each root,
--: or print that it never happens. Then join them at their closest, on the
--: mirror line.
pensize(2)
for _, d in ipairs({ 17, 15 }) do
    local A, B, C = 100, -240, 400 - d * d
    local D = B * B - 4 * A * C
    if D >= 0 then
        local t1, t2 = (-B - math.sqrt(D)) / (2 * A), (-B + math.sqrt(D)) / (2 * A)
        join(t1, "crimson")
        join(t2, "crimson")
        print(string.format("%d km apart at t = %.2f and t = %.2f hours", d, t1, t2))
    else
        print(string.format("%d km: discriminant %g, never", d, D))
    end
end
local t = 240 / 200
join(t, "seagreen")
print(string.format("closest at t = %g hours: %g km", t, math.sqrt(100 * t * t - 240 * t + 400)))
]],
                },
            },
        },
        {
            slug = "extraneous-roots",
            title = "Squaring Adds Answers",
            summary = "Squaring both sides can bring in answers that don't solve the original equation, so check every one.",
            examples = {
                {
                    slug = "square-root-and-line",
                    title = "A square root meets a line",
                    kind = "plane",
                    text = {
                        "Solve √(x + 2) = x. Squaring both sides gives x² = x + 2, so x² - x - 2 = (x - 2)(x + 1) = 0: x = 2 or x = -1.",
                        "Check both. √4 = 2, so x = 2 works. But √1 = 1, not -1, so x = -1 doesn't.",
                        "The graph shows why: squaring also solves -√(x + 2) = x, the mirror image of the square root (pale red), since both square to the same thing. x = -1 is where the line meets that mirror. An answer like that is called extraneous.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -3 to 4 and y from -3 to 3, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-3, -3, 4, 3)
axes(1, 1)
hideturtle()

--: Plot the square root, its mirror (what squaring also allows), and y = x.
plot(function(x) return math.sqrt(x + 2) end, "seagreen")         -- y = √(x + 2)
plot(function(x) return -math.sqrt(x + 2) end, "lightcoral")      -- its mirror
plot(function(x) return x end, "royalblue")                        -- y = x

--: Check both answers of the squared equation in the original, and mark which
--: one works.
-- Squaring gave x = 2 or x = -1; check each in the original equation.
for _, x in ipairs({ 2, -1 }) do
    local works = math.sqrt(x + 2) == x
    mark(x, x, works and "crimson" or "gray", works and "x = 2 works" or "x = -1 doesn't")
    print(string.format("x = %d: √(x + 2) = %g, %s x", x, math.sqrt(x + 2), works and "equal to" or "not equal to"))
end
]],
                },
                {
                    slug = "two-roots-checked",
                    title = "Two square roots",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 6-9",
                    text = {
                        "Solve √(x + 3) + 4 = √(8x + 1). Square both sides, isolate the square root left over, and square again: 49x² - 316x + 132 = 0, which is (x - 6)(49x - 22) = 0.",
                        "So the candidates are 6 and 22/49. At 6, both sides are 7. At 22/49, the left side is 41/7 but the right is 15/7.",
                        "22/49 solves the mirror equation, -√(x + 3) + 4 = √(8x + 1) (pale blue), which the squaring can't tell apart. Only x = 6 is a solution.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -1 to 9 and y from 0 to 10, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-1, 0, 9, 10)
axes(1, 1)
hideturtle()

--: Plot the left side, its mirror, and the right side.
plot(function(x) return math.sqrt(x + 3) + 4 end, "royalblue")         -- left side
plot(function(x) return -math.sqrt(x + 3) + 4 end, "lightsteelblue")   -- its mirror
plot(function(x) return math.sqrt(8 * x + 1) end, "darkorange")        -- right side

--: Check each candidate in the original equation, allowing for rounding, then
--: mark it and print the result.
-- The candidates from 49x^2 - 316x + 132 = (x - 6)(49x - 22) = 0.
for _, x in ipairs({ 6, 22 / 49 }) do
    local lhs, rhs = math.sqrt(x + 3) + 4, math.sqrt(8 * x + 1)
    local works = math.abs(lhs - rhs) < 1e-9
    mark(x, rhs, works and "crimson" or "gray", works and "x = 6" or "x = 22/49")
    print(string.format("x = %.4f: left %.4f, right %.4f, %s", x, lhs, rhs, works and "a solution" or "extraneous"))
end
]],
                },
                {
                    slug = "both-halves",
                    title = "Squaring forgets the sign",
                    kind = "turtle",
                    text = {
                        "x² = x + 2, the squared equation, asks for points whose y squared is x + 2: x = y² - 2. The turtle walks every such point, from the top down, as y goes from 2.4 to -2.4.",
                        "The top half (green) is where y = +√(x + 2), the equation we meant. The bottom half (red) is where y = -√(x + 2). Squaring keeps both, because a number and its negative have the same square.",
                        "The line y = x meets the walk twice: on the green half at (2, 2), the real answer, and on the red half at (-1, -1), the extraneous one.",
                    },
                    code = [[
--: Pixels per unit, and faint axes.
local U = math.min(screen_width(), screen_height()) * 0.8 / 7     -- pixels per unit

-- Faint axes.
speed(0)
pencolor("gainsboro")
teleport(-3 * U, 0); setpos(3.5 * U, 0)
teleport(0, -3 * U); setpos(0, 3 * U)

--: Walk the points (y² - 2, y) from the top down: green while y ≥ 0, red
--: below.
-- Walk x = y^2 - 2 as y goes from 2.4 down to -2.4.
pensize(3)
speed(0)
teleport((2.4 * 2.4 - 2) * U, 2.4 * U)
for i = 1, 96 do
    local y = 2.4 - i * 0.05
    pencolor(y >= 0 and "seagreen" or "lightcoral")
    setpos((y * y - 2) * U, y * U)
end

--: Draw y = x, and mark where it meets each half.
-- The line y = x, and where it meets the walk.
pencolor("royalblue")
teleport(-3 * U, -3 * U)
setpos(3 * U, 3 * U)
teleport(2 * U, 2 * U)
dot(12, "crimson")
teleport(-1 * U, -1 * U)
dot(12, "gray")
hideturtle()
print("(2, 2): on the top half, y = +√(x + 2): a solution")
print("(-1, -1): on the bottom half, y = -√(x + 2): extraneous")
]],
                },
            },
        },
        {
            slug = "hidden-quadratics",
            title = "Hidden Quadratics",
            summary = "When an equation holds some expression and its square, rename the expression and solve a quadratic.",
            examples = {
                {
                    slug = "quartic",
                    title = "x⁴ is (x²)²",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 6-13",
                    text = {
                        "x⁴ + 3x² - 4 = 0 is a quadratic in disguise: with z = x², it is z² + 3z - 4 = 0, which factors as (z + 4)(z - 1) = 0.",
                        "So z = 1 or z = -4. Carry each back to x: x² = 1 gives x = ±1, and x² = -4 has no real solution.",
                        "The orange curve is the quadratic in z, and the blue curve the original in x. The z-root at 1 becomes the two x-roots at ±1.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -5 to 3 and y from -7 to 7, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up, and
--: names the axes "x  (and z)" and "y".
graph(-5, -7, 3, 7)
axes(1, 1, "x  (and z)", "y")
hideturtle()

--: Plot the quadratic in z (orange) and the quartic in x (blue) on the same
--: axis, and mark their roots.
plot(function(z) return z * z + 3 * z - 4 end, "darkorange")            -- in z = x^2
plot(function(x) return x ^ 4 + 3 * x ^ 2 - 4 end, "royalblue")         -- in x
mark(-4, 0, "darkorange", "z = -4")
mark(1, 0, "darkorange", "z = 1")
mark(-1, 0, "crimson", "x = ±1")
mark(1, 0, "crimson")

--: Print the steps: solve for z, then carry each z back to x.
print("z^2 + 3z - 4 = (z + 4)(z - 1): z = 1 or z = -4")
print("x^2 = 1: x = 1 or x = -1;  x^2 = -4: no real x")
]],
                },
                {
                    slug = "powers-of-two",
                    title = "Powers of two",
                    kind = "plane",
                    source = "AoPS Vol. 1, Example 6-12",
                    text = {
                        "Find n with 1 + 2ⁿ + 4ⁿ = 73. Since 4ⁿ = (2ⁿ)², rename x = 2ⁿ: 1 + x + x² = 73, or x² + x - 72 = (x + 9)(x - 8) = 0.",
                        "x = 2ⁿ is never negative, so x = 8, and n = 3.",
                        "The graph of 1 + 2ⁿ + 4ⁿ against n climbs steeply, and crosses the height 73 exactly once, at n = 3.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -1 to 4 and y from 0 to 100,
--: stretched to fill the canvas. `axes` rules a grid line every 0.5 across and
--: 10 up, and names the axes "n" and "1 + 2^n + 4^n".
graph(-1, 0, 4, 100, "stretch")
axes(0.5, 10, "n", "1 + 2^n + 4^n")
hideturtle()

--: Plot 1 + 2ⁿ + 4ⁿ, a gray line at 73, and mark n = 3. In Lua, `^` raises to
--: a power.
plot(function(n) return 1 + 2 ^ n + 4 ^ n end, "royalblue")
pencolor("gray")
pensize(1)
teleport(-1, 73)
setpos(4, 73)
mark(3, 73, "crimson", "n = 3")

--: Check n = 3.
-- x = 2^n: x^2 + x - 72 = (x + 9)(x - 8), and 2^n can't be -9.
print(string.format("2^3 = %d, and 1 + 8 + 64 = %d", 2 ^ 3, 1 + 8 + 64))
]],
                },
                {
                    slug = "perimeter-and-area",
                    title = "Word problem: a rectangle's sides",
                    kind = "turtle",
                    problem = "A rectangle has perimeter 20 and area 21. How long are its sides?",
                    source = "AoPS Vol. 1, Examples 6-10 and 6-11",
                    text = {
                        "Its sides add to 10 and multiply to 21. Two numbers with sum s and product p are the roots of z² - sz + p = 0, because (z - u)(z - v) = z² - (u + v)z + uv.",
                        "So the sides are the roots of z² - 10z + 21 = (z - 3)(z - 7): 3 and 7.",
                        "The turtle draws every rectangle with whole sides and perimeter 20 from one corner. Only 3 by 7 (and 7 by 3, the same rectangle turned) has area 21.",
                    },
                    code = [[
--: Pixels per unit, and `rectangle`, which draws a w by h rectangle from the
--: shared corner.
local U = math.min(screen_width(), screen_height()) * 0.8 / 11    -- pixels per unit
local corner = -5 * U

-- A rectangle w wide and h tall, from the shared corner.
local function rectangle(w, h, color, size)
    pencolor(color)
    pensize(size)
    teleport(corner, corner)
    setheading(0)
    for i = 1, 2 do forward(w * U); left(90); forward(h * U); left(90) end
end

--: Draw every whole-number width with perimeter 20, its height 10 - w, and
--: highlight the one with area 21.
speed(10)
for w = 1, 9 do
    local h = 10 - w
    local hit = w * h == 21
    rectangle(w, h, hit and "crimson" or "silver", hit and 3 or 1)
    print(string.format("%d by %d: area %d%s", w, h, w * h, hit and "  <- 21" or ""))
end
hideturtle()
]],
                },
                {
                    slug = "pentagram",
                    title = "The golden ratio in a star",
                    kind = "turtle",
                    text = {
                        "Draw a regular pentagon (blue) and its diagonals, which make a star (orange). How many times longer than a side is a diagonal?",
                        "Similar triangles in the star show that the ratio φ satisfies φ = 1 + 1/φ, a hidden quadratic: φ² - φ - 1 = 0. Its positive root is (1 + √5)/2 ≈ 1.618.",
                        "The turtle measures it with `distance()`. (The book's x² + x - 1 = 0 is a cousin: its positive root, 0.618, is 1/φ.)",
                    },
                    code = [[
--: The side's length, and a start that centers the pentagon.
local s = math.min(screen_width(), screen_height()) * 0.38    -- the side
teleport(-s / 2, -s * 0.69)
setheading(0)

--: Draw the pentagon: a side forward, a 72° turn, five times, saving each
--: corner's position.
-- The pentagon, remembering its corners.
local corners = {}
pencolor("royalblue")
pensize(3)
speed(5)
for i = 1, 5 do
    corners[i] = { xcor(), ycor() }
    forward(s)
    left(72)
end

--: Join every second corner to draw the star.
-- The star: every second corner.
pencolor("darkorange")
for _, i in ipairs({ 3, 5, 2, 4, 1 }) do setpos(corners[i][1], corners[i][2]) end

--: Measure a diagonal with `distance`, from corner 1, and print the ratio
--: beside (1 + √5)/2.
-- Measure a diagonal from corner 1, where the turtle is now.
local d = distance(corners[3][1], corners[3][2])
local phi = d / s
hideturtle()
print(string.format("diagonal / side = %.4f", phi))
print(string.format("(1 + √5) / 2  = %.4f", (1 + math.sqrt(5)) / 2))
print(string.format("phi^2 - phi - 1 = %.4f", phi * phi - phi - 1))
]],
                },
            },
        },
        {
            slug = "polynomial-roots",
            title = "Beyond Quadratics",
            summary = "Higher-degree polynomials also come from their roots, and also lose real roots when lifted off the axis.",
            examples = {
                {
                    slug = "four-roots",
                    title = "Four roots, then fewer",
                    kind = "plane",
                    source = "AoPS Vol. 1, Section 6.2",
                    text = {
                        "Multiply four factors, (x + 2)(x + 1)(x - 1)(x - 3), and divide by 4 to keep it on the page. The product is zero exactly at the four roots, -2, -1, 1 and 3 (blue).",
                        "Add 1 and the curve rises off the axis by 1 (green): its shallow dip no longer reaches the axis, and two real roots are lost. Add 4 (orange) and it loses all four.",
                        "Roots come and go in pairs as a curve is lifted, which is how a quadratic goes from two roots to none.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from -3 to 4 and y from -4 to 8, a unit
--: as long up as across. `axes` rules a grid line every 1 across and 1 up.
graph(-3, -4, 4, 8)
axes(1, 1)
hideturtle()

--: `p(x)` multiplies the four factors, divided by 4.
local function p(x) return (x + 2) * (x + 1) * (x - 1) * (x - 3) / 4 end

--: For each lift, plot p(x) + c, and count where it changes sign: each change
--: is a real root.
for _, lift in ipairs({ { 0, "royalblue" }, { 1, "seagreen" }, { 4, "darkorange" } }) do
    local c, color = lift[1], lift[2]
    plot(function(x) return p(x) + c end, color)
    -- Count the real roots: the places the curve changes sign.
    local roots = 0
    for i = 0, 1999 do
        local x0, x1 = -3 + 7 * i / 2000, -3 + 7 * (i + 1) / 2000
        if (p(x0) + c < 0) ~= (p(x1) + c < 0) then roots = roots + 1 end
    end
    print(string.format("lifted by %d: %d real roots", c, roots))
end
--: Mark the four roots of the curve before it is lifted.
for _, r in ipairs({ -2, -1, 1, 3 }) do mark(r, 0, "crimson") end
]],
                },
                {
                    slug = "box-volume",
                    title = "Word problem: an open box",
                    kind = "plane",
                    problem = "Cut an x by x square from each corner of a 10 by 10 sheet, and fold up the sides into an open box. For which x is its volume 64?",
                    text = {
                        "The box's base is 10 - 2x on each side and its height is x, so its volume is x(10 - 2x)². Setting that to 64 gives a cubic: 4x³ - 40x² + 100x - 64 = 0.",
                        "Trying small numbers, x = 1 works, so x - 1 is a factor: 4(x - 1)(x² - 9x + 16) = 0. The quadratic formula gives the rest, x = (9 ± √17)/2.",
                        "That is about 2.44 or 6.56, but a cut of 6.56 is more than half the sheet. So there are two boxes: x = 1 and x ≈ 2.44.",
                    },
                    code = [[
--: `graph` sets up graph paper with x from 0 to 5 and y from 0 to 80, stretched
--: to fill the canvas. `axes` rules a grid line every 0.5 across and 10 up, and
--: names the axes "corner cut x" and "volume".
graph(0, 0, 5, 80, "stretch")
axes(0.5, 10, "corner cut x", "volume")
hideturtle()

--: Plot the volume, x(10 - 2x)², and a gray line at 64.
plot(function(x) return x * (10 - 2 * x) ^ 2 end, "royalblue")
pencolor("gray")
pensize(1)
teleport(0, 64)
setpos(5, 64)

--: Mark each root that fits on the sheet, and explain the one that doesn't.
-- 4(x - 1)(x^2 - 9x + 16) = 0.
for _, x in ipairs({ 1, (9 - math.sqrt(17)) / 2, (9 + math.sqrt(17)) / 2 }) do
    if x < 5 then
        mark(x, 64, "crimson", string.format("x = %.2f", x))
        print(string.format("x = %.2f: volume %.2f", x, x * (10 - 2 * x) ^ 2))
    else
        print(string.format("x = %.2f: more than half the sheet, no box", x))
    end
end
]],
                },
                {
                    slug = "box-nets",
                    title = "The two boxes, unfolded",
                    kind = "turtle",
                    problem = "The same sheet, cut for both answers: x = 1 and x = (9 - √17)/2.",
                    text = {
                        "The turtle draws each sheet with its corners cut away (blue), and the fold lines that make the base (dashed). Both fold up into boxes of volume 64.",
                        "One is a wide, shallow tray, 8 by 8 by 1; the other is a smaller, deeper box, about 5.1 by 5.1 by 2.44.",
                    },
                    code = [[
--: Pixels per unit, so that two sheets fit side by side.
local U = math.min(screen_width() * 0.85 / 21, screen_height() * 0.8 / 10)  -- pixels per unit

--: `net` fills the sheet's outline with the corners cut away, going round its
--: twelve corners with `to`. Then it dashes the four fold lines around the
--: base, labels the sheet, and prints the box's size.
-- The sheet with x by x corners cut away, its corner at (ox, oy) pixels.
local function net(x, ox)
    local oy = -5 * U
    local function to(a, b) setpos(ox + a * U, oy + b * U) end
    pencolor("steelblue")
    fillcolor("lightsteelblue")
    pensize(2)
    teleport(ox + x * U, oy)
    begin_fill()
    to(10 - x, 0); to(10 - x, x); to(10, x); to(10, 10 - x); to(10 - x, 10 - x)
    to(10 - x, 10); to(x, 10); to(x, 10 - x); to(0, 10 - x); to(0, x); to(x, x); to(x, 0)
    end_fill()
    -- The fold lines, dashed.
    pencolor("dimgray")
    pensize(1)
    local corners = { { x, x }, { 10 - x, x }, { 10 - x, 10 - x }, { x, 10 - x }, { x, x } }
    for k = 1, 4 do
        local a, b = corners[k], corners[k + 1]
        for i = 0, 9 do
            teleport(ox + (a[1] + (b[1] - a[1]) * i / 10) * U, oy + (a[2] + (b[2] - a[2]) * i / 10) * U)
            to(a[1] + (b[1] - a[1]) * (i + 0.5) / 10, a[2] + (b[2] - a[2]) * (i + 0.5) / 10)
        end
    end
    teleport(ox + 5 * U, oy - 24)
    write(string.format("x = %.2f", x), false, "center", { "Arial", 12 })
    print(string.format("x = %.2f: base %.2f by %.2f, height %.2f, volume %.2f",
        x, 10 - 2 * x, 10 - 2 * x, x, x * (10 - 2 * x) ^ 2))
end

--: Draw a net for each answer.
speed(6)
net(1, -10.5 * U)
net((9 - math.sqrt(17)) / 2, 0.5 * U)
hideturtle()
]],
                },
            },
        },
    },
}

-- Splits a program into its steps at its `--:` lines (see the top of this
-- file), and returns the steps and the program without those lines.
local function tutorial(source)
    local steps, lines = {}, {}
    local step, paragraph
    for line in (source .. "\n"):gmatch("(.-)\n") do
        local fold, text = line:match("^%-%-:(:?)%s?(.*)$")
        if fold then
            if not step or #step.lines > 0 then
                step = { text = {}, lines = {}, fold = fold == ":", first = #lines + 1 }
                steps[#steps + 1] = step
                paragraph = nil
            end
            if text == "" then
                paragraph = nil
            elseif paragraph then
                step.text[#step.text] = step.text[#step.text] .. " " .. text
            else
                step.text[#step.text + 1] = text
                paragraph = true
            end
        else
            assert(step, "a program must start with a --: line, not: " .. line)
            lines[#lines + 1] = line
            step.lines[#step.lines + 1] = line
        end
    end
    for _, s in ipairs(steps) do
        -- The chunk without its blank lines at either end.
        local a, b = 1, #s.lines
        while a <= b and not s.lines[a]:match("%S") do a = a + 1 end
        while b >= a and not s.lines[b]:match("%S") do b = b - 1 end
        s.code = table.concat(s.lines, "\n", a, b)
        s.first = s.first + a - 1
        s.lines = nil
    end
    return steps, table.concat(lines, "\n")
end

local chapters = { linear, quadratic }
for _, chapter in ipairs(chapters) do
    for _, lesson in ipairs(chapter.lessons) do
        for _, example in ipairs(lesson.examples) do
            example.steps, example.code = tutorial(example.code)
        end
    end
end
return chapters
