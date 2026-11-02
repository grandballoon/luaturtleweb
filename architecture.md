# Architecture — Lua Turtle Web

This repo is the web version of Lua Turtle: Python-style turtle graphics for Lua 5.4, running
in the browser. Lua executes inside a Web Worker via Wasmoon (Lua compiled to WASM); the main
thread renders to a Canvas2D element. User code is fully synchronous from its own point of
view — `forward(100)` animates and returns — even though rendering happens on another thread.

```
Main thread (app.js)                         Web Worker (worker.js)
┌──────────────────────────┐   postMessage   ┌───────────────────────────────┐
│ CodeMirror editor        │ ──── run ─────► │ Wasmoon (Lua 5.4 in WASM)     │
│ Renderer (renderer.js)   │ ◄─── frame ──── │  turtle_web.lua → host.lua    │
│ Canvas2D + commit canvas │                 │   ├─ core.lua  (state machine)│
│                          │  SharedArray-   │   └─ screen.lua (segment log) │
│ Atomics.notify ──────────┼──── Buffer ────►│  Atomics.wait (blocks worker) │
└──────────────────────────┘                 └───────────────────────────────┘
```

Layer boundaries, top to bottom:

| Layer | File | Role |
|---|---|---|
| Markup | `index.html`, `styles.css` | Static page structure and styling; no inline script |
| UI shell | `app.js` | The editor page: draft autosave + share links, what a run shows (status, terminal, error marks), shortcuts |
| Runs | `runner.js` | The main thread's half of the frame protocol: the worker, the run state machine, run ids, frame ack, Stop; shared by both pages |
| Editor | `lua-editor.js` | The CodeMirror editor both pages write Lua in |
| Library page | `library.html`, `library.css`, `library-page.js`, `library.js`, `library/` | `/library`: example programs by concept, with preview videos, run on a canvas with their code beneath (see [The library](#the-library-library)) |
| Compsci page | `compsci.html`, `compsci.css`, `compsci-page.js`, `compsci.js`, `compsci/` | `/compsci`: the mathematics of a computer science degree, course by course, each concept with its equations and the library examples that show it (see [Computer science](#computer-science-compsci)) |
| Creative page | `creative.html`, `creative.css`, `creative-page.js`, `creative.js`, `creative/` | `/creative`: creative coding credited to its artists, each work with the math in its picture and its code, its license, the concepts it draws on, and our turtle versions (see [Creative coding](#creative-coding-creative)) |
| Browsing | `browse.css`, `example-stage.js`, `example-cards.js` | What `/library`, `/compsci` and `/creative` share: their layout, the stage that runs an example with its code beneath, and the example cards with their previews |
| UI panels | `dock.js`, `terminal.js`, `splitter.js`, `canvas-view.js`, `command-reference.js`, `command-preview.js`, `usage-popup.js`, `command-lookup.js`, `lessons-panel.js` | A collapsible, resizable panel docked under a column; the output panel under the canvas; editor/canvas divider; canvas toolbar + pan/zoom gestures; searchable command reference, docked under the editor; the reference's miniature demo player (its timing and fit in `recording.js`, pure); a command's example calls in a popup; Cmd/Ctrl+click on a command to show them; the Lessons sidebar over the editor |
| Lessons | `lessons.js`, `floating.js`, `turtle/lessons.lua` | The Lessons sidebar's pages, steps, contents and key moves, and where its floating window sits, as pure functions; the lessons themselves as data, with a runnable, step-by-step program per example |
| Controller | `gamepad-controller.js`, `gamepad-input.js`, `gamepad-layout.js`, `gamepad-bindings.js`, `gamepad-menu.js`, `gamepad-mapping.js`, `command-catalog.js`, `recent-commands.js`, `favorites.js` | Working the app with a game controller: the functions a button can do; reading presses; the controller's buttons and drawing; which function each button is mapped to; the menu of commands; the view that shows and changes the mapping; the reference's commands as data; the recently used list; favorites in categories |
| Highlighting | `lua-highlight.js` | The turtle-command pattern the editor highlights, and editor-identical highlighting for code shown outside it |
| Renderer | `renderer.js` | Canvas2D drawing, viewport math (zoom/pan), grid, PNG export |
| Preferences | `storage.js` | `localStorage` wrappers that never throw |
| Worker bridge | `worker.js` | Wasmoon boot (mounting a fixed list of Lua files, which `test/worker_files_test.mjs` checks covers everything `turtle_web.lua` requires), frame protocol, sandbox run, error mapping |
| Execution host | `turtle/host.lua`, `turtle/random.lua`, `turtle/plane.lua` | Animation pacing, undo orchestration, tracer, API/globals, sandbox env; one instance per program, shared with the LÖVE desktop app; each program's own seeded `math.random`; the coordinate plane the canvas shows, and graph paper and curves drawn on it |
| Web adapter | `turtle/turtle_web.lua` | Holds the worker's current host instance and exposes it as the `_bridge_*` globals `worker.js` calls |
| Argument checks | `turtle/args.lua` | Validates every public command's arguments; learner-readable errors |
| Usage examples | `turtle/examples.lua` | Hardcoded example calls per command, shown when a call is rejected or a command is Cmd/Ctrl+clicked |
| Reference demos | `turtle/demos.lua` | A demo program per command-reference entry, played in the reference's detail pane |
| Command catalog | `turtle/catalog.lua` | The reference's sections and entries as data, with a runnable call per entry; read by the LÖVE desktop app's controller menu and mapping, kept identical to `index.html` by `test/catalog_test.lua` |
| Core | `turtle/core.lua`, `turtle/screen.lua` | Pure turtle state machine + shared segment log (verbatim from the desktop repo) |
| Data | `turtle/colors.lua` | 140+ CSS/SVG named colors |

All paths in that table are relative to `public/`, which is the published site root.

`core.lua`, `screen.lua`, and `colors.lua` are shared verbatim with the desktop
(Cairo/SDL2) implementation. The segment log shape **is** the contract between the Lua side
and the renderer — there is deliberately no `Renderer` interface or adapter layer.

---

## Main data structures

### The segment log (`screen.segments`)

The central structure. An **append-only list** of plain records describing everything ever
drawn, shared by all turtles on a screen:

```lua
{ type = "line",  turtle_id = 1, from = {x0,y0}, to = {x1,y1}, color = {r,g,b,a}, width = 2, _log_index = 7 }
{ type = "fill",  turtle_id = 1, vertices = {{x,y}, ...}, color = {r,g,b,a} }
{ type = "dot",   turtle_id = 2, pos = {x,y}, size = 8, color = {...} }
{ type = "text",  turtle_id = 1, pos = {x,y}, content = "hi", align = "left", font = {...} }
{ type = "stamp", turtle_id = 1, id = 3, pos = {x,y}, heading = 45, color = {...}, fill_color = {...} }
{ type = "clear", turtle_id = 2 }   -- marker, never drawn; a per-turtle erasure boundary
```

Key properties:

- **Append-only.** Nothing is ever removed. `clear`, `clearstamp`, and `undo` all work by
  *marking* rather than deleting (see the visibility pipeline below). This makes per-turtle
  operations safe when multiple turtles' segments are interleaved in one log.
- **Tagged.** Every entry carries `turtle_id` (stamped by `Core:_log`) and `_log_index`
  (stamped by `Screen:_append`), enabling per-turtle filtering and undo-by-index.
- **Renderer-neutral.** The records contain only geometry and color in turtle space
  (center origin, y-up, degrees). The Canvas2D renderer and the desktop Cairo renderer both
  consume this exact shape.
- **In world units.** Positions are in whatever units the program's coordinate plane uses
  (see [The coordinate plane](#the-coordinate-plane-planelua)); the host projects them to
  pixels on the way out, so renderers only ever see pixels.

This is essentially **event sourcing**: the log is the source of truth, and the visible
picture is a projection computed from it.

### Per-turtle state (`Core` instance)

One `Core` per turtle: position (`x`, `y`), heading (`angle`, degrees CCW, 0 = east), pen
state (`pen_down`, `pen_color`, `pen_size`), fill state (`filling`, `fill_vertices`,
`fill_color`), `visible`, `speed_setting`, and the undo machinery. Cores hold a reference to
their shared `Screen` and append to its log; they contain **no rendering or platform code**,
which is what lets the same file run under Wasmoon here and under the desktop C binding.

### Shared screen state (`Screen` instance)

- `segments` — the log above
- `turtles` — ordered registry of Cores; registration assigns `turtle_id` (1-based index)
- `bg_color` — background, owned by the Screen (not any turtle), matching Python turtle
- `_cleared_stamps` — a **set** (`stamp_id → true`) of stamps erased via `clearstamp(s)`
- `_next_stamp_id` — global counter guaranteeing unique stamp IDs across turtles

### Undo stack (`core._undo_stack` + `core._hidden_indices`)

Each undoable command pushes a snapshot **before** running (`_push_undo`) and records the log
indices it added **after** running (`_commit_undo_segments`). A snapshot holds the full
per-turtle state (position, heading, pen, fill), the pre-command log length, plus the bits of
shared screen state a command might touch (`bg_color`, a copy of `_cleared_stamps`,
`_next_stamp_id`). The stack is bounded (`setundobuffer`, default 1000) and drops oldest
entries FIFO.

`_hidden_indices` is a set of log indices hidden by undo — the companion structure that lets
undo "remove" segments without truncating the shared log.

### The frame SharedArrayBuffer (`sab`)

An 8-byte `SharedArrayBuffer` viewed as two `Int32` slots, created per Run by the main thread:

- `sab[0]` — **frame ack**: worker blocks on it with `Atomics.wait`; main thread stores 1 and
  `Atomics.notify`s after rendering; worker resets it to 0.
- `sab[1]` — **stop flag**: set to 1 when Stop is clicked; the worker checks it after each
  wake and throws a sentinel error (`__STOPPED__`) to unwind user code.
  The main thread never clears it; the worker does when it picks up the next `run` message.
  That is what makes Run-while-running a clean restart: the old run sees the flag and unwinds before the new message is dequeued.

Every run carries a `runId` that the worker echoes on `print`, `done`, and `error`.
The main thread drops replies whose id isn't the current run, so a replaced run can't overwrite the status or terminal.
`frame` messages are always rendered and acked regardless of id, because the worker blocks until it gets the ack.

This is the entire cross-thread synchronization surface. Frame *data* (segments, turtle
states, bgcolor) travels via ordinary structured-clone `postMessage`; only the *handshake*
uses shared memory.

### Renderer structures (`renderer.js`)

- **Commit canvas** — an offscreen canvas holding all committed segments. Each frame redraws
  it in full from the visible segment list, then composites it over the background/grid and
  draws live turtle heads on top. Separating "durable ink" from "overlay" keeps turtle heads
  and the grid from smearing into the drawing, and makes PNG export trivial.
- **Viewport** — `viewScale` + `viewCenterX/Y` in turtle coordinates, with zoom clamped to
  [0.05, 20]. All drawing goes through `screenX/screenY`, which fold in the viewport and the
  turtle→screen transform (`screen_x = w/2 + (tx − cx)·s`, `screen_y = h/2 − (ty − cy)·s`).
  Device-pixel-ratio scaling is applied once via `setTransform` so drawing code works in CSS
  pixels.

### The host instance (`Host.new`)

`host.lua` returns `Host.new(opts)`: an instance owning its own screen, turtles, tracer state and sandbox env, so one Lua VM can run several programs without them touching.
The web runs one at a time; the LÖVE desktop app (see `spec-love-port.md`) runs the learner's program and a reference demo side by side.
`opts` carries what differs between hosts: the canvas size, `post_frame(delay_ms)` (the web blocks on the main thread's ack; the desktop yields a coroutine), `print`, a `seed`, and `on_command`.
`turtle_web.lua` is the web's adapter: `_bridge_hard_reset` makes a new instance per Run, and the other `_bridge_*` globals read from it.

`on_command(record)` is called after every public command with `{ name, turtle_id, first, last }`: the name as typed and the range of log indices the command appended.
Nothing uses it yet; it is the hook point for the execution trace the desktop spec plans, and with no `on_command` the host does no extra work.

### The coordinate plane (`plane.lua`)

Turtles live in world units.
Until a program says otherwise a world unit is a pixel, with (0, 0) at the canvas's center and y up.
`setworldcoordinates(left, bottom, right, top)` makes the canvas show that rectangle of the world, as Python turtle's does, and `graph(left, bottom, right, top[, "stretch"])` puts the rectangle across 80% of the canvas, with a unit as long up as across unless stretched, leaving a margin for the axes' numbers.
Every other command then speaks those units: `setpos(3, 14)` goes to the point (3, 14) of the graph.
As in Python, only positions scale; pen widths, dot sizes and fonts stay in pixels.
Unlike Python's, changing the world keeps the drawing, which moves to its new place.

The host keeps one plane per instance, `{ view, paper }`: the world rectangle the canvas shows (nil for the standard plane) and the rectangle graph paper covers.
The segment log, the turtles and undo snapshots all stay in world units.
`host.visible_segments()` and `host.turtle_states()` run them through `Plane.project` and `Plane.project_turtles`, which return pixel copies (a stretched heading turned to how it looks), so neither renderer, the frame protocol, nor anything else a shell reads changed.
The standard plane returns them untouched.
Animation pacing measures a step in the pixels it covers, so a world unit of any size animates as smoothly as a pixel.

`axes()`, `plot(f)` and `mark(x, y)` draw graph paper, the curve y = f(x), and a labeled dot.
`plane.lua` computes them as segment records (grid lines at multiples of each step, axes through 0 or along the nearest edge, numbers nudged a few pixels off their axis, curves sampled at 201 points and clipped to the paper), and the host logs those records straight from the turtle's core inside one `with_undo`.
So each is one undo step, carries its turtle's id, and leaves the turtle and its pen where they were.
`plot` posts a frame every few pieces, like `circle`.
A rule only running can check (too many grid lines, a function that returns a string) is rejected through `args.fail`, so the learner still sees how the command is called.
`test/plane_test.lua` checks the pure functions by equality and the commands on a host.

`host.lua` runs on Lua 5.4 and LuaJIT alike, and shims `table.unpack` (missing in LuaJIT) before loading the core, so the shared files stay verbatim.
`sh test/run.sh` runs every Lua suite under both `lua` and `luajit`.

### The sandbox environment (`host.env()`)

User code is loaded with `load(code, "user_code", "t", env)` where `env` is a fresh table
exposing a whitelisted Lua stdlib subset (`math`, `string`, `table`, `pairs`, `pcall`, …) and
the full turtle API — but not `require`, `io`, `os`, `debug`, or the module internals. Built
fresh per Run, so nothing leaks between runs.

The env's `math` is a copy whose `random` and `randomseed` belong to the instance (`random.lua`), seeded from `opts.seed` (or the clock) and recorded as `host.seed`.
Lua's own generator is one per VM and differs between Lua 5.4 and LuaJIT; this one gives each program its own sequence, identical on the web and the desktop for the same seed, so a run can be reproduced exactly.

### The command table (`TURTLE_COMMANDS`, `SCREEN_COMMANDS`)

Every public command is declared once in `host.lua` as `{ check, run }`, plus an `ALIASES` map (`fd` → `forward`, …).
The module-level globals, each `Turtle()`'s method table, and the sandbox env are all generated from these tables, so they cannot drift apart.
`TURTLE_COMMANDS` act on one turtle (globals on the default core, methods on their own); `SCREEN_COMMANDS` (`bgcolor`, `tracer`, `update`, `Turtle`, …) are globals only.

---

## Main algorithms

### The frame protocol (synchronous animation across threads)

The WebTigerPython pattern. Each animation substep in the worker:

1. Lua calls the JS global `_bridge_post_frame(delayMs)`.
2. JS pulls the current visible segments, turtle head states, bgcolor, and buffered `print`
   output from the Lua VM and `postMessage`s a `frame` to the main thread.
3. JS calls `Atomics.wait(sab, 0, 0)` — **the worker (and the user's Lua program) blocks**.
4. The main thread's `onmessage` renders the frame, then stores 1 into `sab[0]` and notifies.
5. The worker wakes, resets the ack, sleeps `delayMs` (speed-based pacing, implemented as an
   `Atomics.wait` timeout on a throwaway buffer — workers have no synchronous sleep), then
   checks the stop flag and throws if set.

The result: user code is written as ordinary blocking Lua, the page never freezes, and every
frame is rendered before the program proceeds — the same observable behavior as the desktop
version's `render(); sleep()` loop. This requires cross-origin isolation, hence the
COOP/COEP headers in `_headers` (SharedArrayBuffer is unavailable without them).

### The visibility pipeline (`Screen:visible_segments`)

The projection from the append-only log to "what should be on screen," composed of three
independently testable filters:

1. **`_segments_after_clears`** — scan the log for each turtle's most recent `clear` marker,
   then drop that turtle's segments at or before its boundary. One turtle's `clear()` never
   touches another turtle's ink, even when interleaved.
2. **`_filter_cleared_stamps`** — drop `stamp` segments whose `id` is in the cleared-stamps set.
3. **`_filter_undo_hidden`** — union every turtle's `_hidden_indices` and drop segments whose
   `_log_index` is in it.

The renderer then makes one more ordering pass: all `fill` polygons are painted first, then
lines/dots/text/stamps, so strokes always sit on top of fills.

### Undo (snapshot + index marking)

`with_undo(core, fn)` wraps every user-visible command: push snapshot → run → commit the
added indices. `Core:undo()` pops the snapshot, adds the recorded indices to
`_hidden_indices`, truncates `fill_vertices` back to the snapshot count, and restores the
state fields. Because Lua execution is single-threaded, every log index between the
pre-command count and the post-command count is guaranteed to belong to that one command —
no locking or ownership bookkeeping needed. Marking (rather than truncating) is what makes
undo correct for interleaved multi-turtle programs. The web host does instant undo; animated
undo (visual line reversal) is a desktop-host feature.

### Animation pacing: speed → substeps

`_forward` and `_right` break one command into substeps and post a frame after each:

- Step size grows exponentially with speed: `step = max(1, floor(2^(speed/2.5)))` pixels (or
  degrees for turns) — higher speed means fewer, larger substeps, so fewer frames.
- Per-frame delay shrinks geometrically: `delay = 0.023 · 0.65^(speed−1)` seconds.
- After the last substep, the turtle is set to the exact end position or heading, since the substeps' rounding errors add up (`forward(50)` would otherwise end at `x = 49.999999999999993`). `test/motion_test.lua` checks animated and instant moves end in the same place.
- `speed(0)` means instant: the whole command runs as one step with one frame.

`circle(radius, extent, steps)` uses Python turtle's polygon approximation: default
`steps = max(4, floor(|extent|/6))`, each chord drawn as *turn half / forward chord / turn
half*, with chord length `2·|r|·sin(step_angle/2)`. The host posts frames every
`step_size_for_speed(speed)` chords rather than every chord.

### Tracer batching (`tracer(n)` / `update()`)

A frame-rate gate matching Python turtle: `n = 1` posts every substep (default), `n = 0`
suppresses all automatic frames until an explicit `update()`, `n > 1` posts every n-th
completed command (a modulo counter) and skips substep animation entirely. After user code
finishes, `worker.js` posts a final frame **unless** `tracer(0)` is active — under
`tracer(0)` the user must call `update()`, exactly as in Python.

### Runaway-code protection

Before running user code, the worker installs a `debug.sethook` count hook (every 1000 VM
instructions) that errors out past 50M instructions — turning infinite loops into a
catchable error instead of a dead worker. Stop works even mid-`Atomics.wait` because the main
thread both sets the stop flag and notifies the futex, waking the worker into its flag check.
The same hook also polls the stop flag every 10,000 instructions, so Stop interrupts code that never posts a frame.

User code runs under `xpcall` with a handler that records the innermost `user_code` line on the stack.
Errors raised inside the turtle library (a bad argument, say) therefore still point at the learner's line, which the UI highlights and links from the terminal.

### Argument checking (`args.lua`)

Lua would otherwise accept a malformed call silently: `circle(radius)` with `radius` never set passes `nil`, and the command did nothing while later lines kept running.
Every call now goes through `args.check(name, check, ...)` before its implementation runs.
A command's `check` function consumes the arguments in order through a cursor (`a:req`, `a:opt`, `a:point`, `a:opt_color`); anything left over is an error, so a command with no `check` takes no arguments.
Counting with `select("#", ...)` is what tells "missing" (`circle()`) apart from "passed nil" (`circle(radius)`).
Required parameters reject `nil`; optional ones accept it, as usual in Lua, so `circle(50, nil, 8)` skips `extent`.
Checks run before `with_undo`, so a rejected call leaves no undo entry and draws nothing.
Errors are raised at level 0 and name the command as the learner typed it, alias included:

```
circle: radius must be a number, got nil
fd: distance is missing
pencolor: color must be a known color name, got "rde"
penup takes no arguments, but got 1
forward: call a turtle's commands with a colon, like t:forward(...)
```

The checks live in the web host rather than `core.lua`, which stays verbatim with the desktop repo.
`test/args_test.lua` covers them and runs with plain `lua` from the repo root: `lua test/args_test.lua`.
The other suites in `test/` run the same way.

### Usage examples

A popup in the editor shows example calls of a turtle command in two cases.
When a command rejects its arguments, it appears under the learner's line.
When the learner Cmd+clicks (Ctrl+click off macOS) a command they have written, it appears under that name.
The pieces, each with one job:

- **`args.lua` says which command failed.** Every rejection records `{ command, message }` in `args.last_failure` before raising; `args.failed_command(err)` returns the command only if `err` is that exact message.
  So a runtime error, a stop, the learner's own `error()`, or a rejection they caught with `pcall` never picks up examples.
- **`examples.lua` holds the examples.** Pure data, keyed by the command's own name, with up to three calls each.
  This is the file to edit when iterating on the examples; the tests run every example, and check that every command and alias has some.
- **`host.lua` maps the command to its examples.** `Host.command_usage(err)` (exposed to the worker as `_bridge_command_usage`) resolves an alias to its command (`fd` → `forward`) and returns `{ command, examples }`, or nil.
  `_bridge_get_usage_catalog()` returns the same for every command and alias, keyed by the name typed.
- **`worker.js` carries them.** Its `xpcall` handler records the usage alongside the error line, and the `error` message gains `usage`.
  The `ready` message carries the whole catalog once, so lookups never need a round trip to the worker (or wait for a run to finish).
- **`command-lookup.js` finds the clicked command.** It checks the catalog for the word under the pointer, and only where that word is called (`name(`, `t:name(`), outside comments and strings.
  While the modifier is held, the command under the pointer is underlined.
  A modifier+click anywhere else falls through to CodeMirror, which adds a cursor.
- **`usage-popup.js` displays them.** It builds the popup and places it with CodeMirror's `addWidget`, so it scrolls with the code and floats over later lines without moving them.
  `app.js` shows it from `markError` and from a lookup, and hides it on Run, or on Esc or its close button; the header says that Esc closes it.
  An error's popup stays up while the learner clicks into the line and edits it, so the examples stay in view during the fix; a bookmark moves it with its line, and it closes only if that line is deleted.
  An edit still clears the error highlight itself.
  A lookup's popup is transient: it also closes on the next click in the editor outside it, and on any edit.

### Command reference demos

The command reference (`command-reference.js`) lists only signatures, each with buttons at the row's right edge to insert it into the editor or copy it, shown only once the learner clicks or arrows to that row.
The selected entry (the first match, until the learner picks another) fills a detail pane: its description, a demo program (with buttons to copy it, or insert it into the editor below the caret's line), and a miniature canvas playing that program on a loop.
Demos are off until the learner turns them on, with the Demos toggle in the reference's header or ⌘⇧D (Ctrl+Shift+D elsewhere), and the choice is saved in `localStorage`.
Off, the detail pane shows only the description, with a note saying how to turn them on.
The pieces, each with one job:

- **`index.html` holds the entries.** Each is `<li><code>signature</code><span class="api-about">description</span></li>`; the description is hidden in the list and read by the search and the detail pane.
- **`demos.lua` holds the demos.** Pure data, keyed by the entry's signature exactly as the list shows it.
  `test/demos_test.lua` checks that the keys and the list match both ways, and that every demo runs.
- **`worker.js` records a program.** A `record` message runs code through the same `execute()` path as a run, but `_bridge_post_frame` appends a snapshot to a list instead of posting it and blocking: `{segments, turtles, bgcolor, prints, work, delay}`, where `work` is the time spent computing since the previous frame and `delay` is the speed-based pause after it.
  The list starts with the blank canvas and is posted back whole as `recording`.
  The `ready` message carries the demos, as it carries the usage catalog.
- **`command-preview.js` plays a recording.** It owns a second `worker.js` instance, so recording never waits behind (or disturbs) the learner's own run, and a second `Renderer` on the miniature canvas.
  The worker starts with the first demo shown, so with demos off no second Lua VM loads.
  Playback spaces frames as a live run would (`work`, then the frame, then `delay` plus a small round-trip allowance), rendering at most one frame per display refresh, and reveals `print()` output under the canvas as the frames that printed it go up.
  The view is centered on the drawing's bounds and scaled down (never up) to fit; a recording is cached per program and canvas size.
  Demos run at the real canvas's size, so `screen_width()` reports what a run would.

Because both the recording and the drawing go through the production code paths, a demo looks exactly like the same program run on the real canvas, zoomed out.
The timing and the fit are pure functions in `recording.js` (`frameTimes`, `frameAt`, `drawingBounds`, `fitView`), shared with the library's preview recorder and covered by `test/recording_test.mjs`.

### The library (`/library`)

`/library` is a second page: a gallery of short programs that draw mathematical functions, or something beautiful made from one, grouped by the concepts they show.
Nothing links to it from the editor page yet.
A sidebar holds a search bar and the concepts; the gallery shows a card per example, with its name, a preview video that plays on hover, and a button that runs it on the page's canvas; beneath the canvas, the program sits in a collapsible editor, where it can be changed and run again, or opened in the editor page through a share link.
The page's link names the example on the canvas (`/library#rose-curve`).

Concepts and examples are many to many: an example lists every concept it shows, and appears under each of them.
Searching drops the grouping for one list of results, best first: a word in the name ranks above one in a concept's name, above one in the description, and every word must match somewhere.
A selected concept narrows either view to its examples.

The pieces, each with one job:

- **`library/catalog.json` names the examples.** Pure data: the concepts `{id, name, about}`, in the order the sidebar and gallery show them, and the examples `{id, name, about, concepts}`.
- **`library/programs/<id>.lua` holds each program,** as the learner sees it in the editor: a comment naming it and saying what it shows, then code that sizes itself to the canvas.
  Each is fetched when its example is first run, so the gallery loads with the catalog alone.
- **`library/previews/` holds each example's preview,** `<id>.mp4` (a few seconds of H.264, 480×360) and `<id>.webp` (the finished drawing, shown until the video plays), and `manifest.json`, which records the hash each was made from.
  They are made by `tools/library-previews.mjs` (below), never by hand.
- **`library.js` decides.** Pure functions of the catalog: the gallery's sections for a search and a concept, the concepts' counts, the example a link names, and where an example's files are.
- **`library-page.js` is the shell.** It renders what `library.js` returns, keeps the search and the link, and hands the rest to two modules it shares with `/compsci`.
- **`example-cards.js` makes the cards.** It shows each card's poster as it nears the view and plays its video, loaded then, only while the mouse is over the card or it has keyboard focus (one at a time, and none under `prefers-reduced-motion`), so a page of cards decodes no video until one is pointed at.
  Cards are kept across renders by a key the page gives them, so a search never reloads a video.
- **`example-stage.js` runs them.** The canvas, the program in its collapsible editor (its dock, `dock.js`), the header's Run, Stop and Open in editor controls and status, and running through `runner.js`; the page hears of each example shown through `onShow`.
- **`browse.css` lays both pages out:** sidebar, main column, and the stage; `library.css` adds the concept list and the gallery's sections.

The previews are made faithfully, the way the command reference's demos are played.
`tools/library-previews.mjs` starts the dev server and loads its dev-only recorder page, `dev/library-recorder/`, in headless Chromium through Playwright.
The recorder records the program with `worker.js`'s `record` message on an 800×600 canvas, draws each frame with the real `Renderer`, fitted to a 240×180 canvas at 2× pixel density, and hands the frames back as PNGs, which the tool pipes into `ffmpeg`.
It draws off the clock: `recording.js`'s `videoFrames` picks the frame for each tick of a 30 fps video from the program's own pacing, stretched to last at least 4 s or squeezed to at most 8 s, so every video is the same on any machine.
A program that posts more frames than a recording keeps (`MAX_RECORDED_FRAMES`) is rejected; batching its frames with `tracer(n)` fixes it, and keeps its live run quick too.

`npm run previews` remakes the previews whose program, or the tool's settings, changed since they were made; `--all` remakes every one, and naming ids remakes just those.
It needs `npm install` (Playwright and its Chromium) and `ffmpeg` on the `PATH`.

`test/library_test.lua` runs every program on the host at two canvas sizes, checking that it draws inside the canvas, like the Lessons' test (both use `test/program_check.lua`).
An example that lists no concept is in the catalog for `/compsci` but left out of the gallery.

`test/library_test.mjs` covers `library.js`, checks that the catalog's concepts and examples are consistent and that its examples and the program files match both ways, and fails while any preview is missing or stale.

To add an example: write `library/programs/<id>.lua`, add it to the catalog with its concepts, and run `npm run previews`.

### Computer science (`/compsci`)

`/compsci` is a third page: the mathematics of a computer science degree, laid out along the math and computer science courses of Scott H. Young's MIT Challenge, in its order.
It covers concepts, not lectures: each concept has a plain summary, its key equations (each with what it says), everyday metaphors for it and where it is used, the earlier concepts it builds on, the library examples that show it, and the open sources it was checked against.
Nothing is copied from any course or book; [spec-compsci.md](spec-compsci.md) has the courses, the sources and their licenses, and the plan.
The page's link names a course (`/compsci#18-06`) or a concept (`/compsci#eigenvalues`).

The sidebar lists the courses, with the selected course's units under it; the main column shows that course, unit by unit, or a search's results across every course.
An example runs on the same stage as the library's, and a course that is not written yet says so.

- **`compsci/courses.json` lists the courses** in order, `{id, number, name, about, syllabus: {label, url}, sources}`, and **`compsci/courses/<id>.json` holds each course's units and concepts** (`{"units": []}` until it is written).
  **`compsci/sources.json`** lists the references with their licenses.
- **`compsci.js` decides.** Pure functions of those and the library's catalog: what a link names, a course's view, what a search finds and how it ranks, and each course's coverage.
- **`compsci-page.js` is the shell.** It loads the data, renders what `compsci.js` returns, renders each equation with KaTeX, and uses `example-stage.js` and `example-cards.js` as the library does.

`test/compsci_test.mjs` covers `compsci.js`, keeps the courses in their order, checks that every id is unique and every reference names something that exists (a concept builds only on concepts in earlier courses), and renders every equation with the page's KaTeX.
`npm run coverage` lists each course's concepts that have no example, metaphor or application yet.

To add a course's concepts: fill `compsci/courses/<id>.json`; an example a concept needs is written for the library first, and may list no library concept.

### Creative coding (`/creative`)

`/creative` is a fourth page: beautiful creative coding, such as flow fields, Truchet tiles, Substrate and Fourier epicycles, each credited to its artist with its context, the math in its picture and in its code, its license, and the library and curriculum concepts it draws on.
It is kept apart from `/library` and `/compsci`, and ordered by kind of art; [spec-creative.md](spec-creative.md) has the data, the plan for turtle versions, and the cross-page index planned after them.
The page's link names a group (`/creative#patterns`) or a work (`/creative#substrate`).

- **`creative/works.json` holds the works** in groups, in order.
- **`creative.js` decides.** Pure functions of the works, the library's catalog and the curriculum: what a link names, each work as shown, whether its license lets us port its code, what a search finds, and coverage.
- **`creative-page.js` is the shell.** It loads the data, renders what `creative.js` returns, and uses `example-stage.js` and `example-cards.js` as the other pages do.

`test/creative_test.mjs` covers `creative.js` and checks that every work is credited and whole, every license is one the page knows, and every example and concept it names exists.
`npm run coverage` also lists the works with no turtle version yet.

### Lessons sidebar

The Lessons button (⌘⇧L, Ctrl+Shift+L elsewhere) pops a sidebar up over the editor column that teaches the Linear Equations and Quadratic Equations chapters of Triangle Lab, after chapters 3 and 6 of The Art of Problem Solving, Volume 1.
Each page is one example: what it is about, its program step by step (each step a chunk of the program with its line numbers, and what that chunk does), and then the whole program, which the learner can run on the canvas, open in the editor, or copy.
The sidebar is docked over the editor column, or detached into a window that floats over the page, so a learner can read it beside the editor while typing a program in by hand.
The floating window is dragged by its header and resized from any of its edges or corners, so it can be widened leftward to show long lines of code even when it sits against the right of the window.
A lesson's first page opens with what the lesson is about, everyday things its idea is like ("Think of it as"), and what it is used for ("Used for"), as /compsci does for a concept.
Every lesson shows its idea both ways: on a Cartesian graph ("On the plane") and as turtle geometry, with headings, walks and vectors ("With the turtle"), and word problems are worked both ways too.
The pieces, each with one job:

- **`turtle/lessons.lua` holds the lessons.** Pure data: chapters, lessons, and examples; each lesson with its metaphors and applications, `{name, says}` lists, and each example with its text and a whole program.
  Plane examples start with the turtle library's own `graph()` and `axes()`, then draw in the graph's coordinates with `plot`, `mark`, `teleport` and `setpos`, so every program runs on its own and is the code a learner could write.
  A program is written as its own tutorial: `--:` lines at the left edge explain the chunk below them, and `tutorial()` splits each program at those lines into `steps` when the file loads, taking the lines out of the program.
  The explanation sits right above the code it explains, so the two are edited together.
  A step marked `--::` shows folded; no lesson uses that now.
  `test/lessons_test.lua` checks the shape, that every lesson has at least two metaphors and two applications, each named and saying something, that a plane example's first step starts with `graph(`, that each step's chunk is found at its line and that the steps cover the whole program, and runs every program on the host at two canvas sizes, checking that it draws inside the canvas.
- **`worker.js` carries them.** `turtle_web.lua`'s `_bridge_get_lessons` loads the data, and the `ready` message sends it once, as it does the demos; the host itself never loads it.
- **`lessons.js` decides.** Pure functions turn the chapters into a flat list of pages and say which page a move or key leads to, where a page sits in its lesson, what a lesson's first page opens with, what the contents list, and which parts of a paragraph are `code`.
  `test/lessons_test.mjs` covers it.
- **`floating.js` decides where the detached window sits.** Pure functions of the window's size give its first box, and the box after a drag, a resize by any edge or corner, or the window shrinking; every box they return fits the window.
  A resize moves only the edges held, and stops each at the window's margin or where the box would get smaller than its minimum.
  `test/floating_test.mjs` covers it.
- **`lessons-panel.js` is the shell.** It renders what `lessons.js` returns, opens and closes, docks and detaches, applies the boxes `floating.js` returns while the header or an edge or corner handle is dragged (each handle names its edges in `data-edges`), remembers the page by its id and where the window sits in `localStorage`, and turns the page on ←/→, Page Up/Down, Home and End while focus is inside it.
  Esc closes it from inside, like the reference.
- **`app.js` runs the programs.** A page's Run starts a normal run with the page's code, without touching the editor; its errors go to the terminal with the lesson program's line, and never mark an editor line.
  Open in editor replaces the editor's text with `setValue`, which the editor's undo reverses; when docked, the sidebar also closes so the code is in view.

Docked, the sidebar covers only the editor column, so the drawing is always in view while the learner reads about it.
Detached, it is `position: fixed` and stays where it was left, above the canvas's own overlays.
Its resize handles sit mostly outside its border, so they never take a grab meant for its scrollbar.

### Panels

Each column has a panel docked along its bottom: the command reference under the editor, and the terminal under the canvas.
The reference is open when the page loads, so the commands are always in view beside the code they go into, and the drawing is never covered.
The boundaries:

- **`dock.js` owns a panel's frame:** collapsing it to its header, resizing it by dragging the header, and its saved height.
  `dockHeight` decides the height from the panel's state, as a pure function; the rest is the shell that measures, stores, and applies it.
  It knows nothing about what the panel holds.
- **`command-reference.js` owns what the reference is:** its query, selection, and whether it's open.
  Opening and closing it open and collapse its dock, and the dock reports the learner collapsing or opening it from the header, which the reference treats as closing or opening.
  The page load opens it without taking focus from the editor.
  Its shortcut, ⌘K (Ctrl+K elsewhere), is labeled in its header and moves focus between the editor and the search bar, opening the reference if it's collapsed but never collapsing it.
- **`terminal.js` owns the output:** print output, errors, and hints, in its dock.
  Output that arrives while it's collapsed marks it unread, and an error opens it.

The reference stays open through a run, and Esc closes it only while focus is inside it, so Esc in the editor still stops a run.
The reference is a size container, so its layout adapts to whatever height its panel is dragged to by container queries alone.

### Game controller

A controller works the app through the browser's Gamepad API: a menu in a corner of the canvas lists the reference's commands, and each button is mapped to a function.
The menu has the reference's sections, a Recent page with the five commands inserted most recently, and a Favorites page of categories the learner makes and saves commands into.
A command is inserted exactly as the reference inserts it: its signature, on a new line below the caret.
The boundaries:

- **`gamepad-input.js` reads the controller.** It polls once per frame while one is connected and reports presses, repeats while a button is held, and releases, like the keyboard does for keys.
  The left stick counts as the d-pad, and every connected controller is read as one.
  A browser only reveals a controller once a button is pressed, so whatever is down when one first shows up is ignored until it's released.
  It knows nothing about what a button does.
- **`gamepad-layout.js` is the controller, as data:** each button's index in the W3C standard mapping, its name, the short label shown wherever it is named, and its shape in the drawing.
  Only the Xbox 360 layout exists; another controller is another object of the same shape, and nothing else knows what a controller looks like.
- **`gamepad-bindings.js` owns the mapping:** button → function id, or nothing, saved in `localStorage`.
- **`gamepad-controller.js` owns the functions** and sends each press to the one its button is mapped to.
  A function is `{ id, label, group, run }`: working the menu (move, select, back, previous and next group, save to favorites, show recent, show favorites), the program (run, stop, undo, redo), and one per command in the catalog, which inserts it.
  So a button can open the menu or be a command outright, and both are the same thing to the mapping.
  A function that works the menu opens it instead when it's closed.
- **`gamepad-menu.js` owns the menu:** a stack of pages, each a list of rows with one selected.
  Saving a command, and renaming or deleting a category, are pages too, so everything is reached the same way with the same few buttons.
  It never reads the controller; its owner calls `move`, `select`, `alt`, `back`, `sibling`, and `show`, and rows can be clicked.
  It never takes focus from the editor, so the caret marks where an insert will land; typing a category's name is the one exception.
- **`gamepad-mapping.js` owns the mapping view:** the drawing, a legend of what each button does, and the list of functions to give the selected button.
  While it's open, presses go to it rather than to functions, and the layout's `nav` buttons (d-pad up and down, A, B) work it whatever they are mapped to.
  So a mapping that unmapped the menu's own buttons can be repaired with the controller alone, and Reset puts the defaults back.
- **`command-catalog.js` reads the commands** from the reference's list in `index.html`, so the reference, the menu, and the mapping view cannot list different ones.
  Anything added to that list (part of Lua's standard library, later) shows up in all three.
- **`recent-commands.js` and `favorites.js` own the two lists,** saved in `localStorage`.
  Both drop a saved command the reference no longer lists.
  Only inserts made with the controller count as recent.

The button that opens the menu appears in the canvas's corner once a controller has connected, and stays for the visit.
The mapping view covers the canvas, so a run closes it.

`test/gamepad_test.mjs` covers the parts that need no page (reading presses, the mapping, the two lists).
`test/dock_test.mjs` covers a panel's height, and `test/lessons_test.mjs` and `test/floating_test.mjs` the Lessons sidebar's pages and floating window.
Both run with the Node version in `.nvmrc`: `node --test test/*.mjs`.
`npm test` runs those and then `sh test/run.sh`.

### Feature flags

A feature can be switched off with one flag, without touching its code.
`public/flags.json` names each flag and says whether it is on; today they are `share`, `export` and `lessons`.

- **`flags.js` decides.** Pure functions read the file, apply a tab's `?flags=` overrides, and make the edits the CLI asks for.
  A flag is on unless something turns it off, so a missing or unreadable file leaves every feature on.
  `test/flags_test.mjs` covers it.
- **`app.js` is the shell.** It fetches the file before anything else, and its `feature(name, ...elements)` removes a feature's elements when it is off and tells the caller to skip wiring it.
  Removed elements leave no gap in the header's flex row, and a feature that is off also loses its shortcut (the Lessons' ⌘⇧L).
- **`tools/flags.mjs` flips them.** `node tools/flags.mjs list`, `on <name>` or `off <name>` rewrites the file; it refuses a name the file does not have.

The site is static, so a change goes live on the next deploy, and in the dev server on the next page load.
`?flags=-share,lessons` turns flags off (or, without the `-`, on) in one tab only, for trying a change before committing it; it ignores names the file does not have.
Adding a flag means adding it to `flags.json` and guarding the feature's wiring in `app.js` with `feature()`.

### Zoom about a point (`zoomAt`)

Standard anchor-preserving zoom: convert the cursor's screen position to turtle coordinates
with the old scale, apply the clamped new scale, then re-solve for the view center that puts
that turtle point back under the cursor. Since segments are stored in turtle space and the
commit canvas is redrawn from the log every frame, zoom/pan/resize are all "free" — no
raster resampling, just a full vector replay.

---

## Design patterns

- **Event sourcing / append-only log.** The segment log is the single source of truth;
  the screen image is a derived projection. Replay handles resize, zoom, clear, undo, and
  clearstamp uniformly.
- **Mark, don't delete.** `clear` markers, the cleared-stamp set, and undo's hidden-index set
  all *annotate* the shared log instead of mutating it — the trick that makes per-turtle
  operations composable when logs interleave.
- **Layered core / host split.** `core.lua` + `screen.lua` are a pure, platform-free state
  machine (testable with plain `lua`); `host.lua` is the *execution host* layering
  animation, pacing, undo orchestration, and API surface on top. Animation lives only in the
  host — never in core.
- **Pipeline of filters.** `visible_segments()` is a composition of three small pure filters,
  each independently testable.
- **Command wrapper (decorator).** `with_undo` uniformly wraps every mutating command with
  the snapshot/commit protocol, so individual command implementations stay oblivious to undo.
- **Bridge functions as the FFI seam.** Exactly one JS→Lua entry point
  (`_bridge_post_frame`) and a handful of Lua→JS pull accessors
  (`_bridge_get_visible_segments`, `_bridge_get_turtle_states`, `_bridge_get_bgcolor`,
  `_bridge_get_tracer_n`, `_bridge_hard_reset`). Everything else crosses the boundary as
  plain data.
- **Closure-based method tables instead of classes for the API.** `make_turtle_methods(core)`
  builds a table of closures over a specific core; the module-level globals are generated
  from the same command table, bound to the default core. Cores themselves use idiomatic Lua metatable OOP
  (`Core.__index = Core`).
- **Sandbox via environment injection.** User code gets a fresh whitelist `env` per run —
  isolation without patching globals.
- **Hard reset by reconstruction.** Each Run makes a new host instance, with a new `Screen`
  and default `Core` (`_bridge_hard_reset`), rather than trying to scrub state — no leakage
  between runs by construction.
- **Web default colors.** `core.lua` and `screen.lua` hard-code white ink on black paper.
  The web host overrides both with black ink on white paper, like Python turtle, so the shared
  files stay verbatim. The drawing ignores the page palette; only the program's own
  `pencolor`/`fillcolor`/`bgcolor` calls change it.
- **Registry + ownership tags.** The Screen registers turtles and hands out `turtle_id`s;
  every log entry is tagged with its owner, which is what all per-turtle semantics hang off.

## Local dev server and UI feedback (`tools/dev-server.mjs`, `dev/feedback/`)

`node tools/dev-server.mjs` serves the site locally on port 5520 (`.claude/launch.json` starts it), the way the deployed site is served: `public/` as is, cross-origin isolated with the headers in `public/_headers`.
It listens on the loopback addresses only.
Like Cloudflare, it serves a page without its extension (`/library` is `library.html`), and it answers byte ranges, which Safari needs to play a video.

It adds one thing, a review aid for the developer: hold Option (Alt off macOS) to outline the element under the pointer, and Option-click it to leave Claude a comment on it.
The server appends each comment to `ui-feedback.md` in the repo root, which is gitignored: it is read by Claude, and goes nowhere else.
Each entry is a Markdown section that starts open (`[ ]`) and is marked `[x]` once dealt with, with the page, a selector that finds the element again, the start of its text, and where it was clicked.
The format is Triangle Lab's, so both projects' feedback files read alike.

The overlay can never reach the published site.
The server adds its script tag to every page as it serves it, and serves the script from `dev/`, outside `public/`; no app module imports it.
It takes Option-clicks in the capture phase, before the app's listeners see them, and keys typed into its comment box stop at the box, so the app's shortcuts never fire while a comment is written.
The server takes comments only from its own pages: a POST's `Origin` must be its own host.

| File | Role |
| --- | --- |
| `dev/feedback/entry.js` | A comment's wire format, its validation, and its Markdown form. Shared by page and server; no DOM or Node APIs. |
| `dev/feedback/capture.js` | A clicked element → a selector, a description and the click's position. Pure over anything shaped like an element. |
| `dev/feedback/overlay.js` | The outline, the comment box, and the post to the server. |
| `tools/dev-server.mjs` | Serves the site, adds the overlay, records comments. Its decisions (which file a path reads, the injection, the byte range a request asks for, whose comments to take) are pure exports. |

`test/feedback_test.mjs` covers the entry and the capture, and `test/dev_server_test.mjs` the server's decisions, including that its isolation headers match `public/_headers`.

## Deployment

Static files served by a Cloudflare Worker (`wrangler.jsonc`, assets = `./public`). Everything
published lives under `public/`; repo docs, `wrangler.jsonc`, `.git` and `.wrangler` sit outside
it and so cannot be served by accident.
Pointing `assets.directory` back at the repo root would publish all of them — it previously did.
The Worker serves `luaturtle.com` and `www.luaturtle.com` as custom domains declared in `wrangler.jsonc`, so deploying creates their DNS records.
A zone Redirect Rule in the Cloudflare dashboard (not in the repo) sends `www` to the apex with a 301.
`npx wrangler deploy` publishes production, from the local CLI; Wrangler is a pinned dev dependency.
A `staging` environment in `wrangler.jsonc` is a separate Worker, `luaturtleweb-staging`, serving the same `public/` at `staging.luaturtle.com`, for trying a branch before it reaches production.
`npm run deploy:staging` runs the tests and deploys the checked-out tree there; routes are not inherited between environments, so it never touches the production hostnames.
Staging sits behind Cloudflare Access, set up in the Zero Trust dashboard (not in the repo): a self-hosted application for the whole hostname, whose one policy lets in the owner's email with a one-time PIN.
`public/_headers` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
require-corp` so the page is cross-origin isolated — a hard requirement for
`SharedArrayBuffer`, and therefore for the whole animation model. No build step: plain ES
modules, CodeMirror from static include, `wasmoon.js` and its `glue.wasm` binary vendored.
Both come from wasmoon 1.16.0 and must be replaced together; `worker.js` passes the local
`glue.wasm` URL to `LuaFactory` because the default is a runtime fetch from unpkg.com.
CodeMirror 5.65.16 is vendored too, in `public/vendor/codemirror/` (the cdnjs builds, with its MIT license), and KaTeX 0.19.0, which `/compsci` renders equations with, in `public/vendor/katex/` (its UMD build, stylesheet and woff2 fonts, with its MIT license).
Google Fonts is the only third-party origin the pages load from, and losing it only changes the typeface; `test/index_assets_test.mjs` keeps it that way and checks every local script and stylesheet each page names exists.
Cloudflare serves `library.html` at `/library` and `compsci.html` at `/compsci`, without their extensions.
The library's previews are committed media files, made ahead of time by a dev tool (see [The library](#the-library-library)), so deploying still needs no build step.
`package.json` lists only dev tools (Playwright, for that tool, and Wrangler) and is never part of the site.
