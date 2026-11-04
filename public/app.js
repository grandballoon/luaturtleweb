// app.js
// UI shell. Wires the editor, runs, and panels together.
// Owns: CodeMirror setup, draft autosave and share links, what the page
//       shows about a run (status, terminal, error marks), header
//       controls, and global keyboard shortcuts.
// Delegates: running programs (the worker, the run state machine) to
//            runner.js, drawing to renderer.js, canvas gestures to canvas-view.js,
//            output to terminal.js, the divider to splitter.js, the
//            command reference to command-reference.js (its demo animations
//            to command-preview.js, and the panel it sits in to dock.js),
//            the examples under a
//            misused command's line to usage-popup.js, Cmd/Ctrl+click on a
//            command to command-lookup.js, a game controller to
//            gamepad-controller.js (given the reference's commands by
//            command-catalog.js), and the Lessons sidebar to
//            lessons-panel.js, and typing a sample in by hand to
//            transcribe-panel.js. Feature flags (flags.js) say which of
//            those features the page shows.

import { Renderer }             from './renderer.js';
import { Terminal }             from './terminal.js';
import { initSplitter }         from './splitter.js';
import { initCanvasView }       from './canvas-view.js';
import { initCommandReference } from './command-reference.js';
import { createDock }           from './dock.js';
import { createUsagePopup }     from './usage-popup.js';
import { initCommandLookup }    from './command-lookup.js';
import { createCommandPreview } from './command-preview.js';
import { readCommandCatalog }   from './command-catalog.js';
import { initGamepad }          from './gamepad-controller.js';
import { createLessonsPanel }   from './lessons-panel.js';
import { createTranscribePanel } from './transcribe-panel.js';
import { createRunner }         from './runner.js';
import { createLuaEditor }      from './lua-editor.js';
import * as storage             from './storage.js';
import { isOn, resolveFlags }   from './flags.js';

const IS_MAC       = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const RUN_SHORTCUT = IS_MAC ? '⌘↵' : 'Ctrl+Enter';
const MOD_LABEL    = IS_MAC ? '⌘' : 'Ctrl+';
const SHIFT_LABEL  = IS_MAC ? '⇧' : 'Shift+';
const API_SHORTCUT = `${MOD_LABEL}K`;
const DEMO_SHORTCUT = `${MOD_LABEL}${SHIFT_LABEL}D`;
const LESSONS_SHORTCUT = `${MOD_LABEL}${SHIFT_LABEL}L`;
const ARIA_MOD     = IS_MAC ? 'Meta' : 'Control';
const TERMINAL_SHORTCUT = IS_MAC ? '⌃`' : 'Ctrl+`';   // Control on every platform: macOS keeps ⌘` for switching windows
const CODE_KEY     = 'luaturtle-code';
const SAVE_DELAY   = 300;

const DEFAULT_CODE = [
    '-- Welcome to Lua Turtle!',
    '-- Write code on the left, click Run to see it draw.',
    '-- Keyboard shortcut: Ctrl+Enter (or Cmd+Enter on Mac)',
    '',
    '-- Try completing the square:',
    '',
    'forward(100)',
    'right(90)',
    'forward(100)',
    '',
].join('\n');
const START_CURSOR_LINE = 9;  // the blank line after the example, zero-based

const $ = (id) => document.getElementById(id);

// ---- Feature flags ----

// public/flags.json, at this host, with this tab's ?flags= overrides. An
// unreadable file leaves every feature on.
const flags = resolveFlags(
    await fetch(new URL('flags.json', import.meta.url)).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    location.search,
    location.hostname,
);

// The page marks each feature's elements with data-feature, and styles.css
// keeps them all hidden until the flags are decided, so a feature that is
// off never shows, not even while flags.json loads. Those of a feature that
// is off leave the page, so they leave no gap; then the rest are shown.
for (const el of document.querySelectorAll('[data-feature]')) {
    if (!isOn(flags, el.dataset.feature)) el.remove();
}
document.documentElement.dataset.flags = 'ready';

// Whether a feature is on; when it is off, the caller skips wiring it and
// its shortcuts.
const feature = (name) => isOn(flags, name);

const app          = $('app');
const headerStatus = $('header-status');
const btnRun       = $('btn-run');
const btnStop      = $('btn-stop');
const btnShare     = $('btn-share');

