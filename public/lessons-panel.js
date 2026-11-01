// lessons-panel.js
// The Lessons sidebar: a panel that teaches the lessons in
// turtle/lessons.lua a page at a time. Each page is one example: what it is
// about, its program step by step, each step a chunk of code and what it
// does, and then the whole program, which runs on the canvas or opens in
// the editor to be changed.
//
// It sits docked over the editor column, or detached: a floating window the
// learner drags by its header and resizes from any edge or corner, placed
// anywhere, say beside the editor while they type a program in by hand.
//
// Owns: showing the page lessons.js picks, opening and closing, docking and
// floating, the table of contents, what it remembers (localStorage: the
// page, where it sits), and keys pressed inside it. Decisions live in
// lessons.js and floating.js, which this only renders and applies.
// Delegates: running a program and putting it in the editor to its owner
// (app.js), through onRun and onOpen.

import {
    lessonPages, pageIndex, pagerView, contents, paragraphParts, keyAction, pageAfter, movePage, KIND_LABELS,
    lineNumbers, lineRange,
} from './lessons.js';
import { clampRect, defaultRect, dragRect, resizeRect, edgesOf, readRect } from './floating.js';
import { highlightLua } from './lua-highlight.js';
import * as storage from './storage.js';

const PAGE_KEY = 'luaturtle-lesson-page';     // the id of the page last shown
const MODE_KEY = 'luaturtle-lessons-mode';    // 'floating', or anything else for docked
const RECT_KEY = 'luaturtle-lessons-rect';    // the floating window's box
const DONE_RESET_MS = 1500;

