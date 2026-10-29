# Spec: performance tooling

Status: proposed, 2026-09-27.
Companion: [spec-incremental-frames.md](spec-incremental-frames.md), the first fix this tooling measures.

## Purpose

The tooling answers three questions, each with a different tool:

| Question | Tool | Where it runs |
|---|---|---|
| Did a change make any run do more work than it should? | Node harness with count-based gates | Locally and in CI, on every change |
| Where does a frame's time go? | In-app instrumentation, HUD, DevTools marks | Any browser, behind a flag |
| How does the site actually behave on this machine? | Bench mode | A real low-end device, run by hand |

The first tool is the stable one.
Timing on shared or varied hardware is noisy, so regressions are gated on counts that don't depend on the machine.
Timings are recorded and compared, but never fail a build.

## Principles

- **Gate on counts, report timings.**
  Frames, segments sent, resets and bytes posted are deterministic for a given program and code version.
  Amplification (segments sent ÷ segments logged) captures the complexity class directly: 1.0 is linear, thousands is quadratic.
- **Measure the shipped code.**
  The harness runs `public/worker.js` unmodified, and bench mode drives the real app.
  Neither re-implements the pipeline it measures.
- **Nothing to pay when off.**
  With instrumentation disabled, the only cost is a boolean check per frame.
  Bench mode's code is loaded only when it's requested.
- **No build step, no runtime dependencies.**
  The harness uses the Node standard library only.
  The deferred browser automation (phase 5) would add the repo's first `package.json`, as a dev dependency.

## Reference hardware and budgets

There are two reference tiers.
Tier 1 is the machine the site should feel good on; tier 2 is the oldest machine it should still be usable on.

**Tier 1: 2017 iMac.**

- 21.5" (non-Retina): i5-7360U, 2 cores, Intel Iris Plus 640, often with a 5400 rpm hard drive.
- 27" 5K: i5-7500, 4 cores, Radeon Pro 570, device pixel ratio 2 on a 5120×2880 panel.

The highest macOS these run is Ventura, so the browsers are Safari up to Ventura's latest version plus current Chrome and Firefox where they still support Ventura.
Single-threaded, they are roughly 2–2.5× slower than an Apple M2.

**Tier 2: 2011 Mac mini and 2011 iMac.**

- Mac mini: i5-2415M, 2 cores, Intel HD 3000 (or Radeon HD 6630M), 2 GB RAM, hard drive.
- iMac: i5-2400S, i5-2500S or i7-2600, 4 cores, Radeon HD 6750M–6970M, 4 GB RAM, hard drive.

These top out at macOS High Sierra (10.13).
Safari there stops at 13.1, which has no SharedArrayBuffer, so **Safari cannot run the site on tier 2 at all**.
The supported browsers are Firefox 115 ESR (the recommended one) and Chrome 116, the last versions for High Sierra; both are well past the SharedArrayBuffer minimums (Firefox 79, Chrome 92).
Chrome 116 no longer gets security updates, and Firefox 115 ESR's support for old macOS may also have ended, so the bench run should record the exact browser version.
Single-threaded, these are roughly 3× (iMac) to 4× (Mac mini) slower than an M2.
Browsers often turn off GPU acceleration on GPUs this old (the HD 3000 especially), and Canvas2D then renders in software.
That is the main uncertainty for this tier.

Budgets, which are targets to validate on real devices, since nothing has been run on either tier yet:

| Metric | Tier 1 (2017) | Tier 2 (2011) |
|---|---|---|
| Worker time per delta frame (take frame, convert, post) | p95 ≤ 2 ms | p95 ≤ 4 ms |
| Main-thread apply per delta frame | p95 ≤ 2 ms | p95 ≤ 4 ms |
| Composite (background, grid, two layers, heads) | p95 ≤ 6 ms on the 27" 5K | p95 ≤ 8 ms, including with software Canvas2D |
| Overhead ratio for paced corpus programs | ≤ 10% | ≤ 20% |
| Amplification for append-only programs | exactly 1.0 | exactly 1.0 |
| Zoom/pan replay at 20,000 segments | ≤ 33 ms (reported only) | ≤ 100 ms (reported only) |