function setStatus(msg, kind) {
    headerStatus.textContent = msg;
    headerStatus.className   = kind || '';
}

// ---- Editor ----

// A share link (#<code>) wins over the saved draft, which wins over the welcome program.
function initialCode() {
    if (location.hash.length > 1) {
        try { return { code: decodeURIComponent(location.hash.slice(1)), shared: true }; }
        catch (e) { console.warn('Could not load code from URL:', e); }
    }
    return { code: storage.load(CODE_KEY, DEFAULT_CODE), shared: false };
}

const initial = initialCode();
const textarea = $('editor-textarea');
textarea.value = initial.code;

const editor = createLuaEditor(textarea);

// Draft autosave. The first edit also drops the share hash, so a reload
// keeps the learner's edits instead of snapping back to the shared program.
let saveTimer = 0;
function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    storage.save(CODE_KEY, editor.getValue());
}
editor.on('changes', () => {
    clearErrorMark();   // the usage popup stays up until dismissed
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, SAVE_DELAY);
});
addEventListener('pagehide', () => { if (saveTimer) saveDraft(); });

// Start ready to type below the half-drawn square. CodeMirror clamps this
// to the last line of shorter code.
editor.setCursor({ line: START_CURSOR_LINE, ch: 0 });
editor.focus();

// The editor's caret stays visible and blinking while the editor is blurred,
// for as long as anything that inserts there is open: each says so by name.
const ghostCursorFor = new Set();
function setGhostCursor(name, on) {
    if (on) ghostCursorFor.add(name);
    else ghostCursorFor.delete(name);
    editor.getWrapperElement().classList.toggle('cm-ghost-cursor', ghostCursorFor.size > 0);
}

// ---- Error highlight ----

let errorMark = null;   // CodeMirror TextMarker over the failing line's code
const usagePopup = createUsagePopup(editor);

// The code on a line, as [startCh, endCh): from its first non-blank character
// to the end of its last code token, leaving out indentation, a trailing
// comment, and trailing whitespace. A line with no code (a comment inside a
// multi-line construct, say) falls back to its non-blank text.
function codeSpan(lineIndex) {
    const code = editor.getLineTokens(lineIndex, true)
        .filter((t) => t.string.trim() && !/\bcomment\b/.test(t.type || ''));
    if (code.length) return [code[0].start, code[code.length - 1].end];
    const text = editor.getLine(lineIndex);
    const start = text.search(/\S/);
    return start < 0 ? null : [start, text.trimEnd().length];
}

// usage, if the error was a turtle command rejecting its arguments, is
// {command, examples}: shown in a popup under the line.
function markError(line, message, usage) {
    clearError();
    const lineIndex = line - 1;
    if (lineIndex < 0 || lineIndex >= editor.lineCount()) return;
    const span = codeSpan(lineIndex);
    if (!span) return;
    errorMark = editor.markText(
        { line: lineIndex, ch: span[0] },
        { line: lineIndex, ch: span[1] },
        { className: 'cm-error-code', attributes: { title: message } },
    );
    editor.scrollIntoView({ line: lineIndex, ch: span[0] }, 60);
    if (usage) usagePopup.show({ line: lineIndex, ch: span[0] }, usage);
}

function clearError() {
    usagePopup.hide();
    clearErrorMark();
}

function clearErrorMark() {
    if (!errorMark) return;
    errorMark.clear();
    errorMark = null;
}

// ---- Command lookup ----

// Every command's and alias's usage, {command, examples}, keyed by the name
// typed. Sent by the worker when the VM is ready; empty until then.
let usageCatalog = {};

initCommandLookup(editor, {
    isMac:    IS_MAC,
    lookup:   (name) => (Object.hasOwn(usageCatalog, name) ? usageCatalog[name] : null),
    onLookup: (pos, usage) => usagePopup.show(pos, usage, { transient: true }),
});

function goToLine(line) {
    const text = editor.getLine(line - 1) ?? '';
    editor.focus();
    editor.setCursor({ line: line - 1, ch: text.search(/\S|$/) });
}

// ---- Terminal ----

const terminal = new Terminal({
    panel:    $('terminal-panel'),
    header:   $('terminal-header'),
    content:  $('terminal-content'),
    caret:    $('terminal-caret'),
    clearBtn: $('terminal-clear'),
    column:   $('stage'),
}, {
    onLineClick: goToLine,
});

