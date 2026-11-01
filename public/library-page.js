// library-page.js
// The /library page's shell: a gallery of example programs, each with a
// looping preview video, and a canvas that runs the one picked, with its
// code in a collapsible editor beneath.
//
// Owns: loading the catalog and programs, rendering the sidebar and the
// gallery that library.js decides, playing a preview on hover or focus, the
// editor and its dock, the header controls, and the page's link (#id).
// Delegates: what the gallery shows to library.js, running to runner.js,
// drawing to renderer.js, canvas gestures to canvas-view.js, the editor to
// lua-editor.js, the dock to dock.js.

import { Renderer }        from './renderer.js';
import { initCanvasView }  from './canvas-view.js';
import { createDock }      from './dock.js';
import { createRunner }    from './runner.js';
import { createLuaEditor } from './lua-editor.js';
import * as storage        from './storage.js';
import {
    libraryView, conceptCounts, exampleFromHash, programPath, videoPath, posterPath,
} from './library.js';

const IS_MAC       = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const RUN_SHORTCUT = IS_MAC ? '⌘↵' : 'Ctrl+Enter';
const EDITOR_OPEN_KEY = 'luaturtle-library-editor-open';

const $ = (id) => document.getElementById(id);

const app          = $('app');
const headerStatus = $('header-status');
const btnRun       = $('btn-run');
const btnStop      = $('btn-stop');
const openEditor   = $('btn-open-editor');
const search       = $('library-search');
const conceptList  = $('library-concept-list');
const gallery      = $('library-gallery');
const emptyNote    = $('library-empty');
const canvasHint   = $('library-canvas-hint');
const editorTitle  = $('library-editor-title');
const editorError  = $('library-editor-error');
const revert       = $('library-editor-reset');

function setStatus(msg, kind) {
    headerStatus.textContent = msg;
    headerStatus.className   = kind || '';
}

// ---- Canvas ----

const renderer = new Renderer($('turtle-canvas'));

initCanvasView(renderer, {
    panel:     $('canvas-panel'),
    canvas:    $('turtle-canvas'),
    zoomIn:    $('btn-zoom-in'),
    zoomOut:   $('btn-zoom-out'),
    zoomReset: $('btn-zoom-reset'),
    zoomLabel: $('zoom-label'),
    gridBtn:   $('btn-grid'),
});

function canvasSize() {
    const dpr = window.devicePixelRatio || 1;
    return {
        width:  Math.round(renderer.canvas.width  / dpr),
        height: Math.round(renderer.canvas.height / dpr),
    };
}

// ---- Editor ----

const editor = createLuaEditor($('library-editor-textarea'));

const editorDock = createDock({
    panel:  $('library-editor-panel'),
    header: $('library-editor-header'),
    caret:  $('library-editor-caret'),
    column: $('stage'),
    key:    'luaturtle-library-editor-height',
    defaultHeight: 300,
    defaultShare:  0.4,
    minHeight:     120,
    onToggle: (open) => {
        storage.save(EDITOR_OPEN_KEY, open);
        if (open) editor.refresh();
    },
    onLayout: () => editor.refresh(),
});
if (storage.load(EDITOR_OPEN_KEY, 'true') === 'true') editorDock.open();

let errorMark = null;

function clearError() {
    errorMark?.clear();
    errorMark = null;
    editorError.hidden = true;
    editorError.textContent = '';
}

function markError(line, message) {
    editorError.textContent = line ? `Line ${line}: ${message}` : message;
    editorError.title = editorError.textContent;
    editorError.hidden = false;
    const index = line - 1;
    if (!line || index >= editor.lineCount()) return;
    errorMark = editor.markText(
        { line: index, ch: editor.getLine(index).search(/\S|$/) },
        { line: index, ch: editor.getLine(index).trimEnd().length },
        { className: 'cm-error-code', attributes: { title: message } },
    );
    editorDock.open();
    editor.scrollIntoView({ line: index, ch: 0 }, 60);
}

// ---- The example on the canvas ----