// els: the panel's elements, by the ids in index.html. headerBottom()
// says where the page's header ends, so the window first floats below it.
// onRun(code) runs a page's program; onOpen(code) puts it in the editor;
// onClose() hands focus back.
export function createLessonsPanel({ els, headerBottom, onRun, onOpen, onClose }) {
    let pages = [];
    let index = 0;
    let showingContents = false;

    // ---- Rendering ----

    // A paragraph element with `code` runs as <code>.
    function paragraph(text, className) {
        const p = document.createElement('p');
        if (className) p.className = className;
        for (const part of paragraphParts(text)) {
            if (part.code) {
                const code = document.createElement('code');
                code.textContent = part.text;
                p.append(code);
            } else {
                p.append(part.text);
            }
        }
        return p;
    }

    // A chunk of a program with its line numbers beside it, starting at line
    // `first` of the whole program, so a learner copying by hand can keep
    // their place.
    function codeBlock(code, first) {
        const block = document.createElement('div');
        block.className = 'lessons-code';
        const gutter = document.createElement('pre');
        gutter.className = 'lessons-gutter';
        gutter.setAttribute('aria-hidden', 'true');
        gutter.textContent = lineNumbers(code, first);
        const pre = document.createElement('pre');
        pre.className = 'cm-s-turtle';
        highlightLua(code, pre);
        block.append(gutter, pre);
        return block;
    }

    // Step n: where its chunk sits, what it does, and the chunk. A folded
    // step (the graph paper every graph page shares) keeps its code closed
    // until asked for.
    function stepItem(step, n) {
        const item = document.createElement('li');
        item.className = 'lessons-step';
        const label = document.createElement('p');
        label.className = 'lessons-step-label';
        label.textContent = `Step ${n} · ${lineRange(step.code, step.first)}`;
        item.append(label, ...step.text.map((text) => paragraph(text)));
        if (step.fold) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = 'Show the code';
            details.append(summary, codeBlock(step.code, step.first));
            item.append(details);
        } else {
            item.append(codeBlock(step.code, step.first));
        }
        return item;
    }

    function renderPage() {
        const { page, number, count, hasPrev, hasNext, inLesson } = pagerView(pages, index);
        els.chapter.textContent = page.chapter.title;
        els.lesson.textContent = `${page.lesson.title} · ${inLesson}`;
        els.kind.textContent = KIND_LABELS[page.kind] ?? page.kind;
        els.kind.dataset.kind = page.kind;
        els.title.textContent = page.title;
        els.problem.hidden = !page.problem;
        els.problem.textContent = page.problem ?? '';
        els.text.replaceChildren(...page.text.map((text) => paragraph(text)));
        els.steps.replaceChildren(...page.steps.map((step, i) => stepItem(step, i + 1)));
        els.codeLines.textContent = lineNumbers(page.code);
        highlightLua(page.code, els.code);
        els.source.hidden = !page.source;
        els.source.textContent = page.source ? `After ${page.source}` : '';
        els.position.textContent = `${number} / ${count}`;
        els.prev.disabled = !hasPrev;
        els.next.disabled = !hasNext;
        els.copy.classList.remove('done');
    }

    function renderContents() {
        const list = document.createElement('ol');
        list.className = 'lessons-toc';
        for (const chapter of contents(pages, index)) {
            const item = document.createElement('li');
            const heading = document.createElement('h3');
            heading.textContent = chapter.title;
            item.append(heading, paragraph(chapter.summary, 'lessons-toc-summary'));
            const lessons = document.createElement('ol');
            for (const lesson of chapter.lessons) {
                const entry = document.createElement('li');
                const name = document.createElement('h4');
                name.textContent = lesson.title;
                const rows = document.createElement('ol');
                for (const page of lesson.pages) {
                    const row = document.createElement('li');
                    const link = document.createElement('button');
                    link.type = 'button';
                    link.className = 'lessons-toc-page';
                    link.dataset.index = page.index;
                    if (page.current) link.setAttribute('aria-current', 'page');
                    const title = document.createElement('span');
                    title.textContent = page.title;
                    const kind = document.createElement('span');
                    kind.className = 'lessons-kind';
                    kind.dataset.kind = page.kind;
                    kind.textContent = KIND_LABELS[page.kind] ?? page.kind;
                    link.append(title, kind);
                    row.append(link);
                    rows.append(row);
                }
                entry.append(name, paragraph(lesson.summary, 'lessons-toc-summary'), rows);
                lessons.append(entry);
            }
            item.append(lessons);
            list.append(item);
        }
        els.contents.replaceChildren(list);
    }

    function render() {
        const ready = pages.length > 0;
        els.loading.hidden = ready;
        els.page.hidden = !ready || showingContents;
        els.contents.hidden = !ready || !showingContents;
        els.footer.hidden = !ready;
        els.contentsButton.setAttribute('aria-pressed', String(showingContents));
        els.contentsButton.disabled = !ready;
        if (!ready) return;
        if (showingContents) {
            renderContents();
            // Center the current page in the list. Set directly, since
            // scrollIntoView would also scroll the clipped columns around it.
            const current = els.contents.querySelector('[aria-current]');
            els.body.scrollTop = current
                ? current.offsetTop - (els.body.clientHeight - current.offsetHeight) / 2
                : 0;
        } else {
            renderPage();
            els.body.scrollTop = 0;
        }
    }

    // ---- Moving ----

    function go(next) {
        index = next;
        showingContents = false;
        storage.save(PAGE_KEY, pages[index].id);
        render();
    }

    els.prev.addEventListener('click', () => go(movePage(index, -1, pages.length)));
    els.next.addEventListener('click', () => go(movePage(index, 1, pages.length)));
    els.contentsButton.addEventListener('click', () => {
        showingContents = !showingContents;
        render();
    });
    els.contents.addEventListener('click', (e) => {
        const link = e.target.closest('.lessons-toc-page');
        if (!link) return;
        go(Number(link.dataset.index));
        els.body.focus({ preventScroll: true });
    });

    // Arrow keys and friends turn the page while focus is in the panel.
    els.panel.addEventListener('keydown', (e) => {
        if (!pages.length || showingContents) return;
        const action = keyAction(e);
        if (!action) return;
        const next = pageAfter(action, index, pages.length);
        e.preventDefault();
        if (next !== index) go(next);
    });

    // ---- The program ----

    els.run.addEventListener('click', () => onRun(pages[index].code));
    // Docked, the panel covers the editor, so it steps aside; floating, it
    // stays, to be read beside the code.
    els.open.addEventListener('click', () => {
        onOpen(pages[index].code);
        if (!floating) close();
    });

    let copyReset = 0;
    els.copy.addEventListener('click', async () => {
        const code = pages[index].code;
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            window.prompt('Copy this program:', code);
            return;
        }
        els.copy.classList.add('done');
        clearTimeout(copyReset);
        copyReset = setTimeout(() => els.copy.classList.remove('done'), DONE_RESET_MS);
    });

    // ---- Docked or floating ----

    let floating = storage.load(MODE_KEY) === 'floating';
    let rect = readRect(storage.loadJSON(RECT_KEY));

    function view() {
        return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    }

    function place(box) {
        rect = box;
        const style = els.panel.style;
        style.left = `${box.x}px`;
        style.top = `${box.y}px`;
        style.width = `${box.width}px`;
        style.height = `${box.height}px`;
    }

    function applyPlacement() {
        els.panel.classList.toggle('floating', floating);
        const label = floating ? 'Dock over the editor' : 'Detach into a window you can move';
        els.detach.setAttribute('aria-pressed', String(floating));
        els.detach.setAttribute('aria-label', label);
        els.detach.title = label;
        if (floating) place(clampRect(rect ?? defaultRect(view(), headerBottom()), view()));
        else els.panel.removeAttribute('style');
    }

    els.detach.addEventListener('click', () => {
        floating = !floating;
        storage.save(MODE_KEY, floating ? 'floating' : 'docked');
        applyPlacement();
        els.body.focus({ preventScroll: true });
    });

    // Dragging `handle` changes the box by the pointer's travel through
    // `move` (dragging it, or resizing it by some edges), and stores where it
    // ends.
    function dragWith(handle, move, ignore) {
        handle.addEventListener('pointerdown', (e) => {
            if (!floating || e.button !== 0 || (ignore && e.target.closest(ignore))) return;
            e.preventDefault();
            const start = { x: e.clientX, y: e.clientY, rect };
            handle.setPointerCapture(e.pointerId);
            els.panel.classList.add('moving');
            const onMove = (m) => place(move(start.rect, m.clientX - start.x, m.clientY - start.y, view()));
            const onUp = () => {
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                els.panel.classList.remove('moving');
                storage.saveJSON(RECT_KEY, rect);
            };
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        });
    }

    dragWith(els.header, dragRect, 'button');
    for (const handle of els.resize.querySelectorAll('[data-edges]')) {
        const edges = edgesOf(handle.dataset.edges);
        dragWith(handle, (box, dx, dy, v) => resizeRect(box, edges, dx, dy, v));
    }

    // A smaller window pulls the floating panel back into view.
    addEventListener('resize', () => {
        if (floating && rect) place(clampRect(rect, view()));
    });

    applyPlacement();

    // ---- Opening and closing ----

    function isOpen() { return !els.panel.hidden; }

    function open() {
        if (!isOpen()) {
            els.panel.hidden = false;
            els.button.setAttribute('aria-expanded', 'true');
            els.button.classList.add('active');
            applyPlacement();
            render();
        }
        els.body.focus({ preventScroll: true });
    }

    function close() {
        if (!isOpen()) return;
        els.panel.hidden = true;
        els.button.setAttribute('aria-expanded', 'false');
        els.button.classList.remove('active');
        onClose();
    }

    function toggle() {
        if (isOpen()) close();
        else open();
    }

    els.button.addEventListener('click', toggle);
    els.close.addEventListener('click', close);

    // The lessons arrive with the worker's `ready` message.
    function setLessons(chapters) {
        pages = lessonPages(chapters);
        index = pageIndex(pages, storage.load(PAGE_KEY));
        if (isOpen()) render();
    }

    return {
        setLessons, open, close, toggle, isOpen,
        hasFocus: () => els.panel.contains(document.activeElement),
    };
}
