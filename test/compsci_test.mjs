// test/compsci_test.mjs
//
// The /compsci page: its decisions (public/compsci.js), and the curriculum
// they read (public/compsci/): the courses in the order spec-compsci.md
// gives, ids unique across them, every reference naming something that
// exists, and every equation rendering with the page's KaTeX. The examples
// are library examples, run by test/library_test.lua and checked by
// test/library_test.mjs.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/compsci_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import {
    coursePath, joinCourses, allConcepts, conceptCount, defaultCourse, targetFromHash,
    conceptEntry, courseView, matchScore, searchView, coverage,
} from '../public/compsci.js';

const PUBLIC = new URL('../public/', import.meta.url);
const read = (path) => readFileSync(new URL(path, PUBLIC), 'utf8');
const json = (path) => JSON.parse(read(path));

// ---- compsci.js, on a small curriculum ----

const concept = (id, name, extra = {}) => ({
    id, name, summary: `${name}, said plainly.`, equations: [], revisits: [], examples: [], metaphors: [], applications: [],
    checked: [],
    ...extra,
});

const meta = [
    { id: 'calc', number: '18.01', name: 'Calculus', about: '', syllabus: { label: '', url: '' }, sources: ['book'] },
    { id: 'empty', number: '6.01', name: 'Not written', about: '', syllabus: { label: '', url: '' }, sources: [] },
    { id: 'la', number: '18.06', name: 'Linear Algebra', about: '', syllabus: { label: '', url: '' }, sources: ['book', 'gone'] },
];
const files = {
    calc: { units: [{ id: 'limits', name: 'Limits', concepts: [concept('derivative', 'Derivatives', { examples: ['slope', 'missing'] })] }] },
    la: { units: [
        { id: 'systems', name: 'Systems', concepts: [concept('elimination', 'Elimination')] },
        { id: 'eigen', name: 'Eigenvalues', concepts: [
            concept('eigenvalues', 'Eigenvalues and eigenvectors', {
                equations: [{ tex: 'Av = \\lambda v', says: 'A stretches v along its own line.' }],
                revisits: ['derivative', 'nowhere'],
                examples: ['arrows'],
                metaphors: [{ name: 'A spinning globe', says: 'Its axis stays on its own line.' }],
                applications: [{ name: 'PageRank', says: 'Ranks pages by a leading eigenvector.' }],
                checked: ['book', 'unknown'],
            }),
        ] },
    ] },
};
const courses = joinCourses(meta, files);
const catalog = { concepts: [], examples: [
    { id: 'slope', name: 'Slope', about: '', concepts: [] },
    { id: 'arrows', name: 'Arrows', about: '', concepts: [] },
] };
const sources = [{ id: 'book', title: 'A book', authors: 'Someone', license: 'CC BY 4.0', url: 'https://example.com/' }];
const ids = (list) => list.map((item) => item.id);

test('courses keep their order, and a course without a file has no units', () => {
    assert.deepEqual(ids(courses), ['calc', 'empty', 'la']);
    assert.deepEqual(courses[1].units, []);
    assert.equal(courses[2].number, '18.06');
    assert.deepEqual(courses.map(conceptCount), [1, 0, 2]);
    assert.equal(coursePath('la'), 'compsci/courses/la.json');
});

test('concepts come in curriculum order, with their unit and course', () => {
    assert.deepEqual(allConcepts(courses).map((e) => `${e.course.id}/${e.unit.id}/${e.concept.id}`), [
        'calc/limits/derivative', 'la/systems/elimination', 'la/eigen/eigenvalues',
    ]);
});

test('the page opens on the first course with concepts', () => {
    assert.equal(defaultCourse(courses).id, 'calc');
    assert.equal(defaultCourse(joinCourses(meta, {})).id, 'calc');   // none written: the first
    assert.equal(defaultCourse([]), null);
});

