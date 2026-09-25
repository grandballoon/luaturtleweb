-- turtle/demos.lua
--
-- A short demo program for every entry in the command reference (the list
-- in index.html), keyed by the entry's call exactly as the list shows it.
-- The reference shows the selected entry's demo beside a miniature canvas
-- playing it (see command-preview.js).
--
-- A good demo is a few lines that make the command's effect visible: draw
-- something before and after it, or print() what a query returns (the
-- preview shows printed output under its canvas). Keep the drawing within
-- about 200 pixels of the start; the preview scales larger drawings down.
--
-- Pure data: edit freely. test/demos_test.lua checks that every entry has a
-- demo, that every demo belongs to an entry, and that every demo runs.

return {
    -- Movement
    ["forward(n)"]        = "forward(100)",
    ["back(n)"]           = "back(100)",
    ["left(degrees)"]     = "forward(80)\nleft(90)\nforward(80)",
    ["right(degrees)"]    = "forward(80)\nright(90)\nforward(80)",
    ["setpos(x, y)"]      = "setpos(80, 60)\nsetpos(80, -40)",
    ["setheading(angle)"] = "setheading(90)\nforward(60)\nsetheading(0)\nforward(60)",
    ["home()"]            = "forward(80)\nleft(90)\nforward(60)\nhome()",
    ["setx(x)"]           = "left(90)\nforward(60)\nsetx(100)",
    ["sety(y)"]           = "forward(80)\nsety(60)",
    ["teleport(x, y)"]    = "forward(80)\nteleport(0, 50)\nforward(80)",

    -- Pen
    ["penup()"]           = "forward(40)\npenup()\nforward(40)\npendown()\nforward(40)",
    ["pendown()"]         = "penup()\nforward(40)\npendown()\nforward(80)",
    ["pensize(n)"]        = "pensize(1)\nforward(60)\npensize(8)\nforward(60)",
    ["pencolor(r, g, b)"] = "pencolor(1, 0.5, 0)\nforward(60)\npencolor(0, 128, 255)\nforward(60)",
    ['pencolor("name")']  = 'pencolor("red")\nforward(60)\nleft(90)\npencolor("blue")\nforward(60)',
    ['color("red")']      = 'color("red")\nbegin_fill()\ncircle(40)\nend_fill()',
    ['color("red", "blue")'] = 'pensize(4)\ncolor("red", "gold")\nbegin_fill()\ncircle(40)\nend_fill()',

    -- Shapes
    ["circle(radius)"]         = "circle(50)",
    ["circle(radius, extent)"] = "circle(50, 180)",

    -- Fill
    ["begin_fill()"]       = 'fillcolor("gold")\nbegin_fill()\nfor i = 1, 3 do\n    forward(80)\n    left(120)\nend\nend_fill()',
    ["end_fill()"]         = 'fillcolor("skyblue")\nbegin_fill()\nfor i = 1, 4 do\n    forward(60)\n    left(90)\nend\nend_fill()',
    ["filling()"]          = 'begin_fill()\nprint(filling())\ncircle(40)\nend_fill()\nprint(filling())',
    ["fillcolor(r, g, b)"] = "fillcolor(0, 0.6, 1)\nbegin_fill()\ncircle(40)\nend_fill()",
    ["dot(size)"]          = "dot(30)\nforward(60)\ndot(15)",
    ['dot(size, "red")']   = 'dot(30, "red")\nforward(60)\ndot(20, "gold")',

    -- Text
    ["write(text)"]        = 'forward(40)\nwrite("Hello!")',
    ["write(text, move, align, font)"] = 'write("Hello", false, "center", {"Arial", 28})',

    -- Canvas
    ["bgcolor(r, g, b)"]   = 'bgcolor(0.1, 0.1, 0.2)\npencolor("white")\ncircle(40)',
    ['bgcolor("name")']    = 'bgcolor("navy")\npencolor("gold")\ncircle(40)',
    ["screen_width()"]     = "print(screen_width())",
    ["screen_height()"]    = "print(screen_height())",
    ["clear()"]            = "circle(40)\nclear()\nforward(60)",
    ["reset()"]            = "forward(80)\nleft(90)\nforward(60)\nreset()",
    ["undo()"]             = "forward(80)\nleft(90)\nforward(60)\nundo()\nundo()",
    ["setundobuffer(n)"]   = "setundobuffer(1)\nforward(80)\nleft(90)\nforward(60)\nundo()\nundo()",
    ["speed(n)"]           = "speed(1)\nforward(40)\nspeed(10)\nforward(60)\nspeed(0)\ncircle(30)",

    -- Turtle
    ["hideturtle()"]       = "circle(40)\nhideturtle()",
    ["showturtle()"]       = "hideturtle()\ncircle(40)\nshowturtle()",
    ["stamp()"]            = "for i = 1, 3 do\n    stamp()\n    forward(40)\nend",
    ["clearstamp(id)"]     = "local id = stamp()\nforward(40)\nstamp()\nforward(40)\nclearstamp(id)",
    ["clearstamps(n)"]     = "for i = 1, 4 do\n    stamp()\n    forward(30)\nend\nclearstamps(2)",
    ["Turtle()"]           = 'local t = Turtle()\nt:pencolor("red")\nt:left(90)\nt:forward(60)\nforward(60)',

    -- State queries
    ["position()"]         = "forward(50)\nprint(position())",
    ["xcor() / ycor()"]    = "setpos(40, 30)\nprint(xcor(), ycor())",
    ["heading()"]          = "left(45)\nforward(40)\nprint(heading())",
    ["isdown()"]           = "print(isdown())\npenup()\nprint(isdown())",
    ["isvisible()"]        = "print(isvisible())\nhideturtle()\nprint(isvisible())",
    ["distance(x, y)"]     = "forward(60)\nprint(distance(0, 0))",
    ["towards(x, y)"]      = "local angle = towards(60, 60)\nprint(angle)\nsetheading(angle)\nforward(80)",
}
