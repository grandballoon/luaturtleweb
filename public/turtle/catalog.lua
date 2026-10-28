-- turtle/catalog.lua
--
-- The commands the command reference lists, grouped into its sections, as
-- data: the controller menu, the mapping view and (later) the desktop's
-- reference read them from here. The web's reference is still written out
-- in index.html; test/catalog_test.lua fails if the two disagree, so edit
-- both together.
--
-- Pure data: { { title, commands = { { call, about, insert }, ... } }, ... },
-- in the reference's order. call and about are the reference's; insert is
-- what the desktop puts in the program when the command is picked from a
-- menu: a call that runs as it is, with values in place of the parameter
-- names, since a learner holding a controller can change a value (the
-- stick nudges numbers and steps through colors) but cannot type one.

return {
    {
        title = "Movement",
        commands = {
            { call = "forward(n)", about = "Move forward n pixels. Alias: fd",
              insert = "forward(100)" },
            { call = "back(n)", about = "Move backward n pixels. Alias: bk",
              insert = "back(100)" },
            { call = "left(degrees)", about = "Turn left. Alias: lt",
              insert = "left(90)" },
            { call = "right(degrees)", about = "Turn right. Alias: rt",
              insert = "right(90)" },
            { call = "setpos(x, y)", about = "Move to coordinates (x, y)",
              insert = "setpos(100, 50)" },
            { call = "setheading(angle)", about = "Face a direction (0=east, 90=north). Alias: seth",
              insert = "setheading(90)" },
            { call = "home()", about = "Return to center, face east",
              insert = "home()" },
            { call = "setx(x)", about = "Set x coordinate, keep y",
              insert = "setx(100)" },
            { call = "sety(y)", about = "Set y coordinate, keep x",
              insert = "sety(100)" },
            { call = "teleport(x, y)", about = "Jump to position instantly, no drawing",
              insert = "teleport(100, 50)" },
        },
    },
    {
        title = "Pen",
        commands = {
            { call = "penup()", about = "Stop drawing. Alias: pu",
              insert = "penup()" },
            { call = "pendown()", about = "Start drawing. Alias: pd",
              insert = "pendown()" },
            { call = "pensize(n)", about = "Set line width",
              insert = "pensize(3)" },
            { call = "pencolor(r, g, b)", about = "Set color with RGB (0–1 or 0–255)",
              insert = "pencolor(1, 0.5, 0)" },
            { call = "pencolor(\"name\")", about = "Set color by name: \"red\", \"blue\", \"gold\", etc.",
              insert = "pencolor(\"red\")" },
            { call = "color(\"red\")", about = "Set both pen and fill color",
              insert = "color(\"red\")" },
            { call = "color(\"red\", \"blue\")", about = "Set pen and fill color independently",
              insert = "color(\"red\", \"blue\")" },
        },
    },
    {
        title = "Shapes",
        commands = {
            { call = "circle(radius)", about = "Draw a full circle",
              insert = "circle(50)" },
            { call = "circle(radius, extent)", about = "Arc: extent in degrees",
              insert = "circle(50, 180)" },
        },
    },
    {
        title = "Fill",
        commands = {
            { call = "begin_fill()", about = "Start recording a filled shape",
              insert = "begin_fill()" },
            { call = "end_fill()", about = "Fill the shape drawn since begin_fill",
              insert = "end_fill()" },
            { call = "filling()", about = "Returns true if currently filling",
              insert = "print(filling())" },
            { call = "fillcolor(r, g, b)", about = "Set fill color",
              insert = "fillcolor(0, 0.6, 1)" },
            { call = "dot(size)", about = "Draw a filled circle at turtle's position",
              insert = "dot(20)" },
            { call = "dot(size, \"red\")", about = "Draw a dot with a specific color",
              insert = "dot(20, \"red\")" },
        },
    },
    {
        title = "Text",
        commands = {
            { call = "write(text)", about = "Write text at turtle's position",
              insert = "write(\"Hello!\")" },
            { call = "write(text, move, align, font)", about = "align: \"left\", \"center\", \"right\"; font: {family, size}",
              insert = "write(\"Hello\", false, \"center\", {\"Arial\", 28})" },
        },
    },
    {
        title = "Canvas",
        commands = {
            { call = "bgcolor(r, g, b)", about = "Set background color",
              insert = "bgcolor(0.1, 0.1, 0.2)" },
            { call = "bgcolor(\"name\")", about = "Set background color by name",
              insert = "bgcolor(\"navy\")" },
            { call = "screen_width()", about = "Returns canvas width in pixels",
              insert = "print(screen_width())" },
            { call = "screen_height()", about = "Returns canvas height in pixels",
              insert = "print(screen_height())" },
            { call = "clear()", about = "Erase drawing, keep turtle position",
              insert = "clear()" },
            { call = "reset()", about = "Erase drawing and reset turtle to start",
              insert = "reset()" },
            { call = "undo()", about = "Undo the last command",
              insert = "undo()" },
            { call = "setundobuffer(n)", about = "Set max undo history length",
              insert = "setundobuffer(10)" },
            { call = "speed(n)", about = "0=instant, 1=slowest, 10=fastest",
              insert = "speed(5)" },
        },
    },
    {
        title = "Turtle",
        commands = {
            { call = "hideturtle()", about = "Hide the turtle. Alias: ht",
              insert = "hideturtle()" },
            { call = "showturtle()", about = "Show the turtle. Alias: st",
              insert = "showturtle()" },
            { call = "stamp()", about = "Stamp turtle shape; returns id",
              insert = "stamp()" },
            { call = "clearstamp(id)", about = "Remove a stamp",
              insert = "clearstamp(stamp())" },
            { call = "clearstamps(n)", about = "Remove last n stamps; omit n to clear all",
              insert = "clearstamps(2)" },
            { call = "Turtle()", about = "Create a second turtle with all the same methods",
              insert = "local t = Turtle()" },
        },
    },
    {
        title = "State Queries",
        commands = {
            { call = "position()", about = "Returns x, y coordinates",
              insert = "print(position())" },
            { call = "xcor() / ycor()", about = "Returns x or y coordinate",
              insert = "print(xcor(), ycor())" },
            { call = "heading()", about = "Returns current angle in degrees",
              insert = "print(heading())" },
            { call = "isdown()", about = "Returns true if pen is down",
              insert = "print(isdown())" },
            { call = "isvisible()", about = "Returns true if turtle is visible",
              insert = "print(isvisible())" },
            { call = "distance(x, y)", about = "Returns distance to point",
              insert = "print(distance(0, 0))" },
            { call = "towards(x, y)", about = "Returns angle towards point",
              insert = "setheading(towards(0, 0))" },
        },
    },
}
