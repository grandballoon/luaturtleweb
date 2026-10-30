# Spec: incremental frames

Status: proposed, 2026-09-27.
Companion: [spec-perf-tooling.md](spec-perf-tooling.md), which provides the benchmark this fix is measured with.
Land the tooling's first phase before this fix, so the baseline is recorded on the current code.

## Problem

Every animation frame sends the whole drawing, so a run's total cost grows with the square of its length.

On each call to `_bridge_post_frame`, `snapshot()` in `worker.js` asks Lua for `screen:visible_segments()`.
Wasmoon converts that entire list into JS objects, it is structured-cloned to the main thread, and `Renderer.applyFrame` clears the commit canvas and strokes every segment again.
An animated `forward` logs one segment per substep, so the number of segments grows about as fast as the number of frames.
Frame *k* therefore costs O(*k*), and a run of *n* frames costs O(*n*²).

Measured on an Apple M2 (Node 18.14, the shipped `wasmoon.js`, `glue.wasm` and turtle Lua files), worker side only:

| Segments visible | Lua filter | Wasmoon Lua→JS conversion | structuredClone |
|---|---|---|---|
| 1,000 | 0.14 ms | 32 ms | 0.9 ms |
| 5,000 | 0.66 ms | 157 ms | 4.6 ms |
| 20,000 | 3.6 ms | 640 ms | 32 ms |

| Program (default speed) | Frames | Snapshot overhead | Intended pacing |
|---|---|---|---|
| `for i=1,4 do forward(100) right(90) end` | 188 | 0.4 s | 0.8 s |
| `for i=1,36 do circle(80) right(10) end` | 612 | 22 s | 2.4 s |
| `for i=1,200 do forward(i) right(59) end` | 7,753 | 569 s | 31 s |

