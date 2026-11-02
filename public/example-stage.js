// example-stage.js
// The stage the browsing pages (/library, /compsci) run library examples
// on: the canvas, the example's code in a collapsible editor beneath it,
// and the header's Run, Stop and Open in editor controls and status.
//
// Owns: loading programs, the editor and its dock, running and stopping,
// the header controls, and the run and stop shortcuts. The page owns what
// it browses and its link, and hears of each example shown through onShow.
// Delegates: running to runner.js, drawing to renderer.js, canvas gestures
// to canvas-view.js, the editor to lua-editor.js, the dock to dock.js.
//
// Expects the markup both pages share: the header controls (#btn-run,
// #btn-stop, #btn-open-editor, #run-shortcut, #header-status), the canvas
// panel (#canvas-panel, #turtle-canvas, the zoom buttons,
// #stage-canvas-hint), the editor (#stage-editor-*), and #sab-warning.

import { Renderer }        from './renderer.js';
import { initCanvasView }  from './canvas-view.js';
import { createDock }      from './dock.js';
import { createRunner }    from './runner.js';
import { createLuaEditor } from './lua-editor.js';
import * as storage        from './storage.js';
import { programPath }     from './library.js';

const IS_MAC       = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const RUN_SHORTCUT = IS_MAC ? '⌘↵' : 'Ctrl+Enter';
const EDITOR_OPEN_KEY = 'luaturtle-library-editor-open';

const $ = (id) => document.getElementById(id);

// pageName titles the document beside the example shown ("Library");
// onShow(example) follows every example shown.
export function createExampleStage({ pageName, onShow = () => {} }) {
    const app          = $('app');
    const headerStatus = $('header-status');
    const btnRun       = $('btn-run');
    const btnStop      = $('btn-stop');
    const openEditor   = $('btn-open-editor');
    const canvasHint   = $('stage-canvas-hint');
    const editorTitle  = $('stage-editor-title');
    const editorError  = $('stage-editor-error');
    const revert       = $('stage-editor-reset');

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

    const editor = createLuaEditor($('stage-editor-textarea'));

    const editorDock = createDock({
        panel:  $('stage-editor-panel'),
        header: $('stage-editor-header'),
        caret:  $('stage-editor-caret'),
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
        setState(state);   // Run needs an example
        document.title = `${example.name} — ${pageName} — Lua Turtle`;
        onShow(example);
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

    openEditor.addEventListener('click', (e) => {
        if (!current) e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runCode();
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

    return {
        show,
        // The example in the editor, or null.
        current: () => current,
    };
}