let catalog = null;
let current = null;              // the example in the editor, or null
const programs = new Map();      // id → its program's text, once fetched

async function loadProgram(id) {
    if (!programs.has(id)) {
        const response = await fetch(programPath(id));
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        programs.set(id, await response.text());
    }
    return programs.get(id);
}

function edited() {
    return current !== null && editor.getValue() !== programs.get(current.id);
}

function updateEditorChrome() {
    revert.hidden = !edited();
    editorTitle.textContent = current ? `${current.name}${edited() ? ' (edited)' : ''}` : 'Code';
    openEditor.href = current ? `./#${encodeURIComponent(editor.getValue())}` : './';
    openEditor.setAttribute('aria-disabled', String(!current));
}

editor.on('changes', () => {
    clearError();
    updateEditorChrome();
});

// Puts an example's program in the editor and runs it, from a fresh view.
async function show(example, { run = true } = {}) {
    let code;
    try {
        code = await loadProgram(example.id);
    } catch (err) {
        setStatus(`Could not load ${example.name} — ${err.message}`, 'error');
        return;
    }
    current = example;
    editor.setValue(code);
    editor.clearHistory();
    editor.scrollTo(0, 0);
    updateEditorChrome();
    markSelected();
    setState(state);   // Run needs an example
    if (location.hash !== `#${example.id}`) history.replaceState(null, '', `#${example.id}`);
    document.title = `${example.name} — Library — Lua Turtle`;
    renderer.resetView();
    if (run) runCode();
}

revert.addEventListener('click', () => {
    if (current) show(current, { run: false });
});

// ---- Running ----

let state = 'loading';

function setState(next) {
    state = next;
    app.dataset.state = next;
    btnStop.disabled = next !== 'running';
    btnRun.disabled  = next === 'failed' || !current;
    btnRun.title     = next === 'running' ? `Restart (${RUN_SHORTCUT})` : `Run (${RUN_SHORTCUT})`;
}

function formatElapsed(ms) {
    return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const runner = createRunner({
    renderer,
    canvasSize,
    onState: setState,
    onReady() {
        setStatus(current ? `Ready · ${RUN_SHORTCUT} to run` : 'Ready');
    },
    onFail(detail) {
        setStatus(`Lua failed to load — try reloading (${detail})`, 'error');
    },
    onStart({ name }) {
        clearError();
        canvasHint.hidden = true;
        setStatus(`Running ${name}`, 'running');
    },
    onDone({ stopped, elapsed }) {
        setStatus(stopped ? 'Stopped' : `Done in ${formatElapsed(elapsed)}`);
    },
    onError({ message, line }) {
        markError(line, message);
        setStatus(line ? `Error on line ${line}` : 'Error — see the code', 'error');
    },
});

function runCode() {
    if (!current) return;
    const name = edited() ? `${current.name} (edited)` : current.name;
    if (runner.run(editor.getValue(), { name }) && state === 'loading') setStatus('Starting Lua…', 'running');
}

function stopCode() {
    if (state !== 'running') return;
    runner.stop();
    setStatus('Stopping…', 'running');
}

btnRun.addEventListener('click', runCode);
btnStop.addEventListener('click', stopCode);
$('run-shortcut').textContent = RUN_SHORTCUT;
btnStop.title = 'Stop (Esc)';

// ---- Previews ----

// A card shows its poster, the finished drawing, loaded as it nears the
// view. Its video loads and plays from the start only while the mouse is
// over the card or the card has keyboard focus, one at a time, and never
// under reduced motion; when it stops, the card shows the finished drawing
// again (the video ends holding it).
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const nearView = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        const video = target.querySelector('video');
        video.poster = posterPath(target.dataset.id);
        nearView.unobserve(target);
    }
}, { root: gallery, rootMargin: '300px 0px' });

let playing = null;   // the card whose preview is playing