terminal.info(`print() output and errors appear here · ${TERMINAL_SHORTCUT} to toggle · drag this bar to resize`);
terminal.open();

// ---- Canvas and splitter ----

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

initSplitter($('main'), $('splitter'), { onResize: () => editor.refresh() });

// The canvas's size in CSS pixels, which screen_width() and screen_height() report.
function canvasSize() {
    const dpr = window.devicePixelRatio || 1;
    return {
        width:  Math.round(renderer.canvas.width  / dpr),
        height: Math.round(renderer.canvas.height / dpr),
    };
}

// ---- Run lifecycle ----

let state = 'loading';   // the runner's: 'loading' | 'idle' | 'running' | 'failed'

function setState(next) {
    state = next;
    app.dataset.state = next;
    btnStop.disabled  = next !== 'running';
    btnRun.disabled   = next === 'failed';
    btnRun.title      = next === 'running' ? `Restart (${RUN_SHORTCUT})` : `Run (${RUN_SHORTCUT})`;
}

function formatElapsed(ms) {
    return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// Each run's meta says whether its code is the editor's: a lesson's
// program runs on the canvas without touching the editor, so its lines
// aren't the editor's.
const runner = createRunner({
    renderer,
    canvasSize,
    onState: setState,
    onReady(msg) {
        usageCatalog = msg.usage || {};
        commandRef.setDemoPrograms(msg.demos);
        lessons?.setLessons(msg.lessons);
        transcribe?.setLessons(msg.lessons);
        setStatus(`Ready · ${RUN_SHORTCUT} to run`);   // a waiting run's status follows at once
    },
    onFail(detail) {
        setStatus('Lua failed to load — try reloading', 'error');
        terminal.error(`Could not start the Lua VM: ${detail}`);
        terminal.open();
    },
    onStart({ fromEditor }) {
        terminal.clear();
        clearError();
        setStatus(fromEditor ? 'Running' : "Running the lesson's program", 'running');
    },
    onPrint: (lines) => terminal.print(lines),
    onDone({ stopped, elapsed }) {
        setStatus(stopped ? 'Stopped' : `Done in ${formatElapsed(elapsed)}`);
    },
    onError({ message, line, usage }, { fromEditor }) {
        terminal.open();
        if (!fromEditor) {
            terminal.error(line ? `${message} (line ${line} of the lesson's program)` : message);
            setStatus("Error in the lesson's program — see terminal", 'error');
            return;
        }
        terminal.error(message, line);
        if (line) markError(line, message, usage);
        setStatus(line ? `Error on line ${line}` : 'Error — see terminal', 'error');
    },
});

// The Transcribe panel covers the canvas, so it steps aside for a run.
function runCode() {
    transcribe?.close();
    startRun(editor.getValue(), true);
}

// Runs a lesson page's program on the canvas, leaving the editor as it is.
function runLesson(code) {
    startRun(code, false);
}

// A run asked for while Lua loads starts as soon as it has.
function startRun(code, fromEditor) {
    if (runner.run(code, { fromEditor }) && state === 'loading') setStatus('Starting Lua…', 'running');
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

// ---- Share / export ----

let shareResetTimer = 0;

async function share() {
    const url = `${location.origin}${location.pathname}#${encodeURIComponent(editor.getValue())}`;
    try {
        await navigator.clipboard.writeText(url);
    } catch {
        window.prompt('Copy this link to share your program:', url);
        return;
    }
    btnShare.classList.add('copied');
    btnShare.querySelector('.btn-label').textContent = 'Copied';
    setStatus('Link copied — anyone with it can run your program');
    clearTimeout(shareResetTimer);
    shareResetTimer = setTimeout(() => {
        btnShare.classList.remove('copied');
        btnShare.querySelector('.btn-label').textContent = 'Share';
    }, 1800);
}

if (feature('share')) btnShare.addEventListener('click', share);
if (feature('export')) $('btn-export').addEventListener('click', () => renderer.exportPNG());

// ---- Command reference ----

// Puts text on its own line below the caret's line, matching its indentation,
// or on the caret's line if that is blank. Every line of a multi-line text
// gets that indentation. The caret follows, so repeated inserts build up a
// sequence of commands.
function insertLine(text) {
    const { line } = editor.getCursor();
    const current = editor.getLine(line);
    const end = { line, ch: current.length };
    const indent = current.match(/^\s*/)[0];
    const body = text.split('\n').join(`\n${indent}`);
    const insert = current.trim() ? `\n${indent}${body}` : body;
    editor.replaceRange(insert, end);
    editor.setCursor(editor.posFromIndex(editor.indexFromPos(end) + insert.length));
    editor.scrollIntoView(null, 40);
}

// Demos run at the real canvas's size, so screen_width() reports what a run
// would.
const commandPreview = createCommandPreview({
    canvas: $('api-preview-canvas'),
    output: $('api-preview-output'),
    canvasSize,
});

// The panel under the editor the reference lives in: roomy enough for the
// list beside a legible demo, until the learner resizes it, but never more
// than 45% of the column to start, so the code keeps most of the room.
const referenceDock = createDock({
    panel:  $('reference-panel'),
    header: $('reference-header'),
    caret:  $('reference-caret'),
    column: $('editor-panel'),
    key:    'luaturtle-reference-height',
    defaultHeight: 320,
    defaultShare:  0.45,
    minHeight:     180,
    onToggle: (open) => commandRef.dockChanged(open),
    onLayout: () => editor.refresh(),
});

const commandRef = initCommandReference({
    overlay: $('api-overlay'),
    button: $('btn-api'),
    preview: commandPreview,
    dock: referenceDock,
    demoToggle: $('api-demo-toggle'),
    shortcut: API_SHORTCUT,
    demoShortcut: DEMO_SHORTCUT,
    keyShortcuts: { focus: `${ARIA_MOD}+K`, demos: `${ARIA_MOD}+Shift+D` },
    copyShortcut: `${MOD_LABEL}C`,
    insertShortcut: `${MOD_LABEL}I`,
    // Keep the editor's caret visible while the overlay has focus, and send
    // pastes there, so a copied command can be pasted without leaving it.
    onToggle: (open) => setGhostCursor('reference', open),
    // CodeMirror keeps its selection while blurred, so this restores the caret.
    onClose:  () => editor.focus(),
    onPaste:  (text) => editor.replaceSelection(text),
    onInsert: insertLine,
});
$('api-shortcut').textContent = API_SHORTCUT;
$('reference-focus-key').textContent = API_SHORTCUT;
$('api-demo-key').textContent = DEMO_SHORTCUT;
commandRef.show();   // open from the start, without taking focus from the editor
document.querySelectorAll('.api-section-key').forEach((kbd, i) => {
    kbd.textContent = `${SHIFT_LABEL}${i ? '↓' : '↑'}`;
});

// ---- Lessons ----

// Opening a lesson's program replaces the learner's, which the editor's
// undo brings back. The lessons can float beside the editor (see
// lessons-panel.js), so a learner can also type a program in by hand.
function openInEditor(code) {
    editor.setValue(code);
    editor.focus();
    setStatus(`Opened the lesson's program · ${MOD_LABEL}Z brings yours back`);
}

const lessons = feature('lessons') ? createLessonsPanel({
    els: {
        panel:          $('lessons-panel'),
        button:         $('btn-lessons'),
        header:         $('lessons-header'),
        detach:         $('lessons-detach'),
        close:          $('lessons-close'),
        resize:         $('lessons-resize'),
        contentsButton: $('lessons-contents'),
        chapter:        $('lessons-chapter'),
        lesson:         $('lessons-lesson'),
        body:           $('lessons-body'),
        loading:        $('lessons-loading'),
        page:           $('lessons-page'),
        intro:          $('lessons-intro'),
        kind:           $('lessons-kind'),
        title:          $('lessons-title'),
        problem:        $('lessons-problem'),
        text:           $('lessons-text'),
        steps:          $('lessons-steps'),
        codeLines:      $('lessons-code-lines'),
        code:           $('lessons-code'),
        run:            $('lessons-run'),
        open:           $('lessons-open'),
        copy:           $('lessons-copy'),
        source:         $('lessons-source'),
        contents:       $('lessons-toc'),
        footer:         $('lessons-footer'),
        prev:           $('lessons-prev'),
        next:           $('lessons-next'),
        position:       $('lessons-position'),
    },
    headerBottom: () => document.querySelector('header').getBoundingClientRect().bottom,
    onRun:    (code) => { gamepad.closeMapping(); runLesson(code); },
    onOpen:   openInEditor,
    onClose:  () => editor.focus(),
}) : null;
if (lessons) {
    $('lessons-shortcut').textContent = LESSONS_SHORTCUT;
    $('btn-lessons').title = `Lessons (${LESSONS_SHORTCUT})`;
}

// ---- Transcribe ----

// Typing a sample in starts from an empty editor; the editor's undo brings
// the learner's program back.
function startTranscribing(sample) {
    editor.setValue('');
    editor.focus();
    setStatus(`Type “${sample.title}” in · ${MOD_LABEL}Z brings your program back`);
}

const transcribe = feature('transcribe') ? createTranscribePanel({
    els: {
        panel:     $('transcribe-panel'),
        button:    $('btn-transcribe'),
        back:      $('transcribe-back'),
        close:     $('transcribe-close'),
        group:     $('transcribe-group'),
        title:     $('transcribe-title'),
        picker:    $('transcribe-picker'),
        search:    $('transcribe-search'),
        list:      $('transcribe-list'),
        sample:    $('transcribe-sample'),
        status:    $('transcribe-status'),
        message:   $('transcribe-message'),
        meterFill: $('transcribe-meter-fill'),
        run:       $('transcribe-run'),
        restart:   $('transcribe-restart'),
        scroll:    $('transcribe-code-scroll'),
        gutter:    $('transcribe-gutter'),
        rows:      $('transcribe-rows'),
        program:   $('transcribe-program'),
    },
    editor,
    onStart:     startTranscribing,
    onRun:       () => { gamepad.closeMapping(); runCode(); },
    focusEditor: () => editor.focus(),
}) : null;
if (transcribe) {
    fetch(new URL('library/catalog.json', import.meta.url))
        .then((r) => (r.ok ? r.json() : null))
        .then((catalog) => catalog && transcribe.setCatalog(catalog))
        .catch((err) => console.warn('Could not load the library catalog:', err));
}

// ---- Game controller ----

const gamepad = initGamepad({
    els: {
        menu:      $('gamepad-menu'),
        chip:      $('gamepad-chip'),
        chipGlyph: $('gamepad-chip-glyph'),
        mapping:   $('gamepad-mapping'),
    },
    catalog:  readCommandCatalog($('api-list')),
    onInsert: insertLine,
    onRun:    () => { gamepad.closeMapping(); runCode(); },
    onStop:   stopCode,
    onUndo:   () => editor.undo(),
    onRedo:   () => editor.redo(),
    onMenuToggle: (open) => setGhostCursor('gamepad-menu', open),
    onRefocus: () => editor.focus(),
});

// ---- Global shortcuts ----

document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') {
        e.preventDefault();
        gamepad.closeMapping();   // it covers the drawing
        runCode();
    } else if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.code === 'Backquote') {
        e.preventDefault();
        terminal.toggle();
    } else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();   // Chrome and Firefox otherwise focus the search bar
        // Moves focus between the editor and the reference's search bar,
        // opening the reference if it's collapsed; it never collapses it.
        if (commandRef.hasFocus()) editor.focus();
        else commandRef.open();
    } else if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();   // browsers otherwise bookmark the open tabs
        commandRef.toggleDemos();
    } else if (lessons && mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();   // Safari otherwise toggles its own sidebar
        lessons.toggle();
    } else if (e.key === 'Escape') {
        // The reference stays open while the learner works in the editor,
        // so Esc closes it only from inside it, and elsewhere stops a run.
        // The lessons close the same way.
        if (gamepad.isMappingOpen()) {
            gamepad.closeMapping();
        } else if (lessons?.isOpen() && lessons.hasFocus()) {
            lessons.close();
        } else if (transcribe?.isOpen() && transcribe.hasFocus()) {
            transcribe.close();
        } else if (commandRef.isOpen() && commandRef.hasFocus()) {
            commandRef.close();
        } else if (usagePopup.isOpen()) {
            usagePopup.hide();
        } else if (state === 'running') {
            stopCode();
        }
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
// Shared links run as soon as the VM is ready.
if (initial.shared) runCode();
