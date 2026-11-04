// transcribe-panel.js
// The Transcribe panel: pick a sample program from the Lessons or the
// Library, then type it into the editor by hand while the panel checks it
// as you go. It sits docked over the canvas column, beside the editor, and
// shows the sample line by line: done, the line to type now, and what is
// left, with the first mistake named in its status.
//
// Owns: showing the picker and the sample, opening and closing, what it
// remembers (localStorage: the sample chosen), fetching a library program,
// and the editor's marks for the check (the mistake, and the numbers of its
// right lines). Decisions live in samples.js and transcribe.js, which this
// only renders and applies.
// Delegates: emptying the editor and running it to its owner (app.js),
// through onStart and onRun.

import { sampleGroups, searchSamples, findSample } from './samples.js';
import { checkTranscription, sampleLines, typedOkLines, progressText, posAt } from './transcribe.js';
import { lessonPages } from './lessons.js';
import { programPath } from './library.js';
import { highlightLua } from './lua-highlight.js';
import * as storage from './storage.js';

const SAMPLE_KEY = 'luaturtle-transcribe-sample';   // the id of the sample chosen

// els: the panel's elements, by the ids in index.html. editor: the page's
// CodeMirror editor, read and marked here. onStart(sample) empties the
// editor to type `sample` in; onRun() runs the editor's program;
// focusEditor() hands focus to the editor.
export function createTranscribePanel({ els, editor, onStart, onRun, focusEditor }) {
    let pages = [];
    let catalog = null;
    let groups = [];
    let sample = null;          // the sample chosen, with its code once it has it
    let choosing = true;        // showing the picker rather than the sample
    let loadToken = 0;          // the latest library fetch, so a slow one can't win
    let marks = { error: null, lines: [] };

    function rebuild() {
        groups = sampleGroups(pages, catalog);
        if (!sample) {
            const saved = findSample(groups, storage.load(SAMPLE_KEY));
            if (saved) {
                sample = saved;
                choosing = false;
                if (isOpen()) load(saved);
            }
        }
        if (isOpen()) render();
    }

    // ---- The picker ----

    function renderPicker() {
        const shown = searchSamples(groups, els.search.value);
        if (!groups.length) {
            els.list.replaceChildren(note('Loading samples…'));
            return;
        }
        if (!shown.length) {
            els.list.replaceChildren(note('No samples match your search.'));
            return;
        }
        els.list.replaceChildren(...shown.map((group) => {
            const section = document.createElement('section');
            const heading = document.createElement('h3');
            heading.textContent = group.title;
            const list = document.createElement('ol');
            list.append(...group.samples.map((s) => {
                const row = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'transcribe-pick';
                button.dataset.id = s.id;
                if (sample?.id === s.id) button.setAttribute('aria-current', 'true');
                const title = document.createElement('span');
                title.className = 'transcribe-pick-title';
                title.textContent = s.title;
                const detail = document.createElement('span');
                detail.className = 'transcribe-pick-detail';
                detail.textContent = s.detail;
                button.append(title, detail);
                row.append(button);
                return row;
            }));
            section.append(heading, list);
            return section;
        }));
    }

    function note(text) {
        const p = document.createElement('p');
        p.className = 'transcribe-empty';
        p.textContent = text;
        return p;
    }

    els.search.addEventListener('input', renderPicker);
    els.search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const first = els.list.querySelector('.transcribe-pick');
        if (first) choose(first.dataset.id);
    });
    els.list.addEventListener('click', (e) => {
        const pick = e.target.closest('.transcribe-pick');
        if (pick) choose(pick.dataset.id);
    });

    // Choosing a sample empties the editor to type it in, unless it is the
    // sample already being typed, which picks up where it was.
    async function choose(id) {
        const next = findSample(groups, id);
        if (!next) return;
        if (next === sample && next.code !== undefined) {
            choosing = false;
            render();
            focusEditor();
            return;
        }
        storage.save(SAMPLE_KEY, id);
        sample = next;
        choosing = false;
        render();
        if (await load(next)) {
            onStart(next);
            check();
        }
    }

    // Gets the sample's code, which a library program fetches the first
    // time. Says whether `s` is still the sample once it has it.
    async function load(s) {
        if (s.code !== undefined) return s === sample;
        const token = ++loadToken;
        renderSample();
        try {
            const res = await fetch(programPath(s.libraryId));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            s.code = await res.text();
        } catch (err) {
            if (token === loadToken) showMessage('error', `Could not load this sample: ${err.message}`);
            return false;
        }
        if (token !== loadToken || s !== sample) return false;
        renderSample();
        check();
        return true;
    }

    // ---- The sample ----

    function renderSample() {
        els.group.textContent = sample.group;
        els.title.textContent = sample.title;
        if (sample.code === undefined) {
            els.program.textContent = '';
            els.gutter.replaceChildren();
            els.rows.replaceChildren();
            showMessage('loading', 'Loading the sample…');
            return;
        }
        highlightLua(sample.code, els.program);
        const count = sample.code.split('\n').length;
        els.gutter.replaceChildren(...Array.from({ length: count }, (_, i) => {
            const n = document.createElement('div');
            n.textContent = String(i + 1);
            return n;
        }));
        els.rows.replaceChildren(...Array.from({ length: count }, () => document.createElement('div')));
    }

    function showMessage(state, text) {
        els.status.dataset.state = state;
        els.message.textContent = text;
    }

    // Checks the editor against the sample, and shows the result in the
    // panel and as marks in the editor.
    function check() {
        clearMarks();
        if (!isOpen() || choosing || sample?.code === undefined) return;
        const typed = editor.getValue();
        const result = checkTranscription(sample.code, typed);
        const lines = sampleLines(sample.code, result);
        showMessage(result.state, progressText(result, lines));
        els.meterFill.style.width = `${(100 * result.matched) / Math.max(1, result.total)}%`;
        els.run.hidden = result.state !== 'done';

        let current = null;
        lines.forEach((line, i) => {
            const state = line.state === 'current' && result.state === 'error' ? 'error' : line.state;
            els.rows.children[i]?.setAttribute('data-state', state);
            els.gutter.children[i]?.setAttribute('data-state', state);
            if (line.state === 'current') current = i;
        });
        if (current !== null) keepInView(current);

        marks.lines = typedOkLines(typed, result).map((line) => editor.addLineClass(line, 'gutter', 'transcribe-ok'));
        if (result.error) {
            const from = posAt(typed, result.error.from);
            const to = posAt(typed, result.error.to);
            marks.error = editor.markText(from, to, {
                className: 'cm-transcribe-error', attributes: { title: result.error.message },
            });
            marks.lines.push(editor.addLineClass(from.line, 'gutter', 'transcribe-wrong'));
        }
    }

    function clearMarks() {
        marks.error?.clear();
        for (const handle of marks.lines) {
            editor.removeLineClass(handle, 'gutter', 'transcribe-ok');
            editor.removeLineClass(handle, 'gutter', 'transcribe-wrong');
        }
        marks = { error: null, lines: [] };
    }

    // Scrolls the sample so the line to type now sits a third of the way
    // down, when it is out of the comfortable middle of the view.
    function keepInView(line) {
        const row = els.rows.children[line];
        if (!row) return;
        const view = els.scroll;
        const top = row.offsetTop;
        const margin = view.clientHeight * 0.2;
        if (top < view.scrollTop + margin || top + row.offsetHeight > view.scrollTop + view.clientHeight - margin) {
            view.scrollTop = top - view.clientHeight / 3;
        }
    }

    editor.on('changes', check);

    els.restart.addEventListener('click', () => {
        if (sample?.code === undefined) return;
        onStart(sample);
        check();
    });
    els.run.addEventListener('click', () => onRun());

    // ---- Rendering ----

    function render() {
        const picking = choosing || !sample;
        els.picker.hidden = !picking;
        els.sample.hidden = picking;
        els.back.setAttribute('aria-pressed', String(picking));
        els.back.disabled = !sample;
        if (picking) {
            els.group.textContent = 'Transcribe';
            els.title.textContent = 'Pick a sample to type in';
            clearMarks();
            renderPicker();
        } else {
            renderSample();
            check();
        }
    }

    els.back.addEventListener('click', () => {
        if (!sample) return;
        choosing = !choosing;
        render();
        if (choosing) els.search.focus();
        else els.scroll.focus({ preventScroll: true });
    });

    // ---- Opening and closing ----

    function isOpen() { return !els.panel.hidden; }

    function open() {
        if (!isOpen()) {
            els.panel.hidden = false;
            els.button.setAttribute('aria-expanded', 'true');
            els.button.classList.add('active');
            render();
            if (sample && !choosing) load(sample);
        }
        // Typing goes to the editor once a sample is chosen; the picker
        // takes it until then.
        if (choosing || !sample) els.search.focus();
        else focusEditor();
    }

    function close() {
        if (!isOpen()) return;
        els.panel.hidden = true;
        els.button.setAttribute('aria-expanded', 'false');
        els.button.classList.remove('active');
        clearMarks();
        focusEditor();
    }

    function toggle() {
        if (isOpen()) close();
        else open();
    }

    els.button.addEventListener('click', toggle);
    els.close.addEventListener('click', close);

    return {
        // The lessons arrive with the worker's `ready` message, as the
        // Lessons sidebar's chapters.
        setLessons(chapters) { pages = lessonPages(chapters); rebuild(); },
        // The library's catalog (library/catalog.json).
        setCatalog(next) { catalog = next; rebuild(); },
        open, close, toggle, isOpen,
        hasFocus: () => els.panel.contains(document.activeElement),
    };
}
