// test/feedback_test.mjs
//
// The dev-only UI feedback's pure halves (dev/feedback/): the entry the
// overlay sends and the dev server writes, and finding and describing the
// element that was clicked. Elements here are plain objects shaped like
// DOM elements, which is all capture.js reads.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/feedback_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseEntry, formatEntry, FEEDBACK_HEADER } = await import('../dev/feedback/entry.js');
const { selectorFor, describe, capture } = await import('../dev/feedback/capture.js');

// A fake element: tag, attributes, text, and children it becomes the parent of.
function node(tag, attrs = {}, children = [], text = '') {
    const el = {
        tagName: tag.toUpperCase(),
        id: attrs.id ?? '',
        classList: (attrs.class ?? '').split(' ').filter(Boolean),
        attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
        children,
        parentElement: null,
        textContent: text || children.map((c) => c.textContent).join(' '),
    };
    for (const child of children) child.parentElement = el;
    return el;
}

// <body><main id="menu"><section class="chapter open"><a class="card">One</a><a class="card">Two</a></section></main>
//       <div class="loose"><p>Plain</p></div><i id="twin"></i><i id="twin"></i></body>
const one = node('a', { class: 'card' }, [], 'One');
const two = node('a', { class: 'card' }, [], 'Two');
const section = node('section', { class: 'chapter open' }, [one, two]);
const main = node('main', { id: 'menu' }, [section]);
const p = node('p', {}, [], 'Plain');
const loose = node('div', { class: 'loose' }, [p]);
const twinA = node('i', { id: 'twin' });
const twinB = node('i', { id: 'twin' });
node('body', {}, [main, loose, twinA, twinB]);
const unique = (id) => id !== 'twin';

const entry = {
    comment: '  Make this bigger.\nAnd bluer.  ',
    page: '/?lesson=1',
    selector: '#menu > section',
    element: '<section class="chapter"> "One Two"',
    point: { x: 12.4, y: 7.6 },
    size: { width: 300.2, height: 40 },
    viewport: { width: 1440, height: 900 },
};

test('a selector anchors at the nearest unique id', () => {
    assert.equal(selectorFor(two, unique), '#menu > section.chapter.open > a.card:nth-of-type(2)');
    assert.equal(selectorFor(main, unique), '#menu');
});

test('without an id above it, a selector walks up to the body', () => {
    assert.equal(selectorFor(p, unique), 'div.loose > p');
});

test('an id that is not unique is not an anchor', () => {
    assert.equal(selectorFor(twinB, unique), 'i:nth-of-type(2)');
});

test('a description shows identifying attributes and the start of the text', () => {
    assert.equal(describe(section), '<section class="chapter open"> "One Two"');
    assert.equal(describe(twinA), '<i id="twin">');
    const long = node('p', { 'aria-label': 'Long', 'data-kind': 'x', title: 'skipped' }, [], 'word '.repeat(30));
    const text = describe(long);
    assert.ok(text.startsWith('<p aria-label="Long" data-kind="x"> "word word'), text);
    assert.ok(text.endsWith('…"'), text);
});

test('a capture records where in the element the click landed', () => {
    const got = capture(two, 110, 52, 'Hi', {
        page: '/',
        box: { left: 100, top: 50, width: 40, height: 20 },
        viewport: { width: 800, height: 600 },
        isUniqueId: unique,
    });
    assert.deepEqual(got, {
        comment: 'Hi',
        page: '/',
        selector: '#menu > section.chapter.open > a.card:nth-of-type(2)',
        element: '<a class="card"> "Two"',
        point: { x: 10, y: 2 },
        size: { width: 40, height: 20 },
        viewport: { width: 800, height: 600 },
    });
});

test('a complete entry is accepted, with its comment trimmed and nothing extra', () => {
    assert.deepEqual(parseEntry({ ...entry, extra: 'dropped' }), { ...entry, comment: 'Make this bigger.\nAnd bluer.' });
});

test('anything less than a complete entry is refused', () => {
    assert.equal(parseEntry(null), null);
    assert.equal(parseEntry('text'), null);
    assert.equal(parseEntry({ ...entry, comment: '   ' }), null);
    assert.equal(parseEntry({ ...entry, selector: 3 }), null);
    assert.equal(parseEntry({ ...entry, point: { x: 1 } }), null);
    assert.equal(parseEntry({ ...entry, size: { width: NaN, height: 1 } }), null);
    assert.equal(parseEntry({ ...entry, viewport: null }), null);
});

test('an entry is written as an open Markdown section, stamped in local time', () => {
    const text = formatEntry(parseEntry(entry), new Date(2026, 9, 29, 8, 5));
    assert.equal(text, `
## [ ] 2026-10-29 08:05 · /?lesson=1

> Make this bigger.
> And bluer.

- Element: \`<section class="chapter"> "One Two"\`
- Selector: \`#menu > section\`
- Clicked at: 12, 8 px inside a 300 × 40 px box
- Viewport: 1440 × 900 px
`);
});

test('a new feedback file says what it is and how entries are closed', () => {
    assert.match(FEEDBACK_HEADER, /^# UI feedback\n/);
    assert.match(FEEDBACK_HEADER, /\[x\]/);
    assert.match(FEEDBACK_HEADER, /gitignored/);
});
