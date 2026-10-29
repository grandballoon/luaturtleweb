-- turtle/catalog.lua
--
-- The commands the command reference lists, grouped into its sections, as
-- data: the controller menu, the mapping view and (later) the desktop's
-- reference read them from here. The web's reference is still written out
-- in index.html; test/catalog_test.lua fails if the two disagree, so edit
-- both together.
--
-- Pure data: { { title, commands = { { call, about, insert, params }, ... } }, ... },
-- in the reference's order. call and about are the reference's; insert is
-- what the desktop puts in the program when the command is picked from a
-- menu: a call that runs as it is, with values in place of the parameter
-- names, since a learner holding a controller can change a value (the
-- stick nudges numbers and steps through colors) but cannot type one.
-- params names each argument of call and says what it takes, { name, kind }
-- with kind "number", "color" (a color name), "string", "boolean" or "any",
-- so the desktop's blocks can label a call's values and offer colors.

return {
    {
        title = "Movement",
        commands = {
            { call = "forward(n)", about = "Move forward n pixels. Alias: fd",
              insert = "forward(100)", params = { { "n", "number" } } },
            { call = "back(n)", about = "Move backward n pixels. Alias: bk",
              insert = "back(100)", params = { { "n", "number" } } },
            { call = "left(degrees)", about = "Turn left. Alias: lt",
              insert = "left(90)", params = { { "degrees", "number" } } },
            { call = "right(degrees)", about = "Turn right. Alias: rt",
              insert = "right(90)", params = { { "degrees", "number" } } },
            { call = "setpos(x, y)", about = "Move to coordinates (x, y)",
              insert = "setpos(100, 50)", params = { { "x", "number" }, { "y", "number" } } },
            { call = "setheading(angle)", about = "Face a direction (0=east, 90=north). Alias: seth",
              insert = "setheading(90)", params = { { "angle", "number" } } },
            { call = "home()", about = "Return to center, face east",
              insert = "home()", params = {} },
            { call = "setx(x)", about = "Set x coordinate, keep y",
              insert = "setx(100)", params = { { "x", "number" } } },
            { call = "sety(y)", about = "Set y coordinate, keep x",
              insert = "sety(100)", params = { { "y", "number" } } },
            { call = "teleport(x, y)", about = "Jump to position instantly, no drawing",
              insert = "teleport(100, 50)", params = { { "x", "number" }, { "y", "number" } } },
        },
    },
    {
        title = "Pen",
        commands = {
            { call = "penup()", about = "Stop drawing. Alias: pu",
              insert = "penup()", params = {} },
            { call = "pendown()", about = "Start drawing. Alias: pd",
              insert = "pendown()", params = {} },
            { call = "pensize(n)", about = "Set line width",
              insert = "pensize(3)", params = { { "n", "number" } } },
            { call = "pencolor(r, g, b)", about = "Set color with RGB (0–1 or 0–255)",
              insert = "pencolor(1, 0.5, 0)", params = { { "r", "number" }, { "g", "number" }, { "b", "number" } } },
            { call = "pencolor(\"name\")", about = "Set color by name: \"red\", \"blue\", \"gold\", etc.",
              insert = "pencolor(\"red\")", params = { { "name", "color" } } },
            { call = "color(\"red\")", about = "Set both pen and fill color",
              insert = "color(\"red\")", params = { { "color", "color" } } },
            { call = "color(\"red\", \"blue\")", about = "Set pen and fill color independently",
              insert = "color(\"red\", \"blue\")", params = { { "pen", "color" }, { "fill", "color" } } },
        },
    },
    {
        title = "Shapes",
        commands = {
            { call = "circle(radius)", about = "Draw a full circle",
              insert = "circle(50)", params = { { "radius", "number" } } },
            { call = "circle(radius, extent)", about = "Arc: extent in degrees",
              insert = "circle(50, 180)", params = { { "radius", "number" }, { "extent", "number" } } },
        },
    },
    {
        title = "Fill",
        commands = {
            { call = "begin_fill()", about = "Start recording a filled shape",
              insert = "begin_fill()", params = {} },
            { call = "end_fill()", about = "Fill the shape drawn since begin_fill",
              insert = "end_fill()", params = {} },
            { call = "filling()", about = "Returns true if currently filling",
              insert = "print(filling())", params = {} },
            { call = "fillcolor(r, g, b)", about = "Set fill color",
              insert = "fillcolor(0, 0.6, 1)", params = { { "r", "number" }, { "g", "number" }, { "b", "number" } } },
            { call = "dot(size)", about = "Draw a filled circle at turtle's position",
              insert = "dot(20)", params = { { "size", "number" } } },
            { call = "dot(size, \"red\")", about = "Draw a dot with a specific color",
              insert = "dot(20, \"red\")", params = { { "size", "number" }, { "color", "color" } } },
        },
    },
    {
        title = "Text",
        commands = {
            { call = "write(text)", about = "Write text at turtle's position",
              insert = "write(\"Hello!\")", params = { { "text", "string" } } },
            { call = "write(text, move, align, font)", about = "align: \"left\", \"center\", \"right\"; font: {family, size}",
              insert = "write(\"Hello\", false, \"center\", {\"Arial\", 28})", params = { { "text", "string" }, { "move", "boolean" }, { "align", "string" }, { "font", "any" } } },
        },
    },
    {
        title = "Canvas",
        commands = {
            { call = "bgcolor(r, g, b)", about = "Set background color",
              insert = "bgcolor(0.1, 0.1, 0.2)", params = { { "r", "number" }, { "g", "number" }, { "b", "number" } } },
            { call = "bgcolor(\"name\")", about = "Set background color by name",
              insert = "bgcolor(\"navy\")", params = { { "name", "color" } } },
            { call = "screen_width()", about = "Returns canvas width in pixels",
              insert = "print(screen_width())", params = {} },
            { call = "screen_height()", about = "Returns canvas height in pixels",
              insert = "print(screen_height())", params = {} },
            { call = "clear()", about = "Erase drawing, keep turtle position",
              insert = "clear()", params = {} },
            { call = "reset()", about = "Erase drawing and reset turtle to start",
              insert = "reset()", params = {} },
            { call = "undo()", about = "Undo the last command",
              insert = "undo()", params = {} },
            { call = "setundobuffer(n)", about = "Set max undo history length",
              insert = "setundobuffer(10)", params = { { "n", "number" } } },
            { call = "speed(n)", about = "0=instant, 1=slowest, 10=fastest",
              insert = "speed(5)", params = { { "n", "number" } } },
        },
    },
    {
        title = "Turtle",
        commands = {
            { call = "hideturtle()", about = "Hide the turtle. Alias: ht",
              insert = "hideturtle()", params = {} },
            { call = "showturtle()", about = "Show the turtle. Alias: st",
              insert = "showturtle()", params = {} },
            { call = "stamp()", about = "Stamp turtle shape; returns id",
              insert = "stamp()", params = {} },
            { call = "clearstamp(id)", about = "Remove a stamp",
              insert = "clearstamp(stamp())", params = { { "id", "any" } } },
            { call = "clearstamps(n)", about = "Remove last n stamps; omit n to clear all",
              insert = "clearstamps(2)", params = { { "n", "number" } } },
            { call = "Turtle()", about = "Create a second turtle with all the same methods",
              insert = "local t = Turtle()", params = {} },
        },
    },
    {
        title = "State Queries",
        commands = {
            { call = "position()", about = "Returns x, y coordinates",
              insert = "print(position())", params = {} },
            { call = "xcor() / ycor()", about = "Returns x or y coordinate",
              insert = "print(xcor(), ycor())", params = {} },
            { call = "heading()", about = "Returns current angle in degrees",
              insert = "print(heading())", params = {} },
            { call = "isdown()", about = "Returns true if pen is down",
              insert = "print(isdown())", params = {} },
            { call = "isvisible()", about = "Returns true if turtle is visible",
              insert = "print(isvisible())", params = {} },
            { call = "distance(x, y)", about = "Returns distance to point",
              insert = "print(distance(0, 0))", params = { { "x", "number" }, { "y", "number" } } },
            { call = "towards(x, y)", about = "Returns angle towards point",
              insert = "setheading(towards(0, 0))", params = { { "x", "number" }, { "y", "number" } } },
        },
    },
}
