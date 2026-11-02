// test/creative_test.mjs
//
// The /creative page: its decisions (public/creative.js), and the works
// they read (public/creative/works.json): ids unique, every work whole and
// credited, every license one the page knows, and every example and
// concept it names existing in the library or the curriculum.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/creative_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    LICENSES, allWorks, targetFromHash, workEntry, pageView, matchScore, searchView, coverage,
} from '../public/creative.js';
import { coursePath, joinCourses, allConcepts } from '../public/compsci.js';

const PUBLIC = new URL('../public/', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, PUBLIC), 'utf8'));

// ---- creative.js, on a few works ----

const work = (id, name, extra = {}) => ({
    id, name, artist: 'Someone', year: '2001', context: 'A blog post.', url: 'https://example.com/',
    code: null, license: 'mit', picture: 'Lines.', math: 'Noise.', examples: [], relates: { library: [], compsci: [] },
    ...extra,
});

const data = { groups: [
    { id: 'art', name: 'Generative art', about: '', works: [
        work('flow', 'Flow Fields', { artist: 'Tyler Hobbs', math: 'Angles from Perlin noise.', examples: ['spiral', 'gone'],
            relates: { library: ['trig', 'nowhere'], compsci: ['eigen', 'nothing'] } }),
        work('gravel', 'Schotter', { artist: 'Georg Nees', license: 'not-public' }),
    ] },
    { id: 'tiles', name: 'Patterns', about: '', works: [work('truchet', 'Truchet tiles', { examples: ['spiral'] })] },
] };
const catalog = {
    concepts: [{ id: 'trig', name: 'Trigonometry' }],
    examples: [{ id: 'spiral', name: 'Spiral', about: '', concepts: [] }],
};
const courses = joinCourses(
    [{ id: 'la', number: '18.06', name: 'Linear Algebra', about: '', syllabus: { label: '', url: '' }, sources: [] }],
    { la: { units: [{ id: 'u', name: 'Eigen', concepts: [{ id: 'eigen', name: 'Eigenvalues', summary: '', equations: [],
        revisits: [], examples: [], metaphors: [], applications: [], checked: [] }] }] } },
);
const ids = (list) => list.map((item) => item.id);

test('allWorks lists every work in page order with its group', () => {
    assert.deepEqual(allWorks(data).map((e) => [e.group.id, e.work.id]), [['art', 'flow'], ['art', 'gravel'], ['tiles', 'truchet']]);
});

test('a hash names a group or a work, and nothing else', () => {
    assert.equal(targetFromHash(data, '#tiles').group.id, 'tiles');
    assert.equal(targetFromHash(data, '#tiles').work, null);
    const found = targetFromHash(data, '#gravel');
    assert.deepEqual([found.group.id, found.work.id], ['art', 'gravel']);
    assert.equal(targetFromHash(data, '#nope'), null);
    assert.equal(targetFromHash(data, ''), null);
    assert.equal(targetFromHash(data, '#%E0%A4%A'), null);
});

test('a work’s entry resolves its license, examples and concepts, leaving out what names nothing', () => {
    const entry = workEntry(catalog, courses, allWorks(data)[0]);
    assert.deepEqual(entry.license, { name: 'MIT', port: true });
    assert.deepEqual(ids(entry.examples), ['spiral']);
    assert.deepEqual(ids(entry.library), ['trig']);
    assert.deepEqual(entry.compsci.map((c) => [c.concept.id, c.course.id]), [['eigen', 'la']]);
    assert.deepEqual(workEntry(catalog, courses, allWorks(data)[1]).license, { name: 'Code not public', port: false });
});

test('only permissive licenses may be ported', () => {
    const portable = Object.entries(LICENSES).filter(([, l]) => l.port).map(([id]) => id);
    assert.deepEqual(portable, ['mit', 'bsd-3-clause', 'apache-2.0', 'unlicense']);
});

test('the page view keeps the groups and their works in order', () => {
    assert.deepEqual(pageView(data, catalog, courses).map((g) => [g.group.id, g.works.map((e) => e.work.id)]),
        [['art', ['flow', 'gravel']], ['tiles', ['truchet']]]);
});

test('a search needs every word, and ranks a name over an artist over the rest', () => {
    const [flow] = allWorks(data);
    assert.equal(matchScore(flow, ['flow', 'nothing']), 0);
    assert.ok(matchScore(flow, ['flow']) > matchScore(flow, ['low']));    // a word's start beats its middle
    assert.ok(matchScore(flow, ['fields']) > matchScore(flow, ['hobbs'])); // name beats artist
    assert.ok(matchScore(flow, ['hobbs']) > matchScore(flow, ['perlin'])); // artist beats math
    assert.deepEqual(searchView(data, catalog, courses, 'NEES').map((e) => e.work.id), ['gravel']);
    assert.deepEqual(searchView(data, catalog, courses, 'generative').map((e) => e.work.id), ['flow', 'gravel']);
    assert.deepEqual(searchView(data, catalog, courses, '  '), []);
});

test('coverage lists the works with no turtle version', () => {
    assert.deepEqual(coverage(data), { works: 3, withoutExamples: ['gravel'] });
});

// ---- The works ----

const realWorks = json('creative/works.json');
const realCatalog = json('library/catalog.json');
const realMeta = json('compsci/courses.json');
const curriculum = joinCourses(realMeta, Object.fromEntries(realMeta.map((c) => [c.id, json(coursePath(c.id))])));
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test('ids are unique across groups and works', () => {
    const all = [...realWorks.groups.map((g) => g.id), ...allWorks(realWorks).map((e) => e.work.id)];
    for (const id of all) assert.match(id, ID);
    assert.deepEqual(all, [...new Set(all)]);
});

test('every group has a name, an about and works', () => {
    for (const group of realWorks.groups) {
        assert.ok(group.name?.trim() && group.about?.trim(), `${group.id} needs a name and an about`);
        assert.ok(group.works.length > 0, `${group.id} has no works`);
    }
});

test('every work is credited, whole, and names only things that exist', () => {
    const examples = new Set(realCatalog.examples.map((e) => e.id));
    const library = new Set(realCatalog.concepts.map((c) => c.id));
    const compsci = new Set(allConcepts(curriculum).map((e) => e.concept.id));
    for (const { work: w } of allWorks(realWorks)) {
        for (const key of ['name', 'artist', 'context', 'picture', 'math']) assert.ok(w[key]?.trim(), `${w.id} has no ${key}`);
        assert.equal(typeof w.year, 'string', `${w.id}'s year is not a string`);
        assert.match(w.url, /^https?:\/\//, `${w.id} has no link to the original`);
        if (w.code !== null) {
            assert.ok(w.code.label?.trim(), `${w.id}'s code has no label`);
            assert.match(w.code.url, /^https?:\/\//, `${w.id}'s code has no link`);
        }
        assert.ok(w.license in LICENSES, `${w.id} has unknown license ${w.license}`);
        for (const id of w.examples) assert.ok(examples.has(id), `${w.id} names unknown example ${id}`);
        for (const id of w.relates.library) assert.ok(library.has(id), `${w.id} names unknown library concept ${id}`);
        for (const id of w.relates.compsci) assert.ok(compsci.has(id), `${w.id} names unknown curriculum concept ${id}`);
    }
});
