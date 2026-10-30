// test/lessons_test.mjs
//
// The Lessons sidebar's pure core (public/lessons.js): the lessons as pages,
// moving between them, the contents, and paragraphs with `code`.
// test/lessons_test.lua checks the lessons themselves.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/lessons_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
    lessonPages, pageIndex, movePage, pagerView, contents, paragraphParts, keyAction, pageAfter, KIND_LABELS,
    lineNumbers, lineRange,
} = await import('../public/lessons.js');

const example = (slug, kind = 'plane') => ({
    slug, title: `Title ${slug}`, kind, text: [`About ${slug}`],
    steps: [{ text: [`Set up ${slug}`], code: 'local n = 1', first: 1, fold: kind === 'plane' },
            { text: ['Print it.', 'Then stop.'], code: `print("${slug}")`, first: 3 }],
    code: `local n = 1\n\nprint("${slug}")`,
});

// Two chapters: three lessons, five examples.
const chapters = [
    {
        title: 'Linear', summary: 'Lines.',
        lessons: [
            { slug: 'balance', title: 'Balance', summary: 'Both sides.', examples: [example('a'), example('b', 'turtle')] },
            { slug: 'subst', title: 'Substitution', summary: 'Put it in.', examples: [example('c')] },
        ],
    },
    {
        title: 'Quadratic', summary: 'Squares.',
        lessons: [
            {
                slug: 'factor', title: 'Factoring', summary: 'Products.',
                examples: [{ ...example('d'), problem: 'A garden.', source: 'AoPS 6-2' }, example('e', 'turtle')],
            },
        ],
    },
];

test('every example is a page, in reading order, with an id from its slugs', () => {
    const pages = lessonPages(chapters);
    assert.deepEqual(pages.map((p) => p.id), ['balance/a', 'balance/b', 'subst/c', 'factor/d', 'factor/e']);
});

test('a page knows its chapter, lesson, and place in the lesson', () => {
    const page = lessonPages(chapters)[4];
    assert.deepEqual(page.chapter, { index: 1, title: 'Quadratic', summary: 'Squares.' });
    assert.deepEqual(page.lesson, { index: 0, slug: 'factor', title: 'Factoring', summary: 'Products.' });
    assert.equal(page.example, 1);
    assert.equal(page.examples, 2);
    assert.equal(page.kind, 'turtle');
    assert.deepEqual(page.text, ['About e']);
    assert.equal(page.code, 'local n = 1\n\nprint("e")');
});

test('a word problem keeps its problem and source; other pages have none', () => {
    const pages = lessonPages(chapters);
    assert.equal(pages[3].problem, 'A garden.');
    assert.equal(pages[3].source, 'AoPS 6-2');
    assert.equal(pages[0].problem, null);
    assert.equal(pages[0].source, null);
});

test('Lua tables that arrive as key-ordered objects read like arrays', () => {
    // Wasmoon turns a Lua sequence into an array, but an empty table into {}.
    const asObjects = [{ ...chapters[0], lessons: { 1: chapters[0].lessons[0], 2: { ...chapters[0].lessons[1], examples: {} } } }];
    assert.deepEqual(lessonPages(asObjects).map((p) => p.id), ['balance/a', 'balance/b']);
    assert.deepEqual(lessonPages({}), []);
    assert.deepEqual(lessonPages(undefined), []);
});

test('a saved place is found by id, and an unknown one starts at the first page', () => {
    const pages = lessonPages(chapters);
    assert.equal(pageIndex(pages, 'factor/d'), 3);
    assert.equal(pageIndex(pages, 'gone/away'), 0);
    assert.equal(pageIndex(pages, null), 0);
});

test('moving stays within the pages', () => {
    assert.equal(movePage(0, 1, 5), 1);
    assert.equal(movePage(0, -1, 5), 0);
    assert.equal(movePage(4, 1, 5), 4);
    assert.equal(movePage(2, -10, 5), 0);
    assert.equal(movePage(0, 1, 0), 0);
});

