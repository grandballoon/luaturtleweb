# Spec — Lua Turtle on LÖVE, gamepad first, alongside the geometry library

This document plans the port of Lua Turtle Web to a desktop app built on LÖVE, with the game controller treated as a primary input device rather than an add-on.
It also plans the geometry programming library described in `../triangle-lab/primitives-api.md`, which will be developed on LÖVE in parallel, iterated through several API designs, and may later merge with the turtle app.

It supersedes `loveport.md`, which was an early sketch written before the controller, command reference, demos and argument checks existed.
The central idea of that sketch survives: the user's program runs in a coroutine, and the whole Web Worker / `SharedArrayBuffer` apparatus collapses into `coroutine.yield`.

## Goals and non-goals

Goals:

- A desktop app with feature parity with the web version: run, stop, undo, tracer, multi-turtle, zoom and pan, output panel, argument checks with usage examples, command reference with demos, PNG export.
- Everything reachable with a controller alone, including writing a program, which the web version only partly supports.
- Typing Lua on a regular keyboard stays a first-class way to write programs, as it is on the web; the controller is added alongside it, never in place of it.
- Strong point-and-click support on the canvas, so a learner can orient themselves in the coordinate space by pointing: where is this, which way is that, how far.
- Room in the architecture for two experiments that may or may not ship: a card- or block-based way to write programs (a third input alongside keyboard and controller), and an optional execution trace that links drawn ink to the code that drew it and lets the learner scrub the last run, after Bret Victor's *Learnable Programming*.
- A shared foundation (input, UI widgets, camera, storage, test harness) that both the turtle app and the geometry library are built on from the first day, so unifying them later is a merge of features rather than a rewrite.
- `core.lua`, `screen.lua` and `colors.lua` stay verbatim-shared across the web, Cairo/SDL2 and LÖVE hosts.

Non-goals for the first release:

- Mobile LÖVE builds.
- Replacing the web version; both are maintained, and share links stay interchangeable.
- A full-featured code editor; the in-app editor needs to be good, not VS Code.

## What we start from

The web app's layering (see `architecture.md`) is already close to a functional core with an imperative shell, and that is what makes this port tractable.

