# Fixes

Outstanding work on Lua Turtle Web, ordered by consequence.

## 5. Detect drift between this repo and the desktop core

`turtle/core.lua`, `turtle/screen.lua`, and `turtle/colors.lua` are shared verbatim with the desktop Cairo/SDL2 implementation but are synced by hand.
Nothing currently detects divergence, which makes this the most likely long-term source of subtle, hard-to-diagnose bugs.

Fix: add a checksum comparison or a scripted sync check against the desktop repo so divergence is surfaced rather than discovered.

## 6. Smoke-test the Lua sources and any shipped code samples

There are currently no tests.
`core.lua` and `screen.lua` are pure and platform-free by design, so they are testable with plain `lua` today at low cost.

This becomes load-bearing if a library of static code samples is added: samples written against the turtle API will break silently when the API moves.
Any sample intended to be runnable needs a headless runner that actually executes it, otherwise the library rots faster than the code does.

## Watch item — cross-origin isolation

The animation model rests entirely on `SharedArrayBuffer`, `Atomics.wait`, and COOP/COEP cross-origin isolation.
This is the one dependency vendoring cannot remove, and browser-vendor policy here has already shifted once post-Spectre.

No action needed now.
`loveport.md` documents the escape hatch — Lua coroutines replace the whole cross-thread apparatus — and that should stay recorded as a contingency rather than a plan.
