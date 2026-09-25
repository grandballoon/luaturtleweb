# Architecture — Lua Turtle Web

This repo is the web version of Lua Turtle: Python-style turtle graphics for Lua 5.4, running
in the browser. Lua executes inside a Web Worker via Wasmoon (Lua compiled to WASM); the main
thread renders to a Canvas2D element. User code is fully synchronous from its own point of
view — `forward(100)` animates and returns — even though rendering happens on another thread.

```
Main thread (app.js)                         Web Worker (worker.js)
┌──────────────────────────┐   postMessage   ┌───────────────────────────────┐
│ CodeMirror editor        │ ──── run ─────► │ Wasmoon (Lua 5.4 in WASM)     │
│ Renderer (renderer.js)   │ ◄─── frame ──── │  turtle_web.lua (exec host)   │
│ Canvas2D + commit canvas │                 │   ├─ core.lua  (state machine)│
│                          │  SharedArray-   │   └─ screen.lua (segment log) │
│ Atomics.notify ──────────┼──── Buffer ────►│  Atomics.wait (blocks worker) │
└──────────────────────────┘                 └───────────────────────────────┘
```

Layer boundaries, top to bottom:

| Layer | File | Role |
|---|---|---|
| Markup | `index.html`, `styles.css` | Static page structure and styling; no inline script |
| UI shell | `app.js` | Editor, draft autosave + share links, run state machine, worker lifecycle, frame ack, shortcuts |
| UI panels | `terminal.js`, `splitter.js`, `canvas-view.js`, `command-reference.js`, `command-placement.js`, `floating-frame.js`, `command-preview.js`, `usage-popup.js`, `command-lookup.js` | Tabbed output panel; editor/canvas divider; canvas toolbar + pan/zoom gestures; searchable command reference; where the reference shows (over the canvas, in a terminal tab, or floating); a draggable, resizable floating window; the reference's miniature demo player; a command's example calls in a popup; Cmd/Ctrl+click on a command to show them |
| Highlighting | `lua-highlight.js` | The turtle-command pattern the editor highlights, and editor-identical highlighting for code shown outside it |
| Renderer | `renderer.js` | Canvas2D drawing, viewport math (zoom/pan), grid, PNG export |
| Preferences | `storage.js` | `localStorage` wrappers that never throw |
| Worker bridge | `worker.js` | Wasmoon boot, frame protocol, sandbox run, error mapping |
| Execution host | `turtle/turtle_web.lua` | Animation pacing, undo orchestration, tracer, API/globals |
| Argument checks | `turtle/args.lua` | Validates every public command's arguments; learner-readable errors |
| Usage examples | `turtle/examples.lua` | Hardcoded example calls per command, shown when a call is rejected or a command is Cmd/Ctrl+clicked |
| Reference demos | `turtle/demos.lua` | A demo program per command-reference entry, played in the reference's detail pane |
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

### The sandbox environment (`_turtle_make_env`)

User code is loaded with `load(code, "user_code", "t", env)` where `env` is a fresh table
exposing a whitelisted Lua stdlib subset (`math`, `string`, `table`, `pairs`, `pcall`, …) and
the full turtle API — but not `require`, `io`, `os`, `debug`, or the module internals. Built
fresh per Run, so nothing leaks between runs.

### The command table (`TURTLE_COMMANDS`, `SCREEN_COMMANDS`)

Every public command is declared once in `turtle_web.lua` as `{ check, run }`, plus an `ALIASES` map (`fd` → `forward`, …).
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
- **`turtle_web.lua` maps the command to its examples.** `_bridge_command_usage(err)` resolves an alias to its command (`fd` → `forward`) and returns `{ command, examples }`, or nil.
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
The pieces, each with one job:

- **`index.html` holds the entries.** Each is `<li><code>signature</code><span class="api-about">description</span></li>`; the description is hidden in the list and read by the search and the detail pane.
- **`demos.lua` holds the demos.** Pure data, keyed by the entry's signature exactly as the list shows it.
  `test/demos_test.lua` checks that the keys and the list match both ways, and that every demo runs.
