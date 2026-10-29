// test/worker_files_test.mjs
//
// The worker (public/worker.js) mounts a fixed list of Lua files before it
// loads turtle/turtle_web.lua. Every turtle module that file reaches through
// require() must be on that list, or the VM fails to start in the browser
// while every Lua test, which reads public/ directly, still passes.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/worker_files_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');

// The paths in the worker's `const files = [ ... ]` list.
function mountedFiles(workerSource) {
    const list = workerSource.match(/const files = \[([\s\S]*?)\];/);
    assert.ok(list, "worker.js has no `const files = [...]` list");
    return [...list[1].matchAll(/'([^']+\.lua)'/g)].map(m => m[1]);
}

// The turtle modules a Lua source requires, as file paths.
function requiredFiles(luaSource) {
    return [...luaSource.matchAll(/require\(\s*["'](turtle\.[\w.]+)["']\s*\)/g)]
        .map(m => m[1].replace(/\./g, '/') + '.lua');
}

// Every file reachable from `start` through require().
function reachable(start) {
    const seen = new Set();
    const visit = path => {
        if (seen.has(path)) return;
        seen.add(path);
        requiredFiles(read(path)).forEach(visit);
    };
    visit(start);
    return seen;
}

test('requiredFiles reads both quote styles and nested names', () => {
    assert.deepEqual(requiredFiles(`local a = require("turtle.core")\nlocal b = require('turtle.x.y')`),
        ['turtle/core.lua', 'turtle/x/y.lua']);
});

test('the worker mounts every turtle module turtle_web.lua reaches', () => {
    const mounted = new Set(mountedFiles(read('worker.js')));
    const missing = [...reachable('turtle/turtle_web.lua')].filter(path => !mounted.has(path));
    assert.deepEqual(missing, []);
});