test('a link names a course or a concept', () => {
    assert.deepEqual(targetFromHash(courses, '#la'), { course: courses[2], concept: null });
    const linked = targetFromHash(courses, '#eigenvalues');
    assert.equal(linked.course.id, 'la');
    assert.equal(linked.concept.id, 'eigenvalues');
    assert.equal(targetFromHash(courses, 'derivative').course.id, 'calc');
    for (const hash of ['', '#', '#nope', '#%E0%A4%A']) assert.equal(targetFromHash(courses, hash), null);
});

test('a concept shows its examples, what it builds on, and its sources, skipping ids that name nothing', () => {
    const entry = conceptEntry(courses, catalog, sources, allConcepts(courses)[2]);
    assert.deepEqual(ids(entry.examples), ['arrows']);
    assert.deepEqual(entry.revisits.map((r) => `${r.course.id}/${r.concept.id}`), ['calc/derivative']);
    assert.deepEqual(ids(entry.checked), ['book']);
    assert.deepEqual(ids(conceptEntry(courses, catalog, sources, allConcepts(courses)[0]).examples), ['slope']);
});

test("a course's view has its units in order, each with its concepts", () => {
    const view = courseView(courses, catalog, sources, courses[2]);
    assert.deepEqual(view.units.map((u) => [u.unit.id, u.concepts.map((e) => e.concept.id)]), [
        ['systems', ['elimination']],
        ['eigen', ['eigenvalues']],
    ]);
    assert.deepEqual(ids(view.sources), ['book']);
    assert.deepEqual(courseView(courses, catalog, sources, courses[1]).units, []);
});

test('a search needs every word, and ranks a name over a summary, equation, metaphor or application over the course', () => {
    const [derivative, elimination, eigen] = allConcepts(courses);
    assert.equal(matchScore(eigen, ['eigen', 'nothing']), 0);
    assert.ok(matchScore(eigen, ['eigen']) > matchScore(eigen, ['igen']));       // a word's start beats its middle
    assert.ok(matchScore(eigen, ['eigenvalues']) > matchScore(eigen, ['stretches']));   // name beats equation
    assert.ok(matchScore(eigen, ['stretches']) > matchScore(elimination, ['linear']));  // equation beats course
    assert.equal(matchScore(eigen, ['globe']), matchScore(eigen, ['stretches']));   // a metaphor counts as the body
    assert.equal(matchScore(eigen, ['pagerank']), matchScore(eigen, ['stretches']));  // so does an application
    assert.equal(matchScore(derivative, ['18.01']), 1);
    assert.deepEqual(searchView(courses, catalog, sources, 'linear').map((e) => e.concept.id), ['elimination', 'eigenvalues']);
    assert.deepEqual(searchView(courses, catalog, sources, 'EIGEN').map((e) => e.concept.id), ['eigenvalues']);
    assert.deepEqual(searchView(courses, catalog, sources, '  '), []);
});

test('coverage counts each course’s concepts and those without an example, metaphor or application', () => {
    const none = { withoutExamples: [], withoutMetaphors: [], withoutApplications: [] };
    assert.deepEqual(coverage(courses), [
        { id: 'calc', number: '18.01', name: 'Calculus', concepts: 1, ...none,
            withoutMetaphors: ['derivative'], withoutApplications: ['derivative'] },
        { id: 'empty', number: '6.01', name: 'Not written', concepts: 0, ...none },
        { id: 'la', number: '18.06', name: 'Linear Algebra', concepts: 2, withoutExamples: ['elimination'],
            withoutMetaphors: ['elimination'], withoutApplications: ['elimination'] },
    ]);
});

// ---- The curriculum ----

const realMeta = json('compsci/courses.json');
const realSources = json('compsci/sources.json');
const realCatalog = json('library/catalog.json');
const realFiles = Object.fromEntries(realMeta.map((c) => [c.id, json(coursePath(c.id))]));
const curriculum = joinCourses(realMeta, realFiles);
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test('the courses are the math and computer science of the MIT Challenge, in its order', () => {
    assert.deepEqual(realMeta.map((c) => c.number), [
        '18.01', '18.02', '6.01', '18.03', '6.02', '6.042J', '6.006', '18.06', '6.041', '6.002', '6.046J',
        '6.034', '6.003', '6.004', '24.241', '6.033', '24.242', '6.011', '6.005', '6.801', '6.837', 'COSC 545',
    ]);
});