- **`worker.js` records a program.** A `record` message runs code through the same `execute()` path as a run, but `_bridge_post_frame` appends a snapshot to a list instead of posting it and blocking: `{segments, turtles, bgcolor, prints, work, delay}`, where `work` is the time spent computing since the previous frame and `delay` is the speed-based pause after it.
  The list starts with the blank canvas and is posted back whole as `recording`.
  The `ready` message carries the demos, as it carries the usage catalog.
- **`command-preview.js` plays a recording.** It owns a second `worker.js` instance, so recording never waits behind (or disturbs) the learner's own run, and a second `Renderer` on the miniature canvas.
  Playback spaces frames as a live run would (`work`, then the frame, then `delay` plus a small round-trip allowance), rendering at most one frame per display refresh, and reveals `print()` output under the canvas as the frames that printed it go up.
  The view is centered on the drawing's bounds and scaled down (never up) to fit; a recording is cached per program and canvas size.
  Demos run at the real canvas's size, so `screen_width()` reports what a run would.

Because both the recording and the drawing go through the production code paths, a demo looks exactly like the same program run on the real canvas, zoomed out.
Under `prefers-reduced-motion`, the preview shows only the finished drawing.

### Command reference placement

The reference shows over the canvas, as a Commands tab in the terminal panel, or in a floating window, so the drawing can stay in view while it's open.
Buttons in its header, one for each place it isn't, move it, and the choice is saved in `localStorage`.
The boundaries:

- **`command-reference.js` owns what the reference is:** its query, selection, and whether it's open.
  It never touches the page around it; it asks a host to attach, detach, show, and hide the one `#api-overlay` element, which is moved rather than duplicated, so listeners and state survive a move.
- **`command-placement.js` owns where it is:** one host for the canvas (toggles `.visible`), one for the terminal (adds and selects a tab), one for the floating window, and the saved choice.
  The reference writes the host's name to the overlay's `data-placement`, and the stylesheet draws each frame from that.
  A host reports visibility changes the learner makes without the reference (clicking a tab, collapsing the panel), which the reference treats as opening or closing.
- **`terminal.js` owns the panel:** tabs, collapse, and a height per tab (the Commands tab defaults taller than the output).
  It knows nothing about the reference; any pane can be added as a tab.
- **`floating-frame.js` owns the floating window's geometry:** dragging by the reference's header, resizing from a corner grip, keeping it on screen when the viewport shrinks, and the saved position and size.
  It knows nothing about the reference either; it's attached to the overlay only while the float host holds it.

Anywhere but over the canvas, a run doesn't close the reference, and Esc closes it only while focus is inside it, so Esc in the editor still stops a run.
An error brings the output tab forward.
The overlay is a size container, so its layout adapts to the terminal panel's short, wide shape and to any size the floating window is given by container queries alone.

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
  machine (testable with plain `lua`); `turtle_web.lua` is the *execution host* layering
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
- **Hard reset by reconstruction.** Each Run rebuilds `Screen` and the default `Core` from
  scratch (`_bridge_hard_reset`) rather than trying to scrub state — no leakage between runs
  by construction.
- **Web default colors.** `core.lua` and `screen.lua` hard-code white ink on black paper.
  The web host overrides both with black ink on white paper, like Python turtle, so the shared
  files stay verbatim. The drawing ignores the page palette; only the program's own
  `pencolor`/`fillcolor`/`bgcolor` calls change it.
- **Registry + ownership tags.** The Screen registers turtles and hands out `turtle_id`s;
  every log entry is tagged with its owner, which is what all per-turtle semantics hang off.

## Deployment

Static files served by a Cloudflare Worker (`wrangler.jsonc`, assets = `./public`). Everything
published lives under `public/`; repo docs, `wrangler.jsonc`, `.git` and `.wrangler` sit outside
it and so cannot be served by accident.
Pointing `assets.directory` back at the repo root would publish all of them — it previously did.
`public/_headers` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
require-corp` so the page is cross-origin isolated — a hard requirement for
`SharedArrayBuffer`, and therefore for the whole animation model. No build step: plain ES
modules, CodeMirror from static include, `wasmoon.js` and its `glue.wasm` binary vendored.
Both come from wasmoon 1.16.0 and must be replaced together; `worker.js` passes the local
`glue.wasm` URL to `LuaFactory` because the default is a runtime fetch from unpkg.com.