The conversion (about 32 µs per segment) dominates.
The Lua filter is 200× cheaper, but it is quadratic in the same way.
A 2017 iMac is roughly 2–2.5× slower single-threaded than an M2, so a 36-circle flower would take close to a minute there.
A 2011 Mac mini or iMac, the oldest tier the site supports, is roughly 3–4× slower, so the same flower would take one to one and a half minutes.
The reference tiers and their budgets are defined in [spec-perf-tooling.md](spec-perf-tooling.md#reference-hardware-and-budgets).
The main-thread cost of re-stroking every segment on every frame comes on top of this and has not been measured yet.

## Goals

- The cost of an ordinary frame depends on what changed since the last frame, not on the size of the drawing.
- What the learner sees is unchanged, pixel for pixel, apart from the rounding noted under [Layered commit canvases](#layered-commit-canvases).
- `core.lua`, `screen.lua` and `colors.lua` stay verbatim with the desktop repo.
- The segment record shape stays the contract between Lua and the renderer.
  Only the transport changes: a frame carries changes instead of the whole list.
- Everything added works in the site's [browser floor](spec-perf-tooling.md#browser-floor): Safari 15.2, Firefox 115 ESR, Chrome 116.
- Correctness does not depend on reasoning about every command.
  A property test proves that applying the frames reproduces `visible_segments()` after every frame.

## Non-goals

- Faster full replays.
  Zoom, pan, resize, and frames that must resend everything (see [Reset rules](#reset-rules)) still cost O(*n*).
  Speeding those up (a cheaper Lua→JS encoding, batched strokes, cached `Path2D`s) is listed under [Follow-ups](#follow-ups) and is only worth doing if the benchmark shows it matters.
- Changing pacing, speed semantics, tracer behaviour, or the frame handshake.
- Changing what the learner's program can observe.

## Design

### The invariant

The renderer keeps the current visible segment list.
The worker keeps a record of what it has already sent.
Each frame is either a **delta** (segments appended since the last frame, all of them visible) or a **reset** (the complete visible list, replacing the renderer's copy).
After every frame, the renderer's list equals `screen:visible_segments()`, in order.

Almost every frame is a delta, because the segment log is append-only and most commands only append.
The only changes that are not appends are the ones the visibility pipeline filters out: clear markers, cleared stamps, and undo-hidden indices.
Any change to those inputs forces a reset.
Resets are rare in ordinary programs and always correct.

### Frame tracker: `turtle/frames.lua`

A new host module, separate from `turtle_web.lua`, whose only job is deciding what the next frame carries.
It reads `screen` and its cores and never writes to them.

```lua
local frames  = require("turtle.frames")
local tracker = frames.new(screen)
local reset, segments = tracker:take()   -- reset: boolean; segments: list
```

`take()` compares the screen with the state recorded at the previous `take()`:

- `sent` — `#screen.segments` at the last take.
- `stamps_ref`, `stamps_count` — the identity and size of `screen._cleared_stamps`.
- `hidden[i]` — for each registered core, the identity and size of its `_hidden_indices`.

The first `take()` on a new tracker is always a reset.
After returning, `take()` records the current state.

#### Reset rules

`take()` returns a reset, `true, screen:visible_segments()`, if any of these hold:

1. This is the tracker's first take.
2. `screen._cleared_stamps` is a different table, or its size changed.
   (`clearstamp` and `clearstamps` add to it in place; `undo` replaces it with a snapshot copy.)
3. A core that existed at the last take has a different `_hidden_indices` table, or that table's size changed.
   (`undo` adds to it in place; `clear` and `reset` replace it.)
4. A core registered since the last take has a non-empty `_hidden_indices`.
5. Any entry appended since the last take would be dropped by the visibility pipeline: a `clear` marker, a stamp whose `id` is in `_cleared_stamps`, or an entry whose `_log_index` is hidden.
   Rules 2–4 already cover every path in today's `core.lua`.
   Rule 5 is a cheap guard against a future desktop change the other rules miss.

Otherwise it returns a delta, `false, { screen.segments[sent+1] … screen.segments[#screen.segments] }`.

Measuring set sizes means iterating them with `pairs`, so each take costs O(appended + hidden + cleared stamps).
Hidden and cleared-stamp sets are small in practice, and even thousands of entries are cheap next to one Lua→JS conversion.
Programs that call `undo` or `clear` in a loop pay a reset on each of those frames.
That is correct and no worse than today; the benchmark corpus includes such programs so the cost stays visible.

The rules deliberately depend on internals of the verbatim desktop files (`_cleared_stamps`, `_hidden_indices`), just as `screen:visible_segments()` already does.
The property test below is what catches a desktop change that breaks them.

### Host bridge: `turtle_web.lua`

- `_bridge_hard_reset()` creates a new tracker for the new screen, so a run's first frame is always a reset.
- New `_bridge_take_frame()` returns `{ reset = <boolean>, segments = <list> }`.
- `_bridge_get_visible_segments()` is removed; `snapshot()` was its only caller.

### Worker protocol: `worker.js`

`snapshot()` calls `_bridge_take_frame()` instead of `_bridge_get_visible_segments()`.
The `frame` message becomes:

```js
{ type: "frame", reset, segments, turtles, bgcolor }
// reset: true  → segments is the complete visible list
// reset: false → segments are the ones appended since the previous frame
```

Turtle states and the background colour stay whole on every frame, since they are small and are composited rather than drawn into the commit canvases.
A recorded frame (the `record` request) gets the same two fields in place of its full `segments`.
The header comment in `worker.js` and the message tables in `architecture.md` are updated to match.

Frames reach the main thread in order and every frame is applied (the worker blocks until each is acknowledged), so a delta can never arrive without the frames before it.

### Renderer: `renderer.js`

`applyFrame(frame)` takes the frame object itself, `{ reset, segments, turtles, bgcolor }`.

- **Reset:** replace the kept list with `segments`, clear both commit canvases, draw every segment.
- **Delta:** append `segments` to the kept list and draw only those.
- In both cases, schedule a composite for the next animation frame instead of compositing immediately.

The kept list is what viewport changes, resizes and PNG export replay from, just as `_lastSegments` is today.

#### Layered commit canvases

Today's order is: every fill in log order, then every other segment in log order, so strokes always sit on top of fills.
A new fill appended after existing strokes must still end up underneath them, which a single canvas can't do incrementally.

The single commit canvas becomes two layers of the same size: a **fill layer** and an **ink layer** (lines, dots, text, stamps).
A delta draws each new segment onto its layer.
The composite draws background, optional grid, fill layer, ink layer, then turtle heads.

Source-over compositing is associative, so this matches today's single-canvas result.
The one exception is 8-bit rounding: when translucent strokes overlap translucent fills, pixels can differ by ±1 in a channel.
That is invisible and acceptable.

#### Compositing once per display refresh

Today each frame message composites synchronously.
Frames can arrive faster than the display refreshes (speed 10, or `delay = 0`), so most of those composites are never seen.

`applyFrame` draws the new segments onto the layers synchronously, then asks for a composite on the next `requestAnimationFrame`, coalescing requests the way `requestRedraw` does for viewport changes.
`app.js` acknowledges the frame immediately after `applyFrame` returns, as it does today.

The learner sees the same thing, because the browser only paints once per refresh either way.
The worker's pacing delay still starts after the ack, so timing is unchanged.
In a background tab `requestAnimationFrame` doesn't fire, so nothing is composited until the tab is visible again, which saves work that nobody sees.

`Renderer` ends up with two redraw paths:

- `redraw()` — replay the kept list onto both layers, then composite (viewport change, resize).
- `requestComposite()` — composite only, on the next refresh (new frame).

### Command reference previews: `command-preview.js`

A recording becomes a list of delta and reset frames, so memory grows linearly with the demo instead of quadratically.

- `drawFrame(index)` applies every frame from `shown + 1` through `index`, in order, since playback may skip frames between refreshes.
- When playback loops (`index < shown`), it starts again from frame 0, which is always a reset to the blank canvas.
- `drawingBounds` walks each frame's `segments` once.
  Reset frames repeat earlier segments, which doesn't change the bounds.
- Under `prefers-reduced-motion`, the last frame is reached by applying all frames once.

### Restart and stragglers

Pressing Run during a run leaves the old run's final frames in flight.
The main thread still applies and acks them, as it does today.
The new run starts with `_bridge_hard_reset()`, so its first frame is a reset, which discards whatever the stragglers drew.

## Alternatives considered

- **Keep full frames, but encode them faster** (a flat numeric array, or a string parsed in JS).
  This cuts the constant by an unknown factor but stays quadratic.
  It remains a follow-up for reset frames.
- **Transfer an `ArrayBuffer` instead of cloning.**
  Cloning is only about 3% of the cost, and this is still quadratic.
- **Draw in the worker via `OffscreenCanvas`.**
  This would remove the transfer entirely, but a worker blocked in `Atomics.wait` or running Lua never yields, so its canvas never presents.
  It is incompatible with the synchronous animation model.
- **A per-command "visibility changed" flag in the host.**
  Every new command would need to remember to set it.
  Deriving resets from the visibility pipeline's own inputs can't drift that way.

## Testing

### Equivalence property test: `test/frames_test.lua`

Runs with plain `lua` from the repo root, like the other suites.
It drives the real host with `_bridge_post_frame` replaced by a function that calls `tracker:take()` and applies the result to a simulated renderer list.
After every frame, it asserts that the simulated list equals `screen:visible_segments()`, compared by `_log_index` sequence.

Cases:

- Scripted programs covering each reset rule: `clear`, `reset`, `clearstamp`, `clearstamps(n)` with positive, negative and no `n`, `undo` of drawing and of non-drawing commands, undo after clearstamp, and fills opened and closed around undos.
- Multi-turtle programs with interleaved segments, where one turtle clears or undoes while another draws.
- `tracer(0)` with `update()`, `tracer(n)`, and `speed(0)`.
- A seeded random-operation fuzzer: several turtles, a few hundred random commands from the full command table, a fixed set of seeds, and a frame after every command.
  A failing seed is printed so it can be replayed.

It also asserts that a program with no undo, clear or clearstamp sends exactly one reset (the first frame), and that the total number of segments sent equals the number logged.

### Existing suites

`test/args_test.lua`, `test/demos_test.lua` and `test/motion_test.lua` must keep passing.
`demos_test.lua` runs every demo, so it exercises the recording path's Lua side.

### Benchmark

Run the harness from [spec-perf-tooling.md](spec-perf-tooling.md) before and after, and commit the updated baseline with the fix.

### Manual visual check (by the user)

The user compares these before and after:
the flower and spiral above at default speed, a filled star drawn over existing lines, translucent fills under translucent strokes, stamps with `clearstamps`, undo during a fill, a `tracer(0)` animation loop that clears every frame, zoom and pan during and after a run, PNG export, Run pressed mid-run, and a few command reference demos (including looping and reduced motion).

## Acceptance criteria

1. `test/frames_test.lua` passes, including all fuzz seeds, and the existing suites pass.
2. In the harness, every append-only corpus program has an amplification (segments sent ÷ segments logged) of exactly 1.0 and exactly one reset.
3. Worker-side snapshot overhead on the M2 drops from 22 s to under 0.2 s for the 36-circle flower, and from 569 s to under 1 s for the 200-step spiral.
4. Main-thread per-frame apply time (from the tooling's instrumentation) has a p95 under 2 ms on the M2 for delta frames, whatever the drawing size.
5. The manual visual check shows no difference.
6. `architecture.md` describes the tracker, the frame shape, the layered commit canvases and the new preview playback, and no longer says each frame redraws the full commit canvas.

## Follow-ups

These are out of scope here and should be picked up only if device runs on either reference tier show they matter.
Full replays are the likeliest to matter on tier 2, where Canvas2D may render in software:

- A cheaper Lua→JS encoding for reset frames.
- Faster full replays for zoom and pan on very large drawings: batching consecutive strokes of the same style, or caching per-segment `Path2D`s.
  Batching changes how overlapping translucent strokes blend, so it would need its own visual review.
- `Core:clearstamps` calls `screen:visible_segments()`, which is O(*n*) per call.
  That is in the verbatim desktop file, so any fix belongs upstream.