test('the view says where the page is and which ways it can turn', () => {
    const pages = lessonPages(chapters);
    assert.deepEqual(
        { ...pagerView(pages, 0), page: undefined },
        { page: undefined, number: 1, count: 5, hasPrev: false, hasNext: true, inLesson: '1 of 2' },
    );
    const last = pagerView(pages, 4);
    assert.equal(last.page.id, 'factor/e');
    assert.equal(last.hasPrev, true);
    assert.equal(last.hasNext, false);
    assert.equal(last.inLesson, '2 of 2');
    assert.equal(pagerView(pages, 2).inLesson, '1 of 1');
});

test('the contents group pages by chapter and lesson, and mark the current page', () => {
    const toc = contents(lessonPages(chapters), 2);
    assert.deepEqual(toc.map((c) => c.title), ['Linear', 'Quadratic']);
    assert.deepEqual(toc[0].lessons.map((l) => l.title), ['Balance', 'Substitution']);
    assert.deepEqual(toc[0].lessons[0].pages, [
        { index: 0, title: 'Title a', kind: 'plane', current: false },
        { index: 1, title: 'Title b', kind: 'turtle', current: false },
    ]);
    assert.deepEqual(toc[0].lessons[1].pages, [{ index: 2, title: 'Title c', kind: 'plane', current: true }]);
    assert.deepEqual(toc[1].lessons[0].pages.map((p) => p.index), [3, 4]);
    assert.equal(toc[1].summary, 'Squares.');
});

test('every kind has a label', () => {
    assert.equal(KIND_LABELS.plane, 'On the plane');
    assert.equal(KIND_LABELS.turtle, 'With the turtle');
});

test('backticks mark code in a paragraph', () => {
    assert.deepEqual(paragraphParts('Use `towards()` to aim.'), [
        { code: false, text: 'Use ' },
        { code: true, text: 'towards()' },
        { code: false, text: ' to aim.' },
    ]);
    assert.deepEqual(paragraphParts('`a` and `b`'), [
        { code: true, text: 'a' },
        { code: false, text: ' and ' },
        { code: true, text: 'b' },
    ]);
    assert.deepEqual(paragraphParts('No code.'), [{ code: false, text: 'No code.' }]);
});

test('arrows and Page Up/Down turn the page; Home and End go to the ends', () => {
    const key = (k, mods = {}) => keyAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
    assert.equal(key('ArrowLeft'), 'prev');
    assert.equal(key('PageUp'), 'prev');
    assert.equal(key('ArrowRight'), 'next');
    assert.equal(key('PageDown'), 'next');
    assert.equal(key('Home'), 'first');
    assert.equal(key('End'), 'last');
    assert.equal(key('ArrowDown'), null);   // scrolls the page instead
    assert.equal(key('a'), null);
    assert.equal(key('ArrowRight', { metaKey: true }), null);
    assert.equal(key('ArrowLeft', { altKey: true }), null);
    assert.equal(key('ArrowLeft', { shiftKey: true }), null);
});

test('a key action leads to a page within the pages', () => {
    assert.equal(pageAfter('next', 1, 5), 2);
    assert.equal(pageAfter('next', 4, 5), 4);
    assert.equal(pageAfter('prev', 0, 5), 0);
    assert.equal(pageAfter('first', 3, 5), 0);
    assert.equal(pageAfter('last', 0, 5), 4);
    assert.equal(pageAfter('last', 0, 0), 0);
    assert.equal(pageAfter(null, 3, 5), 3);
});

test('a page carries its steps: each chunk, where it starts, and whether it folds', () => {
    const [plane, turtle] = lessonPages(chapters);
    assert.deepEqual(plane.steps, [
        { text: ['Set up a'], code: 'local n = 1', first: 1, fold: true },
        { text: ['Print it.', 'Then stop.'], code: 'print("a")', first: 3, fold: false },
    ]);
    assert.equal(turtle.steps[0].fold, false);
});

test('line numbers count from where a chunk starts', () => {
    assert.equal(lineNumbers('a\nb\nc', 4), '4\n5\n6');
    assert.equal(lineNumbers('only'), '1');
    assert.equal(lineRange('a\nb\nc', 4), 'lines 4–6');
    assert.equal(lineRange('one line', 12), 'line 12');
});
