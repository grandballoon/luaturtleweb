-- turtle/examples.lua
--
-- Example calls for every public command, shown in the editor under a line
-- whose call to that command was rejected (see usage-popup.js). Keyed by the
-- command's own name, never an alias. Aim for 2 or 3 examples that show the
-- call's different forms; a command with only one form may have just one.
--
-- Pure data: edit freely. test/args_test.lua checks that every command has
-- examples and that every example runs, so a typo here fails the tests
-- rather than teaching a learner a call that doesn't work.

return {
    -- Movement
    forward    = { "forward(100)", "forward(25.5)", "forward(-50)" },
    back       = { "back(100)", "back(25.5)" },
    right      = { "right(90)", "right(45)", "right(-30)" },
    left       = { "left(90)", "left(45)", "left(-30)" },
    setpos     = { "setpos(100, 50)", "setpos(0, -80)", "setpos({100, 50})" },
    setx       = { "setx(100)", "setx(-50)" },
    sety       = { "sety(100)", "sety(-50)" },
    setheading = { "setheading(90)", "setheading(0)", "setheading(270)" },
    home       = { "home()" },
    teleport   = { "teleport(100, 50)", "teleport(-60, 0)", "teleport({100, 50})" },

    -- Pen
    penup      = { "penup()" },
    pendown    = { "pendown()" },
    pensize    = { "pensize(3)", "pensize(0.5)", "local w = pensize()" },
    pencolor   = { 'pencolor("red")', "pencolor(1, 0.5, 0)", "pencolor(255, 128, 0)" },
    fillcolor  = { 'fillcolor("gold")', "fillcolor(0, 0.6, 1)", "fillcolor(0, 153, 255)" },
    color      = { 'color("red")', 'color("red", "yellow")', "color({1, 0, 0}, {0, 0, 1})" },

    -- Shapes and fill
    circle     = { "circle(50)", "circle(50, 180)", "circle(50, 360, 6)" },
    begin_fill = { "begin_fill()" },
    end_fill   = { "end_fill()" },
    filling    = { "if filling() then end_fill() end" },
    dot        = { "dot(20)", 'dot(20, "red")', "dot(20, 1, 0, 0)" },

    -- Text
    write      = { 'write("Hello")', 'write("Hello", false, "center")',
                   'write("Hello", true, "left", {"Arial", 16})' },

    -- Stamps
    stamp       = { "local id = stamp()" },
    clearstamp  = { "local id = stamp()\nclearstamp(id)" },
    clearstamps = { "clearstamps()", "clearstamps(2)", "clearstamps(-2)" },

    -- Canvas
    clear         = { "clear()" },
    reset         = { "reset()" },
    bgcolor       = { 'bgcolor("black")', "bgcolor(0.1, 0.1, 0.2)", "bgcolor(20, 20, 50)" },
    screen_width  = { "local w = screen_width()" },
    screen_height = { "local h = screen_height()" },
    undo          = { "undo()" },
    setundobuffer = { "setundobuffer(100)", "setundobuffer(0)" },
    undobufferentries = { "local n = undobufferentries()" },
    speed         = { "speed(1)", "speed(10)", "speed(0)" },
    tracer        = { "tracer(0)", "tracer(1)", "tracer(10)" },
    update        = { "tracer(0)\nforward(100)\nupdate()" },
    done          = { "done()" },
    bye           = { "bye()" },

    -- Turtle
    showturtle = { "showturtle()" },
    hideturtle = { "hideturtle()" },
    Turtle     = { "local t = Turtle()\nt:forward(100)" },

    -- State queries
    position   = { "local x, y = position()" },
    xcor       = { "local x = xcor()" },
    ycor       = { "local y = ycor()" },
    heading    = { "local angle = heading()" },
    isdown     = { "if isdown() then penup() end" },
    isvisible  = { "if isvisible() then hideturtle() end" },
    distance   = { "local d = distance(100, 50)", "local d = distance({100, 50})" },
    towards    = { "local angle = towards(100, 50)", "setheading(towards(0, 0))" },
}
