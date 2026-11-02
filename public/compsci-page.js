// compsci-page.js
// The /compsci page's shell: the mathematics of a computer science degree,
// course by course, each concept with its equations and the library
// examples that show it, and a stage that runs the one picked.
//
// Owns: loading the curriculum and the library's catalog, rendering the
// course list and the course or search results that compsci.js decides,
// rendering equations with KaTeX (vendor/katex/, a global), the search, and
// the page's link (#course or #concept).
// Delegates: what the page shows to compsci.js, the cards and their
// previews to example-cards.js, the canvas, the code and running to
// example-stage.js.

import { createExampleStage } from './example-stage.js';
import { createCards }        from './example-cards.js';
import {
    coursePath, joinCourses, conceptCount, defaultCourse, targetFromHash, courseView, searchView,
} from './compsci.js';

const $ = (id) => document.getElementById(id);

const search     = $('browse-search');
const courseList = $('compsci-course-list');
const main       = $('browse-main');
const emptyNote  = $('browse-empty');

const stage = createExampleStage({
    pageName: 'Computer science',
    onShow: (example) => cards.select(example.id),
});

const cards = createCards({ root: main, onRun: (example) => stage.show(example) });

let courses = null;
let catalog = null;
let sources = null;
let course  = null;   // the course shown

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

function tex(source) {
    const node = el('div', 'compsci-tex');
    globalThis.katex.render(source, node, { displayMode: true, throwOnError: false });
    return node;
}

// ---- A concept ----

function conceptArticle(entry, { showCourse = false } = {}) {
    const { concept, unit } = entry;
    const article = el('article', 'compsci-concept');
    article.dataset.concept = concept.id;

    if (showCourse) {
        article.append(el('p', 'compsci-concept-where', `${entry.course.number} ${entry.course.name} · ${unit.name}`));
    }
    const title = el('h4', 'compsci-concept-name');
    title.append(link(`#${concept.id}`, concept.name));
    article.append(title, el('p', 'compsci-concept-summary', concept.summary));

    const equations = el('div', 'compsci-equations');
    for (const equation of concept.equations) {
        const figure = el('figure', 'compsci-equation');
        figure.append(tex(equation.tex), el('figcaption', '', equation.says));
        equations.append(figure);
    }
    article.append(equations);

    if (entry.revisits.length) {
        const builds = el('p', 'compsci-builds-on', 'Builds on ');
        builds.append(...joined(entry.revisits.map((r) => {
            const a = link(`#${r.concept.id}`, r.concept.name);
            a.title = `${r.course.number} ${r.course.name}`;
            return a;
        }), ', '));
        article.append(builds);
    }

    if (entry.examples.length) {
        const list = el('ul', 'example-cards');
        list.append(...entry.examples.map((example) => cards.card(`${concept.id}/${example.id}`, example)));
        article.append(list);
    } else {
        article.append(el('p', 'compsci-no-example', 'No example yet.'));
    }

    if (entry.checked.length) {
        const checked = el('p', 'compsci-checked', 'Checked against ');
        checked.append(...joined(entry.checked.map((s) => link(s.url, s.title, true)), ' · '));
        article.append(checked);
    }
    return article;
}

// ---- The main column ----

function courseHeader(view) {
    const { course: c } = view;
    const header = el('header', 'compsci-course-head');
    header.append(el('p', 'compsci-course-number', c.number), el('h2', 'compsci-course-name', c.name),
        el('p', 'compsci-course-about', c.about));
    const meta = el('p', 'compsci-course-meta', 'Topic order from ');
    meta.append(link(c.syllabus.url, c.syllabus.label, true));
    if (view.sources.length) {
        meta.append('. References: ', ...joined(view.sources.map((s) => link(s.url, s.title, true)), ', '));
    }
    meta.append('.');
    header.append(meta);
    return header;
}

function renderCourse() {
    const view = courseView(courses, catalog, sources, course);
    const nodes = [courseHeader(view)];
    if (!view.units.length) nodes.push(el('p', 'compsci-unwritten', 'Not written yet.'));
    for (const { unit, concepts } of view.units) {
        const section = el('section', 'compsci-unit');
        section.dataset.unit = unit.id;
        section.append(el('h3', 'compsci-unit-name', unit.name), ...concepts.map((entry) => conceptArticle(entry)));
        nodes.push(section);
    }
    return nodes;
}

function renderResults(query) {
    const found = searchView(courses, catalog, sources, query);
    $('browse-empty-query').textContent = query;
    emptyNote.hidden = found.length > 0;
    if (!found.length) return [];
    const section = el('section', 'compsci-results');
    section.append(el('h2', 'compsci-results-title', `${found.length} ${found.length === 1 ? 'concept' : 'concepts'}`),
        ...found.map((entry) => conceptArticle(entry, { showCourse: true })));
    return [section];
}

function renderMain() {
    const query = search.value.trim();
    cards.stop();
    emptyNote.hidden = true;
    main.replaceChildren(...(query ? renderResults(query) : renderCourse()), emptyNote);
    cards.select(stage.current()?.id ?? null);
}

// ---- The course list ----

function renderCourses() {
    courseList.replaceChildren(...courses.map((c) => {
        const li = el('li');
        const button = el('button', 'compsci-course');
        button.type = 'button';
        button.setAttribute('aria-current', String(c === course));
        button.title = c.name;
        const count = conceptCount(c);
        button.classList.toggle('unwritten', count === 0);
        button.append(el('span', 'compsci-course-number', c.number), el('span', 'compsci-course-title', c.name),
            el('span', 'compsci-course-count', count ? String(count) : ''));
        button.addEventListener('click', () => go(`#${c.id}`));
        li.append(button);
        if (c === course && c.units.length) {
            const units = el('ul', 'compsci-unit-list');
            units.append(...c.units.map((unit) => {
                const item = el('li');
                const jump = el('button', 'compsci-unit-link', unit.name);
                jump.type = 'button';
                jump.addEventListener('click', () => {
                    search.value = '';
                    renderMain();
                    main.querySelector(`[data-unit="${unit.id}"]`)?.scrollIntoView({ block: 'start' });
                });
                item.append(jump);
                return item;
            }));
            li.append(units);
        }
        return li;
    }));
}

// ---- Navigating ----

// Shows what a hash names: its course, scrolled to the concept if it names one.
function open(hash) {
    const target = targetFromHash(courses, hash) ?? { course: defaultCourse(courses), concept: null };
    const changed = target.course !== course || search.value.trim() !== '';
    course = target.course;
    search.value = '';
    if (changed) {
        renderCourses();
        renderMain();
    }
    const at = target.concept && main.querySelector(`[data-concept="${target.concept.id}"]`);
    if (at) at.scrollIntoView({ block: 'start' });
    else if (changed) main.scrollTop = 0;
    document.title = target.concept
        ? `${target.concept.name} — Computer science — Lua Turtle`
        : `${course.number} ${course.name} — Computer science — Lua Turtle`;
}

function go(hash) {
    if (location.hash === hash) open(hash);
    else location.hash = hash;
}

addEventListener('hashchange', () => {
    if (courses) open(location.hash);
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
        main.querySelector('.compsci-concept-name a')?.click();
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
    [catalog, sources] = await Promise.all([fetchJson('library/catalog.json'), fetchJson('compsci/sources.json')]);
    courses = joinCourses(meta, Object.fromEntries(meta.map((c, i) => [c.id, files[i]])));
} catch (err) {
    $('browse-loading').textContent = `Could not load the curriculum — ${err.message}`;
    throw err;
}
open(location.hash);
