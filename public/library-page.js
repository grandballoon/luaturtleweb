// library-page.js
// The /library page's shell: a gallery of example programs, grouped by
// concept, and a stage that runs the one picked.
//
// Owns: loading the catalog, rendering the sidebar and the gallery that
// library.js decides, the search, and the page's link (#id).
// Delegates: what the gallery shows to library.js, the cards and their
// previews to example-cards.js, the canvas, the code and running to
// example-stage.js.

import { createExampleStage } from './example-stage.js';
import { createCards }        from './example-cards.js';
import { libraryView, conceptCounts, galleryExamples, exampleFromHash } from './library.js';

const $ = (id) => document.getElementById(id);

const search      = $('browse-search');
const conceptList = $('library-concept-list');
const gallery     = $('browse-main');
const emptyNote   = $('browse-empty');

const stage = createExampleStage({
    pageName: 'Library',
    onShow(example) {
        cards.select(example.id);
        if (location.hash !== `#${example.id}`) history.replaceState(null, '', `#${example.id}`);
    },
});

const cards = createCards({ root: gallery, onRun: (example) => stage.show(example) });

// ---- Gallery ----

let catalog = null;
let concept = null;   // the selected concept's id, or null for all

function renderGallery() {
    const query = search.value.trim();
    const view = libraryView(catalog, { query, concept });
    cards.stop();
    const sections = view.sections.map((section) => {
        const el = document.createElement('section');
        el.className = 'library-section';
        const title = document.createElement('h2');
        title.textContent = section.title;
        el.append(title);
        if (section.about) {
            const about = document.createElement('p');
            about.className = 'library-section-about';
            about.textContent = section.about;
            el.append(about);
        }
        const list = document.createElement('ul');
        list.className = 'example-cards';
        list.append(...section.examples.map((example) => cards.card(`${section.id}/${example.id}`, example)));
        el.append(list);
        return el;
    });
    $('browse-empty-query').textContent = query;
    emptyNote.hidden = view.count > 0;
    gallery.replaceChildren(...sections, emptyNote);
    cards.select(stage.current()?.id ?? null);
}

function renderConcepts() {
    const counts = conceptCounts(catalog);
    const item = (id, name, count) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'library-concept';
        button.dataset.concept = id ?? '';
        button.setAttribute('aria-pressed', String(concept === id));
        const label = document.createElement('span');
        label.textContent = name;
        const n = document.createElement('span');
        n.className = 'library-concept-count';
        n.textContent = count;
        button.append(label, n);
        button.addEventListener('click', () => {
            concept = concept === id ? null : id;
            renderConcepts();
            renderGallery();
            gallery.scrollTop = 0;
        });
        li.append(button);
        return li;
    };
    conceptList.replaceChildren(
        item(null, 'All examples', galleryExamples(catalog).length),
        ...catalog.concepts.map((c) => item(c.id, c.name, counts[c.id])),
    );
}

search.addEventListener('input', () => {
    renderGallery();
    gallery.scrollTop = 0;
});

search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) {
        e.stopPropagation();
        search.value = '';
        renderGallery();
    } else if (e.key === 'Enter') {
        // Runs the first result.
        gallery.querySelector('.example-card-run')?.click();
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

addEventListener('hashchange', () => {
    if (!catalog) return;
    const example = exampleFromHash(catalog, location.hash);
    if (example && example !== stage.current()) stage.show(example);
});

// ---- Boot ----

try {
    const response = await fetch('library/catalog.json');
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    catalog = await response.json();
} catch (err) {
    $('browse-loading').textContent = `Could not load the library — ${err.message}`;
    throw err;
}
renderConcepts();
renderGallery();
const linked = exampleFromHash(catalog, location.hash);
if (linked) stage.show(linked);
