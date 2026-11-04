// test/flags_test.mjs
//
// Feature flags' pure core (public/flags.js): reading public/flags.json,
// staging-only flags, a tab's ?flags= overrides, and the edits
// tools/flags.mjs makes.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/flags_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { isOn, readFlags, resolveFlags, setFlag, formatFlags, isProduction, PRODUCTION_HOSTS } = await import('../public/flags.js');

const file = { share: true, export: false, lessons: true };

test('the checked-in file is a flat object of flag values', () => {
    const shipped = JSON.parse(readFileSync(new URL('../public/flags.json', import.meta.url), 'utf8'));
    assert.deepEqual(readFlags(shipped), shipped);
    assert.ok(Object.keys(shipped).length > 0);
});

test('a flag is on unless something turns it off', () => {
    assert.equal(isOn(file, 'share'), true);
    assert.equal(isOn(file, 'export'), false);
    assert.equal(isOn(file, 'unknown'), true);
    assert.equal(isOn({}, 'share'), true);
});

test('only flag values of an object are read', () => {
    assert.deepEqual(readFlags({ a: true, b: 'no', c: 0, d: false, e: 'staging' }), { a: true, d: false, e: 'staging' });
    assert.deepEqual(readFlags(null), {});
    assert.deepEqual(readFlags([true]), {});
    assert.deepEqual(readFlags('x'), {});
});

test('without a query, the file decides', () => {
    assert.deepEqual(resolveFlags(file), file);
    assert.deepEqual(resolveFlags(file, ''), file);
    assert.deepEqual(resolveFlags(file, '?other=1'), file);
});

test('the query turns named flags on or off', () => {
    assert.deepEqual(resolveFlags(file, '?flags=-share,export'), { share: false, export: true, lessons: true });
    assert.deepEqual(resolveFlags(file, '?flags=-lessons'), { share: true, export: false, lessons: false });
    assert.deepEqual(resolveFlags(file, '?flags=%20-share%20'), { share: false, export: false, lessons: true });
});

test('the query ignores flags the file does not name', () => {
    assert.deepEqual(resolveFlags(file, '?flags=-shar,new,'), file);
});

test('resolving never changes the file', () => {
    const copy = { ...file };
    resolveFlags(copy, '?flags=-share');
    assert.deepEqual(copy, file);
});

test('setFlag sets a named flag and leaves the file alone', () => {
    const copy = { ...file };
    assert.deepEqual(setFlag(copy, 'share', false), { flags: { share: false, export: false, lessons: true } });
    assert.deepEqual(setFlag(copy, 'export', true), { flags: { share: true, export: true, lessons: true } });
    assert.deepEqual(copy, file);
});

test('setFlag refuses a flag the file does not name', () => {
    assert.deepEqual(setFlag(file, 'shar', false),
        { error: 'No flag named "shar". Flags: share, export, lessons' });
});

test('formatFlags lines names up', () => {
    assert.equal(formatFlags(file), 'share    on\nexport   off\nlessons  on');
    assert.equal(formatFlags({ a: 'staging' }), 'a  staging');
    assert.equal(formatFlags({}), '');
});

// ---- Staging-only flags ----

const staged = { share: true, beta: 'staging' };

test('a staging flag is on off the production site', () => {
    assert.deepEqual(resolveFlags(staged, '', 'staging.luaturtle.com'), { share: true, beta: true });
    assert.deepEqual(resolveFlags(staged, '', 'localhost'), { share: true, beta: true });
    assert.deepEqual(resolveFlags(staged, '', '127.0.0.1'), { share: true, beta: true });
});

test('a staging flag is off in production', () => {
    assert.deepEqual(resolveFlags(staged, '', 'luaturtle.com'), { share: true, beta: false });
    assert.deepEqual(resolveFlags(staged, '', 'www.luaturtle.com'), { share: true, beta: false });
    assert.deepEqual(resolveFlags(staged, '', 'LuaTurtle.com'), { share: true, beta: false });
    assert.equal(isOn(resolveFlags(staged, '', 'luaturtle.com'), 'beta'), false);
});

test('no query turns a staging flag on in production', () => {
    assert.deepEqual(resolveFlags(staged, '?flags=beta', 'luaturtle.com'), { share: true, beta: false });
    assert.deepEqual(resolveFlags(staged, '?flags=-share,beta', 'luaturtle.com'), { share: false, beta: false });
});

test('a query can turn a staging flag off in staging', () => {
    assert.deepEqual(resolveFlags(staged, '?flags=-beta', 'staging.luaturtle.com'), { share: true, beta: false });
    assert.deepEqual(resolveFlags(staged, '?flags=beta', 'staging.luaturtle.com'), { share: true, beta: true });
});

test('setFlag can make a flag staging-only', () => {
    assert.deepEqual(setFlag(staged, 'share', 'staging'), { flags: { share: 'staging', beta: 'staging' } });
    assert.deepEqual(setFlag(staged, 'beta', true), { flags: { share: true, beta: true } });
});

test("production's hostnames are wrangler.jsonc's production routes", () => {
    const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const top = config.slice(0, config.indexOf('"env"'));
    const routes = [...top.matchAll(/"pattern":\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(routes, PRODUCTION_HOSTS);
    assert.equal(isProduction('staging.luaturtle.com'), false);
});

// The flags file, the page's data-feature markup, app.js's feature() calls
// and the stylesheet's hiding rule have to agree, or a feature that is off
// shows while flags.json loads, or a flag switches nothing off.
const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const unique = (names) => [...new Set(names)].sort();

test('every flag marks its elements on the page and guards its wiring', () => {
    const flagNames = unique(Object.keys(JSON.parse(read('flags.json'))));
    const marked = unique([...read('index.html').matchAll(/\bdata-feature="([^"]+)"/g)].map(m => m[1]));
    const guarded = unique([...read('app.js').matchAll(/\bfeature\('([^']+)'\)/g)].map(m => m[1]));
    assert.deepEqual(marked, flagNames);
    assert.deepEqual(guarded, flagNames);
});

test('the stylesheet hides flagged elements until the flags are decided', () => {
    assert.match(read('styles.css'), /:root:not\(\[data-flags\]\) \[data-feature\] \{ display: none !important; \}/);
    assert.match(read('app.js'), /document\.documentElement\.dataset\.flags = 'ready'/);
});
