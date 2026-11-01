// test/library_test.mjs
//
// The /library page: its decisions (public/library.js), the catalog that
// names its examples (public/library/catalog.json) and that every one has
// its program and an up-to-date preview, and the preview tool's decisions
// (tools/library-previews.mjs). test/library_test.lua runs the programs.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/library_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import {
    normalize, tokens, matchScore, libraryView, conceptCounts, exampleFromHash,
    programPath, videoPath, posterPath,
} from '../public/library.js';
import { previewHash, toMake } from '../tools/library-previews.mjs';

const PUBLIC = new URL('../public/', import.meta.url);
const read = (path) => readFileSync(new URL(path, PUBLIC), 'utf8');

// ---- library.js, on a small catalog ----

const small = {
    concepts: [
        { id: 'trig', name: 'Trigonometry', about: 'Angles.' },
        { id: 'fractal', name: 'Fractals', about: 'Self-similar.' },
        { id: 'unused', name: 'Unused', about: 'Nothing lists it.' },
    ],
    examples: [
        { id: 'sine', name: 'Sine waves', about: 'Waves up and down.', concepts: ['trig'] },
        { id: 'koch', name: 'Koch snowflake', about: 'A snowflake with sine-free bumps.', concepts: ['fractal'] },
        { id: 'tree', name: 'Fractal tree', about: 'Branches at an angle.', concepts: ['fractal', 'trig'] },
    ],
};
const ids = (examples) => examples.map((e) => e.id);
const byId = new Map(small.concepts.map((c) => [c.id, c]));

test('searching ignores case and accents, and splits on spaces and commas', () => {
    assert.equal(normalize('Sierpiński'), 'sierpinski');
    assert.deepEqual(tokens('  Koch, SNOW  '), ['koch', 'snow']);
    assert.deepEqual(tokens(''), []);
});

test('a match needs every word, and ranks name over concept over the rest', () => {
    const [sine, koch, tree] = small.examples;
    assert.equal(matchScore(koch, byId, ['koch', 'missing']), 0);
    assert.ok(matchScore(sine, byId, ['sine']) > matchScore(koch, byId, ['sine']));   // name beats about
    assert.ok(matchScore(tree, byId, ['trig']) > matchScore(koch, byId, ['bump']));   // concept beats about
    assert.ok(matchScore(sine, byId, ['sin']) > matchScore(sine, byId, ['ine']));     // a word's start beats its middle
});

test('with nothing searched, the gallery has a section per concept, with every example that lists it', () => {
    const view = libraryView(small);
    assert.deepEqual(view.sections.map((s) => [s.id, s.title, ids(s.examples)]), [
        ['trig', 'Trigonometry', ['sine', 'tree']],
        ['fractal', 'Fractals', ['koch', 'tree']],
    ]);
    assert.equal(view.count, 3);   // the tree shows twice but counts once
});

test('a selected concept shows only its own section', () => {
    const view = libraryView(small, { concept: 'fractal' });
    assert.deepEqual(view.sections.map((s) => s.id), ['fractal']);
    assert.equal(view.count, 2);
    assert.deepEqual(libraryView(small, { concept: 'unused' }), { sections: [], count: 0 });
});

test('a search shows one section of results, best first, within the selected concept', () => {
    const all = libraryView(small, { query: 'sine' });
    assert.deepEqual(all.sections.map((s) => s.title), ['Results']);
    assert.deepEqual(ids(all.sections[0].examples), ['sine', 'koch']);

    const fractals = libraryView(small, { query: 'sine', concept: 'fractal' });
    assert.deepEqual(fractals.sections.map((s) => s.title), ['Results in Fractals']);
    assert.deepEqual(ids(fractals.sections[0].examples), ['koch']);

    assert.deepEqual(libraryView(small, { query: 'nothing like it' }), { sections: [], count: 0 });
});

test('concept counts and links', () => {
    assert.deepEqual(conceptCounts(small), { trig: 2, fractal: 2, unused: 0 });
    assert.equal(exampleFromHash(small, '#koch').id, 'koch');
    assert.equal(exampleFromHash(small, 'tree').id, 'tree');
    assert.equal(exampleFromHash(small, '#nope'), null);
    assert.equal(exampleFromHash(small, '#%E0%A4%A'), null);
    assert.equal(exampleFromHash(small, ''), null);
});

// ---- The catalog ----

const catalog = JSON.parse(read('library/catalog.json'));
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test('every concept and example has an id, a name and an about, and ids are unique', () => {
    for (const list of [catalog.concepts, catalog.examples]) {
        assert.ok(list.length > 0);
        for (const item of list) {
            assert.match(item.id, ID, `${item.id} is not a lowercase-hyphenated id`);
            assert.ok(item.name?.trim(), `${item.id} has no name`);
            assert.ok(item.about?.trim(), `${item.id} has no about`);
        }
        const seen = list.map((item) => item.id);
        assert.deepEqual(seen, [...new Set(seen)], 'an id is repeated');
    }
});

test('every example lists known concepts, and every concept has examples', () => {
    const known = new Set(catalog.concepts.map((c) => c.id));
    for (const example of catalog.examples) {
        assert.ok(example.concepts.length > 0, `${example.id} lists no concepts`);
        assert.deepEqual(example.concepts, [...new Set(example.concepts)], `${example.id} repeats a concept`);
        for (const id of example.concepts) assert.ok(known.has(id), `${example.id} lists unknown concept ${id}`);
    }
    const counts = conceptCounts(catalog);
    for (const [id, n] of Object.entries(counts)) assert.ok(n > 0, `no example lists ${id}`);
});

test('the catalog names every program, and every program it names exists', () => {
    const files = readdirSync(new URL('library/programs/', PUBLIC)).filter((f) => f.endsWith('.lua'));
    assert.deepEqual(
        catalog.examples.map((e) => programPath(e.id)).sort(),
        files.map((f) => `library/programs/${f}`).sort(),
    );
});

test('every example has a preview video and poster, made from its program as it is now', () => {
    const manifest = JSON.parse(read('library/previews/manifest.json'));
    for (const { id } of catalog.examples) {
        assert.ok(existsSync(new URL(videoPath(id), PUBLIC)), `${id} has no video: npm run previews`);
        assert.ok(existsSync(new URL(posterPath(id), PUBLIC)), `${id} has no poster: npm run previews`);
        assert.equal(manifest[id], previewHash(read(programPath(id))), `${id}'s preview is stale: npm run previews`);
    }
    assert.deepEqual(Object.keys(manifest).sort(), catalog.examples.map((e) => e.id).sort());
});

// ---- The preview tool ----

test('the tool remakes named previews, all of them, or the stale ones', () => {
    const all = ['a', 'b', 'c'];
    const hashes = { a: '1', b: '2', c: '3' };
    const manifest = { a: '1', b: 'old' };
    assert.deepEqual(toMake(all, hashes, manifest), ['b', 'c']);
    assert.deepEqual(toMake(all, hashes, manifest, { all: true }), all);
    assert.deepEqual(toMake(all, hashes, manifest, { named: ['c', 'a'] }), ['a', 'c']);
    assert.notEqual(previewHash('forward(1)'), previewHash('forward(2)'));
});