| Web layer | Files | Fate in the LÖVE port |
| --- | --- | --- |
| Core | `public/turtle/core.lua`, `screen.lua`, `colors.lua` | Moves verbatim |
| Argument checks, examples, demos | `public/turtle/args.lua`, `examples.lua`, `demos.lua` | Move verbatim |
| Execution host | `public/turtle/turtle_web.lua` | Becomes host-neutral and instance-based; see [The execution host](#the-execution-host) |
| Worker bridge | `public/worker.js` | Replaced by a coroutine scheduler of roughly 60 lines |
| Renderer | `public/renderer.js` | Ported nearly line for line to `love.graphics` |
| Canvas gestures | `public/canvas-view.js` | Ported; `zoomAt` math unchanged |
| Controller | `public/gamepad-*.js`, `recent-commands.js`, `favorites.js`, `command-catalog.js` | Ported into a shared input package, extended for analog input |
| Editor | CodeMirror in `public/app.js` | Replaced by an in-app editor built for the controller |
| Panels | `dock.js`, `terminal.js`, `splitter.js`, `command-reference.js`, `usage-popup.js` | Rebuilt as small immediate-mode widgets |
| Preferences | `public/storage.js` | `love.filesystem` save directory, same never-throw contract |

The empty `../love2d_turtle` folder holds a one-paragraph plan (full turtle API, LÖVE API access from turtle programs, export as a LÖVE game, curriculum portal).
This spec is compatible with that plan and proposes that folder become the home of both LÖVE tools; see [Repository layout](#repository-layout).

## Platform facts, checked on this machine

LÖVE 11.5 is installed at `/Applications/love.app`.
A probe run inside it reported:

| Check | Result | Consequence |
| --- | --- | --- |
| `_VERSION`, `jit.version` | `Lua 5.1`, `LuaJIT 2.1` | The web runs Lua 5.4; dialect differences below |
| `table.unpack` | **missing** | `core.lua` and the sandbox's `unpack` use it; the host must shim it |
| 4-argument `load(code, name, "t", env)` | works | The sandbox loads code as today |
| `goto` | works | — |
| `require("screen")`, `require("core")` | load cleanly | The core is otherwise dialect-neutral |
| `love.joystick` | present | SDL2 game-controller API available |

The shim goes in the host, before anything requires the core, so the shared files stay verbatim:

```lua
table.unpack = table.unpack or unpack
```

Lua 5.4 and LuaJIT differ in ways a learner will see, and the curriculum must be written with them in mind:

- `print(10 / 2)` prints `5.0` under 5.4 and `5` under LuaJIT, and `xcor()` after `forward(100)` prints `100.0` versus `100`.
- `//` (integer division) and the bitwise operators are syntax errors under LuaJIT.
- `math.type`, `utf8` as a global, and `<const>`/`<close>` are absent.

Decision: accept LuaJIT's dialect rather than embedding PUC Lua 5.4 through FFI.
Embedding 5.4 is possible, but it trades a documented dialect note for a native-library build on three platforms, and it loses LuaJIT's ability to yield across `pcall`, which the coroutine model relies on.
Curriculum examples that must run on both hosts avoid `//` and avoid depending on how floats print; a test runs every shipped example and demo under both `lua` (5.4) and `luajit` to enforce that.

LÖVE 12 is expected to change some APIs this plan touches (stencils, `Joystick:getGamepadType`, filesystem mounting).
Target 11.5 and keep each such call behind one small function so the upgrade touches one place each.

## Repository layout

Both tools live in one repository from the start, because the plan is to develop them in parallel and possibly unify them, and shared code that lives in two repositories drifts.

```
love2d_turtle/                 (rename when the product name settles)
├── conf.lua                   window, highdpi, msaa, identity
├── main.lua                   picks an app: love . turtle | love . geo | love . input (controller diagnostic); --smoke for scripts
├── shared/
│   ├── input/                 controller, keyboard and mouse → actions and pointers (pure readers)
│   ├── ui/                    menu page stack, mapping view, dock, list, text field, on-screen keyboard
│   ├── camera.lua             world ↔ screen transform, zoomAt, fit-to-bounds (pure)
│   ├── storage.lua            save-directory JSON, never throws (json.lua encodes; LÖVE 11.5 has no JSON)
│   ├── editor/                text buffer core (pure) and its view
│   ├── lua_syntax/            tokenizer and parser with source ranges (pure)
│   ├── pointing/              coordinate readout, grid ticks, pins, measure, snapping, hit testing (pure)
│   ├── blocks/                the experimental block and card views over the syntax tree
│   └── theme.lua              colors, fonts (IBM Plex Sans and Mono, bundled)
├── turtle/
│   ├── host.lua               the execution host, instance-based
│   ├── scheduler.lua          resumes the program coroutine against the clock
│   ├── trace.lua              the optional execution recorder and view_at (pure, host-neutral)
│   ├── renderer.lua
│   └── app.lua                the turtle app's shell
├── geo/
│   ├── core/                  figures, relations, theorems, constraints (pure)
│   ├── renderer.lua
│   ├── sketches/              example programs; the API's acceptance tests
│   └── app.lua
├── vendor/turtle/             core, screen, colors, args, examples, demos, random, host (synced, never edited) + MANIFEST.lua
├── diagnostics/app.lua        the controller diagnostic
├── tools/sync-vendor.lua      copies the shared turtle files from luaturtleweb and records their fingerprints
└── test/                      plain luajit test files, as in luaturtleweb/test
```

The vendored turtle files are synced by a script that copies them and records their hashes; a test fails when a vendored file differs from its recorded hash, so a hand edit is caught at once.
This also delivers item 5 of `fixes.md` (drift detection) for all three hosts.

## The execution host

### Coroutines replace the worker

`turtle_web.lua` already funnels every frame through one seam: `_raw_post_frame()` calls the host-defined global `_bridge_post_frame(delay_ms)`.
On LÖVE that function is a single line:

```lua
_bridge_post_frame = function(delay_ms) coroutine.yield(delay_ms) end
```

The scheduler owns the program coroutine and resumes it from `love.update`:

- It keeps a program clock.
  Each yield adds its `delay_ms` to the time the next frame is due.
- In one `love.update` it keeps resuming while the next frame is already due and less than a fixed slice of real time (around 8 ms) has been spent.
  Fast programs therefore skip frames the display could not show, and slow programs wait without blocking the window.
- `love.draw` draws the current state straight from `screen:visible_segments()`; no snapshot, no copying, no pull accessors.
- Stop drops the coroutine.
  There is no stop flag, no `__STOPPED__` sentinel to unwind, and Run-while-running is just replacing one coroutine with another.
- A program that finishes with `tracer(0)` still shows only what `update()` last showed, as on the web, because `love.draw` draws the last state the program yielded rather than the live one.
  That means the host keeps a "presented" view (the log length, hidden set and cleared-stamps set as of the last yield), and `love.draw` renders that view.

The scheduler is a pure step function over `{clock, due, slice}` plus an imperative `resume` it is handed, so its pacing logic is tested by equality without LÖVE.

### Runaway code

Two LuaJIT facts shape the instruction guard in `worker.js`, both measured inside LÖVE 11.5 in phase 0:

- Count hooks do not fire inside JIT-compiled traces.
  In practice LuaJIT stops compiling while a count hook is set: a hot loop run under the hook fired it on every count (600,000 times for 3×10⁸ iterations, exactly an uncompiled loop's rate).
  Code compiled before the hook was set could still escape it, so the host also calls `jit.off(chunk, true)` on the loaded user chunk, which turns compilation off for it and everything it defines; turtle programs are frame-bound and will not notice.
- LuaJIT keeps one hook for the whole VM, not one per coroutine.
  A hook set on one coroutine fired 4,026 times while another coroutine and the main thread ran.
  So the scheduler sets the hook just before each resume and clears it when the resume returns, so it never counts LÖVE's own code.

The limit also changes meaning, deliberately.
The web counts instructions over the whole run, so a long animation eventually trips it.
The desktop counts instructions between yields, so only code that never draws is stopped, and an animation can run forever.
A hook cannot yield in LuaJIT, so a loop that never draws freezes the window until it trips the limit.
Measured on this machine, the web's limit of 50M instructions (hook every 1,000) stops a non-drawing loop after 0.10 s, so the desktop keeps the same limit.

### One host, many instances

`turtle_web.lua` keeps its screen, default turtle, tracer counters and print buffer in module-level locals and globals.
That is fine in a worker that runs one program, but the desktop app runs two programs at once (the learner's and a reference demo), and the web solves that with a second worker.

Refactor the host into a constructor, `Host.new{ width, height, post_frame, print }`, returning an instance that owns its screen, cores, tracer state and sandbox env.
The web worker then makes one instance, and the LÖVE app makes one per running program, each with its own coroutine.
Recording a demo becomes "run an instance whose `post_frame` appends a snapshot instead of yielding", exactly what `recordFrame` in `worker.js` does now.
This refactor lands in luaturtleweb first, under its existing tests, and the LÖVE port then vendors the result; that keeps one host for both platforms rather than a fork.

### Errors

The `xpcall` handler in `worker.js` that finds the innermost `user_code` line and attaches usage examples moves into the host unchanged.
Syntax errors still come from `load`'s message, whose format is identical in LuaJIT (`[string "user_code"]:3: ...`).
`args.lua` works verbatim; its `select("#", ...)` counting behaves the same in 5.1.

### Determinism

The sandbox exposes no `os`, `io` or clock, so a program's output depends only on its code, the canvas size and `math.random`.
The host seeds `math.random` at the start of every run and records the seed.
That makes every run reproducible, which the execution trace below relies on, and costs nothing when the trace is off.

## Execution trace (optional, experimental)

The aim is the two links *Learnable Programming* argues for: from what is drawn back to the code that drew it, and from code to what it drew over time.
Concretely:

- **Click ink, see the line.**
  Clicking a drawn segment highlights the line of code that drew it, and for a line inside a loop or a function, which pass it was ("iteration 7 of 36", "called from line 30").
- **Point at a line, see its ink.**
  Hovering a line of code (or the card for it, if blocks ship) highlights every segment it drew and dims the rest.
- **Scrub the last run.**
  A timeline under the canvas shows the most recent run as a sequence of steps.
  Dragging its playhead backwards and forwards shows the canvas, the turtle heads, the output panel and the editor's current-line highlight as they were at that step, without re-running anything.
  The arrow keys step one command at a time, and a controller's triggers scrub it analogically when the timeline has focus.

It is not guaranteed to ship, so the architecture commits only to what keeps it possible and is free when it is off:

- **One switch.**
  `Host.new{ trace = true }` turns it on; off, the host installs no recorder and pays nothing.
- **One hook point.**
  Every public command already passes through one wrapper in the host (argument check, then `with_undo`, which records the log indices the command added through `Core:_commit_undo_segments`).
  With tracing on, the wrapper also hands a recorder the command, its arguments, the log index range it added, and the user-code lines on the stack, found by the same `debug.getinfo` walk the error handler uses.
- **The core stays verbatim.**
  The recorder keeps its records in its own table keyed by log index; segments themselves gain no fields.

### The recorder

A trace is a list of step records, one per command:

```lua
{ step = 412, command = "forward", args = {10},
  lines = {12, 30},          -- innermost user line first, then its callers
  pass = 7,                  -- how many times line 12 had run, this one included
  first = 1033, last = 1040, -- log indices the command appended (empty range for none)
  turtle_id = 1,
  state = { x =, y =, angle =, pen_down =, pen_color =, ... },  -- the turtle after the command
  frame = 380,               -- the frame that first showed it
  prints = 3 }               -- how many print lines had been written
```

Everything that changes the picture without appending to the log is recorded as an event at its step: undo hiding indices, `clearstamp` clearing a stamp, `bgcolor` changing the background.
The segment log is append-only and `clear` is already a marker inside it, so with those events the picture at any step is a pure function:

```lua
view_at(log, trace, k) --> { segments, turtles, bgcolor, prints }
```

It takes the log up to step `k`'s last index, applies the events up to step `k`, and runs the screen's own visibility filters over the result, so the projection logic is not duplicated.
Whether those filters can run over an assembled view without editing `screen.lua` is the first thing to check; if they cannot, that is a change to propose to the shared core, not a fork.

The strongest test is an equality: for a set of programs, `view_at` at each step equals the live state a traced run reached at that step.

Memory is bounded by a step cap (say 200,000).
A run that exceeds it keeps its first steps, and the timeline says it covers only part of the run.
Because runs are deterministic, a later version can replace stored states with keyframes plus re-execution to a given step, without changing the interface.

### Hit testing

Clicking the canvas converts the pointer to turtle coordinates through the shared camera, then finds the topmost visible segment under it, as a pure function over the visible segments and a tolerance in screen pixels: distance to a line, inside a fill (nonzero winding, matching the renderer), within a dot, inside a text or stamp's box.
Drawing order decides ties, so the result is what the learner sees on top.

### Possible later levels

Recording the values of the user's local variables at each step (through `debug.getlocal`, numbers, strings and booleans only) would let the timeline show state as well as flow, which is the next idea in the essay.
That is a second level, `trace = "locals"`, considered only after the first level proves its worth and its cost.

The recorder is host-neutral Lua, so the web worker could use it too, sending step records with its frames; the web UI for it is out of scope here.

## The renderer

`renderer.js` ports nearly line for line.

- **Commit canvas.**
  A `love.graphics.newCanvas` holds the durable ink, redrawn in full from the visible segments each frame, with turtle heads drawn over it.
  Incremental drawing (only new segments, full replay on undo, clear, zoom, pan or resize) is the optimization `spec-incremental-frames.md` plans; do full replay first.
- **Viewport.**
  The turtle → screen flip (`screen_y = h/2 − (ty − cy)·s`) carries over, applied once as a `love.math.Transform` rather than folded into each coordinate.
  The camera module is shared with the geometry library.
- **Fills.**
  Canvas2D fills with the nonzero winding rule, so a self-intersecting star fills its centre.
  `love.graphics.polygon("fill")` handles only convex polygons, so fills use the stencil buffer: draw a triangle fan from the first vertex into the stencil with `incrementwrap` for counter-clockwise triangles and `decrementwrap` for clockwise ones, then draw the bounding box where the stencil is not zero.
  On 11.5 that is `love.graphics.stencil(fn, action)` with `setStencilTest("notequal", 0)`, and the commit canvas is set with `{ canvas, stencil = true }`.
  This matches the web pixel for pixel; even-odd would be a visible difference.
- **Lines.**
  `setLineJoin("miter")`, `setLineStyle("smooth")`, and `t.window.msaa = 4`.
  The web draws round caps; LÖVE lines have no caps, so draw a filled circle of the pen width at each end of a thick segment.
- **Text.**
  Bundle IBM Plex Sans (the web uses `sans-serif` for drawn text and Plex for the UI) and cache `Font` objects by size.
- **Colors.**
  The segment log stores colors in the range the core uses; normalize to LÖVE's 0–1 floats once, in the renderer.
- **High DPI.**
  `t.window.highdpi = true`; layout works in DPI-scaled units and only the PNG export cares about `getDPIScale()`.
- **Export.**
  `canvas:newImageData():encode("png", name)` writes into the save directory, and `love.system.openURL` reveals it.

The two zoom bugs in `buglist.md` (head size and position mismatch while zooming mid-move) should be reproduced on the web first and fixed in the shared logic, so the port does not inherit them.

## Pointing at the canvas

Turtle graphics is a lesson in coordinates and headings, and the mouse is the most direct way to ask the canvas a question about them.
The canvas therefore answers pointing, not only displays:

- **Where am I.**
  The turtle coordinates under the pointer are shown in a corner of the canvas, and the grid's axes carry numbers whose spacing adapts to the zoom (1, 2 or 5 times a power of ten), with the origin marked.
- **What is this turtle doing.**
  Hovering a turtle shows its position, heading and pen; a compass ring around the selected turtle marks 0° east and 90° north, in the turtle's own heading convention.
- **Pins.**
  Clicking places a pin, a marker that belongs to the view, not to the drawing.
  A pin shows its coordinates, can be dragged, and offers to insert `goto(x, y)` or `setheading(towards(x, y))` into the editor, or to copy its coordinates.
- **Measure.**
  Dragging from one point to another shows the distance and the heading between them, and the turn from the turtle's current heading.
  On release it offers the commands that would make that move (`right(θ)` then `forward(d)`, or `setheading(h)` then `forward(d)`).
- **Ghost turtle.**
  Dragging a turtle moves a translucent copy of it, showing the commands that would take the real one there, without changing the program until the learner inserts them.
- **Snapping.**
  Pins, measurements and the ghost snap to turtles, segment endpoints, other pins and grid intersections within a few screen pixels; holding Shift turns snapping off.
- **The view itself.**
  Wheel zoom about the pointer and drag to pan stay as on the web, with zoom to fit the drawing and reset view one click each.

The pieces are pure functions over values: the camera's inverse, grid tick spacing, snapping (candidates, a pointer, a radius in, the chosen point out), and a measurement to command text.
The shell only reads the mouse and draws.
Every one of these tools also works with the controller's virtual pointer and from the keyboard (arrow keys move the selected pin), so pointing is a way to ask questions, not a requirement to own a mouse.

The geometry library shares all of it: the same camera, readout, grid and snapping, and pins become free points.
Pointing and dragging is that library's main interaction anyway, and the lab's finger-sized grab radii (`../triangle-lab/src/fit.ts`) carry over.

## The editor

LÖVE has no text widget, and the controller workflow on the web inserts commands at the CodeMirror caret, so an external editor plus file watching is not enough on its own.
The app gets its own editor, and also keeps the external-editor loop for learners who prefer it.
The in-app editor is first of all a keyboard editor: a learner types Lua into it exactly as they do in CodeMirror on the web, and the controller is a second way to drive the same buffer.

The editor splits the usual way:

- **Buffer core (pure).**
  Lines, caret, selection, an undo history of edit records, and operations that return a new buffer: insert, delete, move by character, word, line and token, and indent.
  UTF-8 positions use LÖVE's `utf8` module.
- **Tokenizer (pure).**
  A port of the turtle-command pattern in `public/lua-highlight.js`, producing the same highlight classes, plus token boundaries the controller uses to step through code.
- **View (shell).**
  Draws visible lines in Plex Mono, the caret, the selection and the error mark, and turns `love.textinput`, `love.keypressed` and clipboard calls into buffer operations.
- **Keyboard input.**
  `love.keyboard.setTextInput(true)` while the editor has focus, so `love.textinput` delivers typed text (including non-ASCII characters and IME composition through `love.textedited`).
  `love.keyboard.setKeyRepeat(true)` for held keys.
  The keyboard keeps the web's bindings: arrows, Home/End, word moves with Alt (Ctrl off macOS), Shift-extended selection, Tab and Shift-Tab indent, auto-indent on Enter, undo and redo, cut, copy and paste, select all, and the app shortcuts (⌘↵ run, Esc stop, ⌘K reference, ⌘⇧D demos, ⌃` terminal), with Ctrl in place of ⌘ off macOS.
  Mouse clicks and drags place the caret and select, and the wheel scrolls.
  Keyboard and controller edits go through the same buffer operations and the same undo history, so a learner can switch between them mid-line.
- **File backing.**
  The buffer is backed by a file in the save directory.
  Saving writes it; an external change (polled `modtime`) reloads it, and if the buffer has unsaved edits the app asks which to keep.
  Dropping a folder on the window (`love.directorydropped`) mounts it so learners can work in their own folder.

### Writing code with a controller

This is where the desktop version can be better than the web, not just equal to it.
A keyboard edits characters; a controller is better at choosing among structure, so controller editing works on tokens and lines:

- **Token cursor.**
  The d-pad moves by token left and right and by line up and down; the caret is always on a whole token.
- **Insert from the menu.**
  As on the web, a command's signature is inserted on a new line below the caret, from the menu of reference sections, Recent and Favorites.
- **Edit values in place.**
  With the caret on a number, the right stick's vertical axis nudges it (small steps near the centre, faster at the edge, analog), and the program re-runs on release.
  With the caret on a color string, the stick steps through named colors.
  This is the controller's natural strength, and it makes "change the angle until the star closes" a physical act.
- **Line operations.**
  Delete, duplicate and move a line, and wrap lines in a `for` loop, each one function in the registry, so each can be mapped to a button.
- **Text entry when needed.**
  Without a keyboard attached, variable names and strings use an on-screen keyboard widget from `shared/ui`; the geometry library needs the same widget for labels.
  With a keyboard attached, typing simply works wherever text goes, including the reference search and favorites category names.

The structural editing operations are pure buffer functions, so each one is unit-tested, as are the keyboard bindings (a key and modifiers in, a buffer operation out).

### Blocks and cards (experimental third input)

A card- or block-based view is the third way to write a program, alongside typing and the controller, and it is an experiment: the design keeps it cheap to try and cheap to drop.
Its design lives in [spec-blocks.md](spec-blocks.md).
In short: the text stays the source of truth, blocks are a view over a pure Lua parser's syntax tree, and every block edit is a text edit through the buffer.

## Controller support

### What carries over

The web's controller code is already split into a reader, a layout, bindings, a function registry, a menu, and a mapping view, and that split carries over as the shared input package.
The reader's logic (repeat timing, stick-as-d-pad with hysteresis, triggers counted as buttons past a threshold) moves into a pure Lua function over snapshots, tested by equality as `test/gamepad_test.mjs` tests it now.

### What changes

| Topic | Web (Gamepad API) | LÖVE (SDL2 game controller) | Plan |
| --- | --- | --- | --- |
| Button names | W3C standard indices 0–16 | Names: `a`, `b`, `x`, `y`, `back`, `guide`, `start`, `leftstick`, `rightstick`, `leftshoulder`, `rightshoulder`, `dpup`, `dpdown`, `dpleft`, `dpright` | Key bindings by SDL name; convert saved web mappings only if import is ever wanted |
| Triggers | Buttons 6 and 7, with an analog `value` | Axes `triggerleft`, `triggerright` in 0–1 | Reader exposes both a digital press (with hysteresis) and the analog value |
| Discovery | Hidden until a button is pressed; the first press is swallowed | Present at launch; `love.joystickadded` / `removed` | Drop the "waking" logic |
| Unknown devices | Browser decides the mapping | SDL's controller database; `Joystick:isGamepad()` false for unknown ones | Ship `gamecontrollerdb.txt` and load it with `love.joystick.loadGamepadMappings` |
| Several controllers | Merged into one | Each is a separate `Joystick` | Merge by default, but keep per-device state; the geometry library uses two |
| Glyphs | Xbox 360 layout only | `Joystick:getDeviceInfo()` gives vendor and product ids on 11.5 | Pick a layout from the vendor id (Microsoft, Sony, Nintendo); fall back to Xbox |
| Haptics | Inconsistent across browsers | `Joystick:setVibration(left, right, duration)` | Short pulses for errors, snaps and run finished, with a setting to turn them off |
| Polling | `requestAnimationFrame` | `love.update` | Poll snapshots every update; use callbacks only for connect and disconnect |

Poll rather than handling `love.gamepadpressed`, so that one pure reader is the only source of presses, repeats and stick directions, and an input recording can be replayed through it.

Nintendo controllers put A on the right and B at the bottom, the reverse of Xbox.
SDL2 maps them by printed label by default (`SDL_HINT_GAMECONTROLLER_USE_BUTTON_LABELS`), so SDL's `a` should be the button labelled A; the `NINTENDO` layout assumes so, and the controller diagnostic (`love . input`) is how to confirm it on a real Switch Pro or 8BitDo controller.
The layout data owns the difference: each layout says which glyph and which face position sit on each SDL name, and every hint and legend draws from it, so the learner always sees the label printed on their controller.

### Analog input, which the web never used

The web reads the controller as a set of buttons.
The desktop adds a small, separate set of analog channels, shared by both apps:

- **Radial dead zone and response curve** on each stick, as pure functions of `(x, y)` with tests, rather than per-axis dead zones that make diagonals sticky.
- **Pan and zoom.**
  The right stick pans the canvas and the triggers zoom (analog, about the canvas centre or the pointer), when the editor does not claim the right stick for value nudging.
- **A virtual pointer.**
  A stick can drive a pointer that the rest of the app treats exactly like the mouse, with magnetism toward the nearest interactive target.
  This is the triangle-lab rule "Hands are a pointer" (`../triangle-lab/architecture.md`) applied to the controller: anything that works with a mouse works with a stick, and no widget has controller code of its own.

### Actions, bindings and the mapping view

The function registry stays `{ id, label, group, run }`, with every command in the catalog also a function, so a button can open the menu or insert `forward(distance)` outright.
Bindings persist as JSON in the save directory.
The mapping view keeps its safety rule: its own navigation buttons work whatever they are mapped to, so a broken mapping can be repaired with the controller alone, and Reset restores the defaults.

New for desktop: a binding can be a **chord** (hold `leftshoulder`, then press a face button), which doubles the number of functions reachable without a menu.
A chord's modifier button does nothing on its own, which the mapping view shows.

### Steam Deck

The Steam Deck runs LÖVE under Linux and is a controller-only machine with a 1280×800 screen, so it is a natural reference device.
Phase 2 checks every screen at 1280×800 with no keyboard or mouse attached.

## Shared UI

The panels become small immediate-mode widgets in `shared/ui`, each a pure state value plus a draw function and an input function:

- **Dock**: collapse, resize, saved height; `dockHeight` from `public/dock.js` ports as is.
- **List and menu page stack**: the model in `public/gamepad-menu.js` (a stack of pages, each a list of rows with one selected) is already a pure value; it ports first and becomes the navigation model for every controller screen in both apps.
- **Command reference**: search, list, detail pane, demo player, built on the list.
  `command-catalog.js` reads commands from `index.html`; the desktop needs a data file instead, so the catalog moves into a Lua table that the web build also reads, and the reference, menu and mapping view keep one source.
- **Terminal**, **usage popup**, **on-screen keyboard**, **text field**.

Focus moves between widgets with the same few buttons everywhere, so a learner never needs to learn a screen's controls separately.

## Testing

- **Pure modules** (input reader, dead zones, scheduler step, editor buffer, tokenizer, parser, menu stack, camera, grid ticks, snapping, hit testing, dock height, geometry core) are tested by plain equality, in plain `luajit` test files run from the repo root like `luaturtleweb/test`.
- **Parser round trip.**
  Every example, demo and sketch parses and prints back to identical text, and each block edit produces an expected text.
- **Trace replay.**
  For a set of programs, `view_at` at every step equals the live state a traced run reached at that step, and two runs with the same seed produce identical traces.
- **Vendored turtle files** run their existing suites under both `lua` (5.4) and `luajit`, so they stay dialect-neutral.
- **Every example and demo** runs headless under the LÖVE host with a no-op frame function, as `test/demos_test.lua` does for the web.
- **Input replay.**
  A recorded list of controller snapshots is fed through the reader and the app's action dispatch, and the resulting app state is compared with an expected value.
  This is how controller flows (insert a command, nudge a value, run, undo) get end-to-end tests without a person holding a controller.
- **Headless LÖVE.**
  Tests that need `love.*` but not a window run with a test `conf.lua` that turns the window off.
- **Visual checks** are the user's; the deliverable for each UI change is an app that builds and runs.

## Packaging

- A `.love` archive for development and for anyone with LÖVE installed.
- macOS: copy `love.app`, rename it, put the `.love` in `Contents/Resources`, edit `Info.plist`, then sign and notarize for distribution.
- Windows: fuse the archive onto `love.exe` and ship it with LÖVE's DLLs.
- Linux and Steam Deck: an AppImage.
- A `tools/package.lua` script builds all three, so packaging is never done by hand.

Share links stay interchangeable: the desktop's Share copies the same `luaturtle.com/#<encoded code>` link the web makes, and pasting such a link into the desktop opens its program.

## The geometry library

### What the API document proposes

`../triangle-lab/primitives-api.md` designs a library in which figures, relations and theorems are values:

- **Figures are live**: every figure is a function of the free points it was built from, re-evaluated each frame (the lab's `Dyn<T>` in `src/lab/geo.ts`, made universal).
- **Relations are a closed set of types** (`equal`, `sum`, `ratio`, `product`, `parallel`, `concurrent`, `concyclic`, `tangent`, `invariant`, …).
- **Theorems are values** with `check` (a readout), `witness` (a construction, the proof as steps) and `enforce` (run backwards as a constraint).
- **Classification is refinement**: `tri:asRight()` returns a `RightTriangle` or nothing, and only a `RightTriangle` has `hypotenuse()`; `keepRight(C)` turns the observation into a constraint.
- Three early decisions: degenerate cases are values, correspondence is part of every comparison, and `enforce` always names what moves.

It is written in TypeScript notation, and the lab it comes from runs on the web with hand tracking as its second input device.

### Translating it to Lua

These are the questions the first API iteration answers in Lua, each with a starting proposal:

- **Live figures.**
  Proposal: each figure is a table holding its parents and a pure `eval` function, and the shell evaluates the graph once per frame in dependency order, caching each node's value for that frame.
  Thunks everywhere (the `Dyn<T>` style) are simpler but re-evaluate shared parents many times; a frame-stamped cache keeps the simplicity and removes the waste.
- **Refinement.**
  A refined figure is the same node with a richer metatable (`RightTriangle` with `__index` falling back to `Triangle`), returned only while the predicate holds; `nil` otherwise.
- **Measures.**
  Tables with a value, a unit and a provenance, with `__add`, `__mul`, `__div` and `__tostring`.
  Lua 5.1 calls `__eq` only between tables with the same metamethod, and `__lt` the same way, so comparisons go through relations (`equal(a, b)`) rather than `==`, which is also what the API wants.
- **Methods and properties.**
  `t:incircle()` for derived figures, and `t.A` for parts that are fixed at construction.
- **Units and naming.**
  The turtle API uses degrees and American spelling (`color`, `pencolor`), after Python turtle; the API document uses `centre` and the lab uses radians internally.
  Proposal: degrees at the API surface, radians inside, and American spelling, so a unified product speaks one dialect; British aliases can exist if wanted.
- **Coordinates.**
  Both are y-up mathematical space, so the shared camera serves both.
  Turtle units are pixels at zoom 1, while geometry figures live in small abstract units (`free(-3, 0)`); the camera's fit-to-bounds handles both.

### Programs: imperative turtle, declarative geometry

A turtle program is a script that runs once over time and leaves ink.
A geometry program declares a scene of live figures that is re-evaluated every frame while points move.
The runtimes differ accordingly:

- The turtle host runs the program in a coroutine against the clock.
- The geometry host runs the program once to build the figure graph, then every frame applies input to free points, applies constraints, evaluates the graph and draws it.

The two meet cleanly in a unified product, and the API iterations should keep that path open:

- A turtle path can be a figure (a polyline whose vertices are points), so a theorem can be checked on what a turtle drew.
- A live figure can be drawn by a turtle (`t:trace(circle)`), so geometry can be animated in the turtle style.
- Both draw through the same camera and theme, and both report errors and usage the same way (`args.lua`'s cursor style of argument checking suits the geometry API too).

### Controller interaction for geometry

The lab's core interaction is dragging a free point and watching what refuses to change.
With a controller:

- **Select, grab, move.**
  The bumpers cycle through free points (in reading order, or nearest-first from the current one), A grabs, and the left stick moves the grabbed point with an analog velocity curve.
  A held trigger switches to fine movement.
  Constraints are pure projections (`Constraint = function(p) return p' end`, as in `src/lab/geo.ts`), so the controller only proposes positions and the constraint decides where the point may be; this makes `enforce`'s "what moves" question concrete, because the grabbed point is what moves.
- **Two points at once.**
  Each stick can hold its own point (left stick on one vertex, right stick on another), which a mouse cannot do and the lab currently does only with two hands.
  Watching an invariant hold while two vertices move together is a strong demonstration.
- **Scalar parameters.**
  A trigger's analog value drives a `vary` parameter, such as the angle of a line turning through P, or a dilation's k.
- **Steps.**
  The d-pad steps through a construction's witness, matching the lab's next and previous step, and the action vocabulary of triangle-lab's hand poses (next, previous, reset, show or hide formulas) maps onto buttons through the same binding system as the turtle app.
- **Haptics.**
  A short pulse when a `keep…` constraint snaps (the angle clicks to right) gives the snap a physical feel.
- **Virtual pointer** as the fallback for anything else, with magnetism to the nearest knob (`../triangle-lab/src/fit.ts` already has the nearest-knob logic).

### Iterating the API

The API will go through several designs, so iterations need to be cheap to make and easy to compare:

- **A sketchbook as the acceptance test.**
  `geo/sketches/` holds one program per lab lesson and per example in `primitives-api.md` ("the Power of a Point lesson in four lines").
  Each API iteration rewrites the sketchbook; the diff between iterations shows the API's ergonomics directly.
- **Theorems as property tests.**
  For every theorem, a test generates random free-point positions (including near-degenerate ones) and checks that `check` reports a residual near zero whenever the hypotheses hold, and that `enforce` lands on a configuration where they do.
  This catches a wrong formula in the library before a learner sees it.
- **One document per iteration.**
  `geo/api-v1.md`, `api-v2.md`, … record what changed and why, with the sketchbook as evidence; superseded iterations stay for reference.
- **Spike the risks first.**
  Iteration 1 covers only `Point`, `Segment`, `Line`, `Circle`, `Triangle`, two relations, one theorem with all three uses (Thales: `check`, `witness`, `keepRight`), and controller dragging.
  That exercises the live graph, refinement, constraints and drawing end to end before the long tail of methods is written.

## Phases

The two tools proceed in parallel on the shared foundation; each phase ends with something the user can run.

**Phase 0 — foundation (shared).**
Repository layout, `conf.lua`, app switch in `main.lua`, vendor sync with hashes, the `table.unpack` shim, the dual-dialect test runner, `storage.lua`, `camera.lua`, the pure input reader with dead zones, layouts and bindings, and input replay.
Measure the runaway-guard freeze time (done: 0.10 s at 50M instructions).
In luaturtleweb: refactor `turtle_web.lua` into the instance-based host, under its existing tests, with the seeded `math.random` and the command wrapper's recorder hook (unused yet) in place.

**Phase 1 — first light.**
Turtle: scheduler, host wiring, renderer (fills, caps, text, stamps, heads), and the editor's buffer core and view with full keyboard typing, so a program can be written and run in the app from the start, with keyboard shortcuts for run, stop and export.
Both: the pointer's coordinate readout and the numbered grid.
Geometry: API iteration 1 and its sketchbook, the figure graph, the renderer, mouse and controller dragging under constraints.

**Phase 2 — the controller workflow.**
Turtle: controller editing on top of the keyboard editor (token cursor), menu, mapping view, value nudging, line operations, terminal, usage popup.
Geometry: two-stick dragging, trigger parameters, witness stepping, haptics.
Both: the pointing tools (turtle hover and compass, pins, measure, ghost turtle, snapping), and a Steam Deck pass at 1280×800.

**Phase 3 — parity and polish.**
Turtle: command reference with demos (second host instance), Recent and Favorites, share links, on-screen keyboard, packaging for three platforms.
Geometry: API iteration 2, informed by phase 2's sketchbook.

**Experiments — from phase 2 on, alongside the phases above.**
Each starts with a spike that answers its riskiest question, and is dropped or scheduled on what the spike shows.

- Execution trace.
  Spike: can the screen's visibility filters run over an assembled view without editing `screen.lua`, and what does recording cost on the largest demo?
  Then click-ink-to-line, hover-line-to-ink, and the timeline, in that order, since each is useful without the next.
- Blocks and cards.
  Spike: the parser and the round-trip test over every example and demo.
  Then the deck-of-cards view first (it reuses the menu's list navigation and serves the controller), and nested blocks if the deck leaves the mouse wanting.

**Phase 4 — decide on unification.**
By now both apps share input, UI, camera, theme and storage, so the remaining question is product shape: one app with two modes, or one runtime in which a program uses turtles and live figures together.
Decide with the sketchbook and the turtle curriculum in hand.

## Open questions

- Whether learner programs on desktop may call LÖVE directly (the `../love2d_turtle/plan.md` goal), and if so through which whitelist; this widens the sandbox and should be its own spec.
- Whether "export as a LÖVE game" ships a program with the turtle host as a standalone `.love`; the instance-based host makes it straightforward.
- The product name, and therefore the repository name.
- How far the editor goes beyond what the controller workflow needs (multiple files, search, autocomplete).
- Whether the trace stays on all the time (once its cost is known) or is something the learner turns on, and whether scrubbing should eventually rewind a *running* program rather than only the last finished run.
- Whether blocks, if they ship, cover the geometry library too, where a construction's ordered steps map naturally onto a deck of cards.
