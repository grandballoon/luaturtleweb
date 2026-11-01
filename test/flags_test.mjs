// test/flags_test.mjs
//
// Feature flags' pure core (public/flags.js): reading public/flags.json,
// a tab's ?flags= overrides, and the edits tools/flags.mjs makes.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/flags_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { isOn, readFlags, resolveFlags, setFlag, formatFlags } = await import('../public/flags.js');

const file = { share: true, export: false, lessons: true };

test('the checked-in file is a flat object of booleans', () => {
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

test('only boolean entries of an object are read', () => {
    assert.deepEqual(readFlags({ a: true, b: 'no', c: 0, d: false }), { a: true, d: false });
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
    assert.equal(formatFlags({}), '');
});