Zoom/pan replay is reported only; see the fix spec's follow-ups.
Amplification is a property of the code, not the machine, so it is the same on both tiers and is gated by the harness rather than by device runs.

### Browser floor

Supporting tier 2 sets the oldest browsers the whole site must work in, not just the benchmarks:

| Browser | Floor | Why |
|---|---|---|
| Safari | 15.2 | First with SharedArrayBuffer on cross-origin-isolated pages |
| Firefox | 115 ESR | Last for High Sierra (tier 2) |
| Chrome | 116 | Last for High Sierra (tier 2) |

Any JavaScript or CSS the site uses, including the new tooling, must work in these, or degrade harmlessly.
`README.md` states the floor, and `architecture.md`'s deployment section links to it.

Known gap today: `styles.css` uses `:has()` to drop the bottom border of the command reference's last visible row, and Firefox only supports `:has()` from version 121.
Firefox 115 ignores the rule, so that row keeps its border.
It is cosmetic, but it should be fixed without `:has()` when this lands.

**Overhead ratio** is (wall time − pacing delay) ÷ pacing delay for a paced run: how much slower the run is than its `speed()` intends.

## Components

### 1. Program corpus: `public/bench/`

One Lua file per program in `public/bench/programs/`, and `public/bench/index.json` listing them:

```json
{ "id": "flower36", "file": "programs/flower36.lua", "title": "36 circles",
  "tags": ["append-only"], "maxAmplification": 1.0 }
```

Keeping programs as plain `.lua` files makes them easy to edit, and both the harness (from disk) and bench mode (by `fetch`) can load them.
The corpus is published under `public/` because bench mode must be able to reach it on a real device; it is small and contains nothing sensitive.

Initial programs, each chosen to exercise one thing:

| id | What it stresses |
|---|---|
| `square` | Baseline; tiny |
| `flower36` | Circles at default speed; a typical learner program |
| `flower36-fast` | The same at `speed(10)`; frames faster than the display |
| `spiral200` | Many frames and segments; exposes quadratic growth |
| `instant20k` | `speed(0)`, 20,000 segments; the largest single reset and replay |
| `filled-star` | Fills drawn after strokes; layer ordering |
| `stamps` | `stamp`, `clearstamp`, `clearstamps`; reset rule 2 |
| `undo-heavy` | Draw then `undo` repeatedly; reset rule 3, reset cost |
| `clear-loop` | `tracer(0)` animation that clears and calls `update()` every step |
| `multi-turtle` | Several turtles drawing interleaved |
| `text-labels` | `write` in a loop; text rendering cost |
| `print-heavy` | `print` every step; the print path alongside frames |

`maxAmplification` is 1.0 for programs tagged `append-only` and omitted for the others, which are gated on their exact counts only.

### 2. Worker instrumentation: `public/perf-worker.js`

A classic script that `worker.js` loads with `importScripts`, defining a `PerfRecorder`.
`worker.js` calls it at fixed points and never reads its internals.

The `run` message gains two optional fields:

- `perf` (default `false`) — record per-frame measurements.
- `pacing` (default `true`) — when `false`, skip the speed-based sleep after each ack.
  This is used only by the harness and by bench mode's unpaced pass.
  Frames and segments are unaffected, so counts match paced runs.

For each frame, with `perf` on, the recorder keeps:

- `lua` — ms from the previous wake (or the run's start) to this frame's `_bridge_post_frame` call: time spent running the program.
- `take` — ms in `_bridge_take_frame()` and its Wasmoon conversion (`_bridge_get_visible_segments()` before the fix).
- `post` — ms in `postMessage`.
- `ack` — ms blocked in `Atomics.wait` for the main thread.
- `sleep` — ms of pacing delay.
- `segments` — number of segments in the message.
- `reset` — whether it was a reset (always true before the fix).

Each phase also calls `performance.mark`/`performance.measure` with names prefixed `lt:` (`lt:lua`, `lt:take`, …), so they show up on the worker's track in the Chrome and Safari DevTools Performance panels.

Measurements are stored in preallocated typed arrays, which grow by doubling.
Before its `done` or `error` message, the worker posts `{ type: "perf", runId, frames, totals }`, transferring the arrays' buffers.
`totals` includes `segmentsLogged`, the final `#screen.segments`, from a new `_bridge_get_log_length()`.

### 3. Main-thread instrumentation: `public/perf.js`

An ES module with one job: collect the main thread's measurements and merge them with the worker's into a run report.

It is enabled by `?perf` in the URL, or by the storage key `luaturtle-perf` set to `1` through `storage.js`.
`?perf=1` sets the key and `?perf=0` removes it, so the setting survives reloads on the device being tested.

Per frame, it records:

- `apply` — ms in `renderer.applyFrame`.
- `queue` — ms from the worker's post (a `performance.timeOrigin`-adjusted timestamp added to the frame message when `perf` is on) to the main thread handling it.

Per display refresh:

- `composite` — ms in the composite.
- `coalesced` — how many frames that composite covered.

It also records long-animation-frame entries from `PerformanceObserver` where the browser supports them (Chromium), and the visible segment count at the end of the run.

`app.js` passes the flag in the `run` message and calls `perf.js` at the same points it already handles frames.
`renderer.js` exposes the composite timing through an optional callback, so it has no dependency on `perf.js`.

### 4. Run report

A versioned JSON object, and the one format every tool reads and writes:

```js
{
  schema: 1,
  program: "flower36",            // corpus id, or null for the learner's own code
  paced: true,
  code: "<sha-1 of the program>",
  build: "<git sha, or 'dev'>",
  device: { ... },                // bench mode only; see component 7
  counts: { frames, resets, segmentsLogged, segmentsSent, bytesPosted, amplification },
  wall: 3120.5,                   // ms from Run to done
  pacing: 2448,                   // ms of pacing delay
  overheadRatio: 0.27,
  phases: {                       // each { p50, p95, max, total } in ms
    lua, take, post, ack, sleep,  // worker
    apply, queue, composite,      // main thread (absent in the harness)
  },
  longFrames: 3,                  // long-animation-frame entries, where supported
}
```

`bytesPosted` is filled in by the harness only (see component 6); browsers can't measure structured-clone size.

With instrumentation on, the app keeps the reports from the page session on `window.luaturtlePerf`:

- `lastReport()` returns the most recent one.
- `reports()` returns all of them.
- `clear()` discards them.

At the end of each run it also prints a `console.table` summary.

### 5. HUD: `public/perf-hud.js`

A small overlay in the top-left corner of `#canvas-panel`, below `#canvas-toolbar`, shown only when instrumentation is on.
It uses the stylesheet's existing colour tokens and monospace font, works in both themes, and never covers the toolbar.

While a run is in progress it shows frames per second, p95 worker and main-thread frame time, the visible segment count and the number of resets so far.
After the run it shows the overhead ratio and amplification, plus a button that copies the run report as JSON.

The HUD only reads from `perf.js` and has no other dependencies.

### 6. Node harness: `bench/harness.mjs`

It lives outside `public/`, so it is never published.
It runs under the Node version in `.nvmrc`, using only the standard library.

**How it runs the real worker.**
The harness starts `public/worker.js` unmodified in a `worker_threads` Worker, through a small bootstrap that supplies what a browser worker would have:

- `self`, `self.location` (a `file:` URL for `public/worker.js`)
- `importScripts` (evaluates the file with `vm.runInThisContext`)
- `fetch` for paths under `public/` (reads the file from disk)
- `postMessage` and `onmessage` on the worker's port

These shims are the harness's only fakes.
If loading `glue.wasm` through a `file:` URL fails, the shim for `fetch` serves it too.

**What the harness does as the main thread.**
It sends `run` with `perf: true` and `pacing: false`, acknowledges each frame immediately, and measures each frame message with `v8.serialize(msg).byteLength` as a stable stand-in for structured-clone size.
Each program runs once for counts, then five times for timings; the harness reports the median of the timing runs.

**Commands:**

- `node bench/harness.mjs` — run the corpus and print a table.
  It writes a report to `bench/results/<date>-<sha>.json`, which is gitignored.
- `node bench/harness.mjs --check` — also compare against `bench/baseline.json`, and exit non-zero if any count differs from the baseline, or any program exceeds its `maxAmplification`.
- `node bench/harness.mjs --update-baseline` — rewrite the baseline from this run.
  A change that alters counts on purpose (such as the incremental-frames fix) commits the new baseline with it, so the diff shows the effect.
- `--only <id>` limits the run to one program.
  `--label <name>` records which machine produced the timings.

`bench/baseline.json` holds each program's exact counts and reference timings tagged with the machine label.
When a timing is more than 25% slower than the baseline for the same label, the harness prints a warning, but it never fails on timing.

The first baseline is recorded on the current code, before the fix, so its quadratic numbers are on record.

### 7. Bench mode: `?bench`

Bench mode is for running the corpus on a real device and taking the results away.
`app.js` loads `public/bench-mode.js` with a dynamic `import()` only when `?bench` is present, so normal page loads never fetch it.

**What it does:**

- It turns instrumentation on for the session, loads the corpus, and runs each program through the app's real run path: editor, worker, renderer, and composite.
- It does three rounds of a paced pass followed by an unpaced pass.
  The first round is a warm-up and is dropped.
- It never saves anything to the learner's draft: it bypasses autosave for the whole session, and restores the editor's previous contents when it finishes.
- It shows progress and a results table in the terminal panel, with a button that downloads a single JSON file containing the device info and every run report.

`app.js` gives it a narrow interface: run this code and resolve with its report, suspend autosave, and restore the editor.
The existing app code doesn't change beyond that.

**Device info collected:**

- User agent, `navigator.hardwareConcurrency`, `navigator.deviceMemory` (Chromium only), `devicePixelRatio`, and screen and canvas sizes.
- The GPU renderer string from WebGL's `WEBGL_debug_renderer_info`, where the browser exposes it.
- A free-text "machine" field the operator fills in before starting, for example `iMac 21.5" 2017, i5-7360U, 8 GB, HDD`, since browsers can't report the CPU model.
- Whether SharedArrayBuffer is available (`crossOriginIsolated`).
- Rendering acceleration, since tier 2 browsers may fall back to software Canvas2D:
  - **Hint:** whether a WebGL context created with `failIfMajorPerformanceCaveat: true` succeeds, and whether the renderer string names a software renderer (SwiftShader, llvmpipe, "Software", and similar).
    Browsers block WebGL and Canvas2D acceleration on the same old GPUs, but not always together, so this is only a hint.
  - **Measurement:** a Canvas2D throughput probe at the real canvas's size and device pixel ratio.
    It strokes 10,000 lines in the renderer's style, forces completion by reading back one pixel with `getImageData`, and records the time.
    It runs once before the corpus, and it is the number to compare between machines, whatever the hint says.

**Unsupported browsers.**
If `crossOriginIsolated` is false, the app can't run programs, so bench mode skips the corpus.
It still offers the JSON download, with the device info and `"supported": false`, so a device run on, say, Safari 13 on High Sierra is recorded as unsupported rather than lost.

**Real-device procedure**, documented in `bench/README.md`:

1. Plug the machine into power, close other apps, and wait a minute after login for background indexing to settle.
2. Open `https://luaturtle.com/?bench` in each browser for the machine's tier, fill in the machine field, and start:
   - Tier 1 (2017 iMac): Safari, then Chrome.
   - Tier 2 (2011 Mac mini or iMac): Firefox 115 ESR, then Chrome 116.
     Also open it once in the machine's Safari, to confirm it is reported as unsupported.
3. Keep the browser window in front and the display on until the run finishes; background tabs throttle timers and animation frames.
4. Download the JSON and commit it to `bench/devices/<machine>-<browser>-<date>.json`.
   Keep before and after files for each fix.

### 8. CI: `.github/workflows/check.yml`

The repo has no CI today.
This workflow runs on every push and pull request:

- Install Lua 5.4 and the Node version in `.nvmrc`.
- Run each suite in `test/` with `lua`.
- Run `node bench/harness.mjs --check`.

Only the count gates and the tests can fail the job.
The harness's timing table goes to the job summary for reference; CI runners are too variable for timing gates.

### 9. Deferred: automated browser runs

Playwright, driving `?bench` in Chromium (with CPU throttling of 4× and 6× through the DevTools protocol) and in WebKit.
This covers the main thread, which the Node harness can't, but results are only useful as trends.
It would add a `package.json` with Playwright as a dev dependency, so it waits until components 1–8 are in use and a device run shows the main thread is worth watching automatically.

### 10. Deferred: field telemetry

An opt-in beacon of run-report summaries (counts and phase percentiles, never the learner's code) to the existing Worker, stored in Workers Analytics Engine.
This sends data from learners' machines, so it needs an explicit privacy decision and a visible opt-in before any work starts.
This spec does not authorise building it.

## Module boundaries

| File | Owns | Knows nothing about |
|---|---|---|
| `public/bench/` | The programs and their gates | How they are run |
| `perf-worker.js` | Worker-side measurements | The main thread, the HUD |
| `perf.js` | Main-thread measurements and merged reports | The DOM, the HUD's layout |
| `perf-hud.js` | Displaying reports | How they are measured |
| `bench-mode.js` | Running the corpus in the app, device info, export | Measurement internals |
| `bench/harness.mjs` | Running the corpus in Node, gates, baselines | The main-thread renderer |

`worker.js`, `app.js` and `renderer.js` gain only call sites and the two `run` message fields.
`architecture.md` gets a Performance section describing these boundaries, the run report, and the `run` fields.

## Phases

1. Corpus, worker instrumentation, and the Node harness.
   Record the first baseline on the current code.
2. CI running the Lua suites and the harness check.
3. Main-thread instrumentation and the HUD.
4. Bench mode, and a first run on one machine from each tier before the incremental-frames fix lands.
   Fix the `:has()` gap from [Browser floor](#browser-floor) in this phase too.
5. The incremental-frames fix, with its new baseline and a second run on the same machines.
6. The deferred items, if the device results call for them.

## Acceptance criteria

1. `node bench/harness.mjs --check` passes on the current code once the first baseline is committed, and fails if the baseline's `segmentsSent` for any program is edited.
2. Running the harness twice in a row gives identical counts.
3. With instrumentation off, the app's behaviour and network requests are unchanged; `perf-worker.js` is the only extra file fetched on a normal load.
4. With `?perf`, the HUD appears, the `lt:` marks show up in the Chrome DevTools Performance panel, and `window.luaturtlePerf.lastReport()` returns a report that follows the schema.
5. `?bench` runs the whole corpus in Safari and Chrome, leaves the learner's saved draft untouched, and downloads a JSON file with device info, the Canvas2D probe result, and every run report.
6. `?bench` also runs the whole corpus in Firefox 115 ESR and Chrome 116, the tier 2 browsers.
7. In a browser without cross-origin isolation, `?bench` downloads a report marked `"supported": false` instead of hanging.
8. The site works in every browser at the [Browser floor](#browser-floor), with no rules or scripts that fail there except ones that degrade harmlessly.
9. The CI workflow passes on a pull request.