function playPreview(li) {
    if (playing === li || reducedMotion.matches) return;
    stopPreview();
    playing = li;
    const video = li.querySelector('video');
    if (!video.src) video.src = videoPath(li.dataset.id);
    if (Number.isFinite(video.duration)) video.currentTime = 0;
    video.play().catch(() => { /* not allowed or interrupted: the poster stays */ });
}

function stopPreview() {
    if (!playing) return;
    const video = playing.querySelector('video');
    playing = null;
    video.pause();
    // Before a frame has shown, the poster still does.
    if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 0.1);
}

reducedMotion.addEventListener('change', stopPreview);

// ---- Gallery ----

const template = $('library-card-template');
const cards = new Map();   // "<section>/<example>" → its card, kept across renders

function card(sectionId, example) {
    const key = `${sectionId}/${example.id}`;
    if (cards.has(key)) return cards.get(key);
    const li = template.content.firstElementChild.cloneNode(true);
    li.dataset.id = example.id;
    li.querySelector('.library-card-name').textContent = example.name;
    li.querySelector('.library-card-about').textContent = example.about;
    const button = li.querySelector('.library-card-run');
    button.setAttribute('aria-label', `Run ${example.name} on the canvas`);
    button.addEventListener('click', () => show(example));
    // The preview is a larger target for the same thing.
    li.querySelector('.library-card-preview').addEventListener('click', () => show(example));
    // A touch has no hover: a tap runs the example instead.
    li.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') playPreview(li); });
    // Keyboard focus only: a clicked button keeps its focus, but not :focus-visible.
    li.addEventListener('pointerleave', () => { if (playing === li && !li.querySelector(':focus-visible')) stopPreview(); });
    li.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) playPreview(li); });
    li.addEventListener('focusout', (e) => { if (playing === li && !li.contains(e.relatedTarget) && !li.matches(':hover')) stopPreview(); });
    nearView.observe(li);
    cards.set(key, li);
    return li;
}

function markSelected() {
    for (const li of cards.values()) {
        const selected = current !== null && li.dataset.id === current.id;
        li.classList.toggle('selected', selected);
        li.querySelector('.library-card-run').setAttribute('aria-pressed', String(selected));
    }
}

let concept = null;   // the selected concept's id, or null for all

function renderGallery() {
    const query = search.value.trim();
    const view = libraryView(catalog, { query, concept });
    stopPreview();   // its card may leave the gallery without a pointerleave
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
        list.className = 'library-cards';
        list.append(...section.examples.map((example) => card(section.id, example)));
        el.append(list);
        return el;
    });
    $('library-empty-query').textContent = query;
    emptyNote.hidden = view.count > 0;
    gallery.replaceChildren(...sections, emptyNote);
    markSelected();
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
        item(null, 'All examples', catalog.examples.length),
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
        const first = gallery.querySelector('.library-card');
        if (first) first.querySelector('.library-card-run').click();
    }
});

openEditor.addEventListener('click', (e) => {
    if (!current) e.preventDefault();
});

addEventListener('hashchange', () => {
    if (!catalog) return;
    const example = exampleFromHash(catalog, location.hash);
    if (example && example !== current) show(example);
});

// ---- Shortcuts ----

document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.closest?.('input, textarea, [contenteditable], .CodeMirror');
    if (mod && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    } else if (e.key === '/' && !typing && !mod) {
        e.preventDefault();
        search.focus();
        search.select();
    } else if (e.key === 'Escape' && state === 'running') {
        stopCode();
    }
});

// ---- Boot ----

setState('loading');
setStatus('Loading Lua…', 'running');
if (!runner.start()) {
    $('sab-warning').hidden = false;
    runner.fail('missing COOP/COEP headers');
    setStatus('Error: missing COOP/COEP headers', 'error');
}

try {
    const response = await fetch('library/catalog.json');
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    catalog = await response.json();
} catch (err) {
    $('library-loading').textContent = `Could not load the library — ${err.message}`;
    throw err;
}
renderConcepts();
renderGallery();
const linked = exampleFromHash(catalog, location.hash);
if (linked) show(linked);
