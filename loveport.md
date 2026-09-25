The short answer: your architecture was built for exactly this kind of port. The core (core.lua, screen.lua, colors.lua) is renderer-neutral and moves verbatim; what you write is a third execution host plus a LOVE renderer. And the best part is that the hardest machinery in the web version — the Web Worker, SharedArrayBuffer, Atomics handshake — exists only because JavaScript can't block its main thread. Lua coroutines solve that problem natively, so in LOVE the entire cross-thread apparatus collapses into coroutine.yield.

The one big architectural move
Run user code in a coroutine inside the same VM as the renderer:

_raw_post_frame() in the host becomes coroutine.yield(frame_delay) — that's the whole frame protocol. User code stays fully synchronous from its own point of view, exactly as now.
love.update(dt) acts as the scheduler: accumulate dt, and when the pending delay has elapsed, coroutine.resume the user program until its next yield.
love.draw renders the current projection. Since everything is in one process, the renderer calls screen:visible_segments() directly — the frame snapshot, all five _bridge_get_* pull accessors, and the structured-clone serialization disappear entirely. The segment log becomes literally shared state instead of a copied one.
Stop becomes trivial: don't resume the coroutine and drop the reference. No futex wake-up dance, no __STOPPED__ sentinel unwinding.
(The alternative — love.thread + Channels — would mirror your worker model one-to-one, but it forces you back into serializing frames across threads. The coroutine design is simpler, idiomatic LOVE, and strictly better here since Lua coroutines never preempt mid-command.)

Component mapping
Web piece	LOVE equivalent
worker.js + SAB handshake	Coroutine scheduler in main.lua (~40 lines)
turtle_web.lua	turtle_love.lua — a near-fork where _bridge_post_frame(delay) → coroutine.yield(delay); all the tracer/undo/pacing logic is host logic and carries over untouched
renderer.js commit canvas	love.graphics.newCanvas offscreen render target — same "durable ink vs. overlay" split, same full vector replay per frame
Viewport math (screenX/screenY)	Ports nearly 1:1 — LOVE is y-down screen space like Canvas2D, so the turtle→screen flip math is identical. Use love.graphics.push/translate/scale or a love.math.newTransform instead of folding it into every coordinate
Zoom/pan mouse handlers	love.wheelmoved (your zoomAt math unchanged), love.mousemoved with button held for pan
DPR handling	t.window.highdpi = true in conf.lua + love.graphics.getDPIScale()
PNG export	canvas:newImageData():encode("png", "turtle.png") into the save directory, then love.system.openURL to reveal it
debug.sethook runaway guard	Same call — but see the LuaJIT caveat below
Sandbox load(code, name, "t", env)	Works as-is; LuaJIT supports the 4-argument load as one of its always-on 5.2 extensions
CodeMirror editor	No in-app equivalent — see below
Where LOVE's API genuinely buys you things
Fills done right. love.graphics.polygon("fill", ...) only handles convex; love.math.triangulate handles simple polygons but fails on self-intersecting ones — and self-intersecting fills (star programs) are classic turtle. The robust approach is the stencil trick: draw a triangle fan from the first vertex with love.graphics.setStencilMode in invert mode, then fill the bounding quad through the stencil. That gives you even-odd fill for arbitrary polygons. Note Canvas2D defaults to nonzero winding, so a star's center will render differently — decide which rule you want and document it.
Line quality. setLineWidth, setLineJoin("miter"/"bevel"), setLineStyle("smooth"), plus MSAA (t.window.msaa = 4 in conf.lua). LOVE lines have no cap style, so if your web renderer uses round caps for thick pens, draw small filled circles at segment endpoints — cheap and pixel-matches Canvas2D.
Incremental rendering as a later optimization. The log is append-only, so instead of full replay every frame you can draw only new segments onto the persistent Canvas, and fall back to full replay only on undo/clear/clearstamp/zoom/pan/resize. Your "mark, don't delete" design tells you exactly when invalidation happens. Full replay first, though — it's what you have and it's correct.
Text. love.graphics.newFont + Font:getWidth for your left/center/right alignment; cache Font objects keyed by size since creation isn't free.
The editor question. LOVE has no text widget, and embedding a Lua editor library is a rabbit hole. The idiomatic LOVE workflow is better anyway: watch a sketch.lua file (poll love.filesystem.getInfo(...).modtime in love.update) and hard-reset + re-run on save. External editor + instant re-run is a great creative-coding loop — arguably better DX than the in-browser editor. Bind keys for re-run/stop/export.
Risks and gotchas
LuaJIT is Lua 5.1-era, not 5.4. I grepped your turtle/ sources for 5.4 syntax (//, bitwise operators, goto, <const>, math.type, string.pack) and found none, so the core files very likely run verbatim. But grep can't catch stdlib differences (table.unpack vs unpack is the usual one) — first step of the port should be running core.lua/screen.lua under luajit with a smoke script.
The runaway guard half-breaks under JIT. LuaJIT's count hooks don't fire inside JIT-compiled loops, so a hot infinite loop can evade the 50M-instruction limit. Call jit.off(true, true) on the user coroutine (or run the sandbox with JIT disabled). Turtle programs are frame-bound anyway; you'll never notice the interpreter speed.
Color scale. LOVE 11+ uses 0–1 floats for colors. Check what range your segment records carry and normalize once at the render boundary, not in core.
A desktop host already exists. Your Cairo/SDL2 repo's host uses blocking render(); sleep() — that pattern is forbidden in LOVE (blocking love.update freezes the window). So the LOVE host is a fork of turtle_web.lua's structure (yield points at every _maybe_post_frame), not the desktop one, even though LOVE feels more like the desktop target. Worth stating in the port's architecture doc, because it's counterintuitive.
Suggested sequence
New repo (or love/ sibling): conf.lua, main.lua, copy turtle/ verbatim; verify core under luajit with a headless script.
Port renderer.js → renderer.lua: background, grid, segment painter (fills-first ordering pass carries over), turtle heads, commit Canvas.
Write turtle_love.lua by forking turtle_web.lua: replace the bridge with coroutine.yield, delete the pull accessors.
Scheduler + input in main.lua: resume-on-elapsed-delay, wheel zoom, drag pan, resize.
File-watch runner, stop/re-run keys, PNG export.
E2E: run the same sample programs against both the web and LOVE versions and compare output side by side — same speed/tracer settings should produce the same frame cadence and final image.
Rough size estimate: the whole LOVE side is smaller than what it replaces — worker.js (192 lines) becomes ~40 lines of scheduler, renderer.js (367 lines) ports roughly line-for-line, and turtle_web.lua (624 lines) loses its bridge scaffolding. If you want, I can start the port — step 1 and 2 are mechanical and I can validate the core files under LuaJIT right away.