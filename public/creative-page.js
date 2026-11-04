// creative-page.js
// The /creative page's shell: creative coding credited to its artists,
// each work with its context, the math in its picture and in its code, its
// license, the concepts it draws on, and our turtle versions of it, with a
// stage that runs the one picked.
//
// Owns: loading the works, the library's catalog and the curriculum,
// rendering the group list and the page or search results that creative.js
// decides, the search, and the page's link (#group or #work).
// Delegates: what the page shows to creative.js, the cards and their
// previews to example-cards.js, the canvas, the code and running to
// example-stage.js.

import { createExampleStage } from './example-stage.js';
import { createCards }        from './example-cards.js';
import { coursePath, joinCourses } from './compsci.js';
import { targetFromHash, pageView, searchView } from './creative.js';

const $ = (id) => document.getElementById(id);

const search    = $('browse-search');
const groupList = $('creative-group-list');
const main      = $('browse-main');
const emptyNote = $('browse-empty');

const stage = createExampleStage({
    pageName: 'Creative coding',
    onShow: (example) => cards.select(example.id),
});

const cards = createCards({ root: main, onRun: (example) => stage.show(example) });

let works   = null;
let catalog = null;
let courses = null;

// ---- Small builders ----

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function link(href, text, external = false) {
    const a = el('a', '', text);
    a.href = href;
    if (external) {
        a.target = '_blank';
        a.rel = 'noopener';
    }
    return a;
}

// Items joined by a separator, as nodes.
function joined(nodes, separator) {
    return nodes.flatMap((node, i) => (i ? [separator, node] : [node]));
}

// A labelled line: "In the picture  Thick curves…".
function fact(label, ...content) {
    const row = el('p', 'creative-fact');
    const text = el('span', 'creative-fact-text');
    text.append(...content);
    row.append(el('span', 'creative-fact-label', label), text);
    return row;
}

// ---- A work ----

function workArticle(entry, { showGroup = false } = {}) {
    const { work, license } = entry;
    const article = el('article', 'creative-work');
    article.dataset.work = work.id;

    if (showGroup) article.append(el('p', 'creative-work-where', entry.group.name));
    const title = el('h4', 'creative-work-name');
    title.append(link(`#${work.id}`, work.name));
    const byline = [work.artist, work.year].filter(Boolean).join(', ');
    article.append(title, el('p', 'creative-work-by', byline), el('p', 'creative-work-context', work.context));

    const facts = el('div', 'creative-facts');
    facts.append(fact('In the picture', work.picture), fact('In the code', work.math));

    const links = [link(work.url, 'Original', true)];
    if (work.code) links.push(link(work.code.url, work.code.label, true));
    const reuse = el('span', `creative-license ${license.port ? 'port' : 'inspiration'}`,
        license.port ? `${license.name} · may be ported` : `${license.name} · inspiration only`);
    facts.append(fact('Sources', ...joined(links, ' · '), ' ', reuse));

    const drawsOn = [
        ...entry.library.map((concept) => el('span', 'creative-concept', concept.name)),
        ...entry.compsci.map(({ concept, course }) => {
            const a = link(`compsci#${concept.id}`, concept.name);
            a.className = 'creative-concept';
            a.title = `${course.number} ${course.name}`;
            return a;
        }),
    ];
    if (drawsOn.length) facts.append(fact('Draws on', ...drawsOn));
    article.append(facts);

    if (entry.examples.length) {
        const list = el('ul', 'example-cards');
        list.append(...entry.examples.map((example) => cards.card(`${work.id}/${example.id}`, example)));
        article.append(list);
    } else {
        article.append(el('p', 'creative-no-example', 'No turtle version yet.'));
    }
    return article;
}

// ---- The main column ----

function renderPage() {
    return pageView(works, catalog, courses).map(({ group, works: entries }) => {
        const section = el('section', 'creative-group');
        section.dataset.group = group.id;
        section.append(el('h3', 'creative-group-name', group.name), el('p', 'creative-group-about', group.about),
            ...entries.map((entry) => workArticle(entry)));
        return section;
    });
}

function renderResults(query) {
    const found = searchView(works, catalog, courses, query);
    $('browse-empty-query').textContent = query;
    emptyNote.hidden = found.length > 0;
    if (!found.length) return [];
    const section = el('section', 'creative-results');
    section.append(el('h2', 'creative-results-title', `${found.length} ${found.length === 1 ? 'work' : 'works'}`),
        ...found.map((entry) => workArticle(entry, { showGroup: true })));
    return [section];
}

function renderMain() {
    const query = search.value.trim();
    cards.stop();
    emptyNote.hidden = true;
    main.replaceChildren(...(query ? renderResults(query) : renderPage()), emptyNote);
    cards.select(stage.current()?.id ?? null);
}

// ---- The group list ----

function renderGroups() {
    groupList.replaceChildren(...works.groups.map((group) => {
        const li = el('li');
        const button = el('button', 'creative-group-link');
        button.type = 'button';
        button.append(el('span', '', group.name), el('span', 'creative-group-count', String(group.works.length)));
        button.addEventListener('click', () => go(`#${group.id}`));
        li.append(button);
        return li;
    }));
}

// ---- Navigating ----

// Shows what a hash names, scrolled to it: a group or a work.
function open(hash) {
    if (search.value.trim()) {
        search.value = '';
        renderMain();
    }
    const target = targetFromHash(works, hash);
    const at = target && (target.work
        ? main.querySelector(`[data-work="${target.work.id}"]`)
        : main.querySelector(`[data-group="${target.group.id}"]`));
    if (at) at.scrollIntoView({ block: 'start' });
    else main.scrollTop = 0;
    document.title = target
        ? `${(target.work ?? target.group).name} — Creative coding — Lua Turtle`
        : 'Creative coding — Lua Turtle';
}

function go(hash) {
    if (location.hash === hash) open(hash);
    else location.hash = hash;
}

addEventListener('hashchange', () => {
    if (works) open(location.hash);
});

search.addEventListener('input', () => {
    renderMain();
    main.scrollTop = 0;
});

search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) {
        e.stopPropagation();
        search.value = '';
        renderMain();
    } else if (e.key === 'Enter') {
        // Opens the first result.
        main.querySelector('.creative-work-name a')?.click();
    }
});

document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, [contenteditable], .CodeMirror');
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        search.focus();
        search.select();
    }
});

// ---- Boot ----

async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
    return response.json();
}

try {
    const meta = await fetchJson('compsci/courses.json');
    const files = await Promise.all(meta.map((c) => fetchJson(coursePath(c.id))));
    [works, catalog] = await Promise.all([fetchJson('creative/works.json'), fetchJson('library/catalog.json')]);
    courses = joinCourses(meta, Object.fromEntries(meta.map((c, i) => [c.id, files[i]])));
} catch (err) {
    $('browse-loading').textContent = `Could not load the works — ${err.message}`;
    throw err;
}
renderGroups();
renderMain();
open(location.hash);