test('every course has its file, a name, an about, a syllabus link and known sources', () => {
    const known = new Set(realSources.map((s) => s.id));
    for (const course of realMeta) {
        assert.match(course.id, ID);
        assert.ok(existsSync(new URL(coursePath(course.id), PUBLIC)), `${course.id} has no file`);
        assert.ok(course.name?.trim() && course.about?.trim(), `${course.id} needs a name and an about`);
        assert.match(course.syllabus?.url ?? '', /^https?:\/\//, `${course.id} has no syllabus link`);
        assert.ok(course.syllabus.label?.trim(), `${course.id}'s syllabus has no label`);
        assert.ok(course.sources.length > 0, `${course.id} names no sources`);
        for (const id of course.sources) assert.ok(known.has(id), `${course.id} names unknown source ${id}`);
    }
});

test('every source has a title, authors, a license and a link, and ids are unique', () => {
    for (const source of realSources) {
        assert.match(source.id, ID);
        for (const key of ['title', 'authors', 'license']) assert.ok(source[key]?.trim(), `${source.id} has no ${key}`);
        assert.match(source.url, /^https:\/\//);
    }
    assert.equal(new Set(realSources.map((s) => s.id)).size, realSources.length);
});

test('ids are unique across the whole curriculum: courses, units within a course, and concepts', () => {
    const concepts = allConcepts(curriculum).map((e) => e.concept.id);
    assert.deepEqual(concepts, [...new Set(concepts)], 'a concept id is repeated');
    const courseIds = new Set(realMeta.map((c) => c.id));
    for (const id of concepts) assert.ok(!courseIds.has(id), `concept ${id} has a course's id`);
    for (const course of curriculum) {
        const units = course.units.map((u) => u.id);
        assert.deepEqual(units, [...new Set(units)], `${course.id} repeats a unit id`);
    }
});

test('every concept is whole, and names only things that exist', () => {
    const examples = new Set(realCatalog.examples.map((e) => e.id));
    const sourceIds = new Set(realSources.map((s) => s.id));
    const earlier = new Set();
    for (const course of curriculum) {
        for (const unit of course.units) {
            assert.match(unit.id, ID);
            assert.ok(unit.name?.trim() && unit.concepts.length > 0, `${course.id}/${unit.id} needs a name and concepts`);
            for (const c of unit.concepts) {
                const where = `${course.id}/${c.id}`;
                assert.match(c.id, ID);
                assert.ok(c.name?.trim() && c.summary?.trim(), `${where} needs a name and a summary`);
                assert.ok(c.equations.length > 0, `${where} has no equations`);
                for (const e of c.equations) assert.ok(e.tex?.trim() && e.says?.trim(), `${where} has an equation without its tex or says`);
                for (const id of c.examples) assert.ok(examples.has(id), `${where} names unknown example ${id}`);
                for (const id of c.revisits) assert.ok(earlier.has(id), `${where} revisits ${id}, which is not in an earlier course`);
                assert.ok(c.checked.length > 0, `${where} was checked against nothing`);
                for (const id of c.checked) assert.ok(sourceIds.has(id), `${where} names unknown source ${id}`);
                for (const key of ['metaphors', 'applications']) {
                    assert.ok(Array.isArray(c[key]), `${where} has no ${key} list`);
                    for (const m of c[key]) assert.ok(m.name?.trim() && m.says?.trim(), `${where} has one of its ${key} without a name or says`);
                }
            }
        }
        for (const entry of allConcepts([course])) earlier.add(entry.concept.id);
    }
});

test("every equation renders with the page's KaTeX", () => {
    const module = { exports: {} };
    runInNewContext(read('vendor/katex/katex.min.js'), { module, exports: module.exports });
    const katex = module.exports;
    for (const { concept: c, course } of allConcepts(curriculum)) {
        for (const e of c.equations) {
            assert.doesNotThrow(() => katex.renderToString(e.tex, { displayMode: true, throwOnError: true }),
                `${course.id}/${c.id}: ${e.tex}`);
        }
    }
});
