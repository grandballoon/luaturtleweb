### Fixing the /public folder

Done. The published surface is now an allow-list.

Changes
Site moved into public/ via git mv, so git records all eight entries as renames and history follows them. index.html, renderer.js, worker.js, wasmoon.js, glue.wasm, _headers, serve.json, and turtle/ moved together; no source edits were needed, since every reference between them was already relative.

wrangler.jsonc — assets.directory is now "./public", with a comment saying why it must not go back to the root.

architecture.md — the deployment section describes the new boundary and records that the root layout previously published everything, so the reason for the directory isn't lost. Added a line under the component table noting its paths are relative to public/.

.gitignore — added .DS_Store.

Verification
Exposure closed, on the same probes that failed before:


404  /fixes.md  /architecture.md  /loveport.md  /plan.md  /buglist.md
404  /wrangler.jsonc  /.DS_Store  /.git/config  /.git/HEAD  /.gitignore
200  /  /worker.js  /renderer.js  /wasmoon.js  /glue.wasm  /turtle/core.lua
wrangler deploy --dry-run reads 12 files from public/ — the site and nothing else. COOP/COEP still applied (_headers is picked up from the new assets root; wrangler parsed 1 header rule), which matters because the whole animation model dies without cross-origin isolation.

Full E2E rerun in headless Chrome against the new layout: VM ready, program ran to Done, POS 100.0 -100.0 / HEADING -90, sole wasm request http://localhost:8799/glue.wasm, zero unpkg requests, no console errors. PASS.

Two things for you:

The live .git is still on production until you redeploy. https://luaturtle.com/.git/config returns 200 right now; the fix is not retroactive.
.DS_Store is staged for commit (A .DS_Store) — it was added to the index between my first look and this one. The .gitignore entry won't affect it while it's tracked; git rm --cached .DS_Store will. I left your index alone rather than unstaging something you may have added deliberately.
Nothing is committed. fixes.md shows as modified because you have it open in the editor — I didn't touch it.
