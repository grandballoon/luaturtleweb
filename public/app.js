// app.js
// UI shell. Wires the editor, run lifecycle, worker, and panels together.
// Owns: CodeMirror setup, draft autosave and share links, the run state
//       machine (loading → idle ⇄ running), header controls, and global
//       keyboard shortcuts.
// Delegates: drawing to renderer.js, canvas gestures to canvas-view.js,
//            output to terminal.js, the divider to splitter.js, the
//            command-reference overlay to command-reference.js.

import { Renderer }             from './renderer.js';
import { Terminal }             from './terminal.js';
import { initSplitter }         from './splitter.js';
import { initCanvasView }       from './canvas-view.js';
import { initCommandReference } from './command-reference.js';
import * as storage             from './storage.js';

const IS_MAC       = /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || '');
const RUN_SHORTCUT = IS_MAC ? '⌘↵' : 'Ctrl+Enter';
const MOD_LABEL    = IS_MAC ? '⌘' : 'Ctrl+';
const SHIFT_LABEL  = IS_MAC ? '⇧' : 'Shift+';
const API_SHORTCUT = `${MOD_LABEL}K`;
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

const TURTLE_COMMANDS = /^(forward|back|left|right|fd|bk|lt|rt|penup|pendown|pu|pd|pensize|pencolor|fillcolor|color|bgcolor|clear|reset|undo|speed|position|heading|isdown|filling|isvisible|hideturtle|showturtle|xcor|ycor|distance|towards|setheading|seth|home|setpos|setx|sety|teleport|circle|begin_fill|end_fill|dot|write|stamp|clearstamp|clearstamps|Turtle|tracer|update|done)\b/;

const $ = (id) => document.getElementById(id);

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

const editor = CodeMirror.fromTextArea(textarea, {
    mode: 'lua',
    theme: 'turtle',   // palette comes from the theme tokens in styles.css
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    lineWrapping: false,
    smartIndent: false,
    extraKeys: {
        'Tab':       (cm) => cm.execCommand('insertSoftTab'),
        'Shift-Tab': (cm) => cm.execCommand('indentLess'),
    },
});

editor.addOverlay({
    token(stream) {
        if (stream.match(TURTLE_COMMANDS)) return 'turtle-cmd';
        stream.next();
        return null;
    },
});

// Draft autosave. The first edit also drops the share hash, so a reload
// keeps the learner's edits instead of snapping back to the shared program.
let saveTimer = 0;
function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    storage.save(CODE_KEY, editor.getValue());
}
editor.on('changes', () => {
    clearErrorLine();
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, SAVE_DELAY);
});
addEventListener('pagehide', () => { if (saveTimer) saveDraft(); });

// Start ready to type below the half-drawn square. CodeMirror clamps this
// to the last line of shorter code.
editor.setCursor({ line: START_CURSOR_LINE, ch: 0 });
editor.focus();

// ---- Error line highlight ----

let errorLine = null;   // CodeMirror line handle

function markErrorLine(line) {
    clearErrorLine();
    const handle = editor.getLineHandle(line - 1);
    if (!handle) return;
    errorLine = handle;
    editor.addLineClass(handle, 'background', 'cm-error-line');
    editor.addLineClass(handle, 'gutter', 'cm-error-gutter');
    editor.scrollIntoView({ line: line - 1, ch: 0 }, 60);
}

function clearErrorLine() {
    if (!errorLine) return;
    editor.removeLineClass(errorLine, 'background', 'cm-error-line');
    editor.removeLineClass(errorLine, 'gutter', 'cm-error-gutter');
    errorLine = null;
}

function goToLine(line) {
    const text = editor.getLine(line - 1) ?? '';
    editor.focus();
    editor.setCursor({ line: line - 1, ch: text.search(/\S|$/) });
}

// ---- Terminal ----

const terminal = new Terminal({
    panel:     $('terminal-panel'),
    header:    $('terminal-header'),
    content:   $('terminal-content'),
    caret:     $('terminal-caret'),
    clearBtn:  $('terminal-clear'),
    container: $('editor-panel'),
}, {
    onLayout:    () => editor.refresh(),
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

// ---- Run lifecycle ----

let state         = 'loading';   // 'loading' | 'idle' | 'running' | 'failed'
let runId         = 0;
let pendingRun    = initial.shared;   // shared links run as soon as the VM is ready
let stopRequested = false;
let runStartedAt  = 0;
let sab, sabI32, worker;

function setState(next) {
    state = next;
    app.dataset.state = next;
    btnStop.disabled  = next !== 'running';
    btnRun.disabled   = next === 'failed';
    btnRun.title      = next === 'running' ? `Restart (${RUN_SHORTCUT})` : `Run (${RUN_SHORTCUT})`;
}

function signalStop() {
    Atomics.store(sabI32, 1, 1);
    Atomics.notify(sabI32, 0);   // wake the worker if it's waiting on a frame ack
}

function runCode() {
    if (state === 'failed') return;
    if (state === 'loading') {
        pendingRun = true;
        setStatus('Starting Lua…', 'running');
        return;
    }
    // Run while running restarts: stop the current run, then queue the new
    // one. The worker clears the stop flag when it picks up the new message.
    if (state === 'running') signalStop();

    runId++;
    stopRequested = false;
    runStartedAt  = performance.now();
    terminal.clear();
    clearErrorLine();
    setState('running');
    setStatus('Running', 'running');

    const dpr = window.devicePixelRatio || 1;
    worker.postMessage({
        type: 'run', runId, code: editor.getValue(), sab,
        canvasWidth:  Math.round(renderer.canvas.width  / dpr),
        canvasHeight: Math.round(renderer.canvas.height / dpr),
    });
}

function stopCode() {
    if (state !== 'running') return;
    stopRequested = true;
    signalStop();
    setStatus('Stopping…', 'running');
}

function formatElapsed(ms) {
    return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function onWorkerMessage(e) {
    const msg = e.data;

    if (msg.type === 'frame') {
        // Always render and ack, even a straggler from a replaced run:
        // the worker blocks until it gets the ack.
        renderer.applyFrame(msg.segments, msg.turtles, msg.bgcolor);
        Atomics.store(sabI32, 0, 1);
        Atomics.notify(sabI32, 0);
        return;
    }

    if (msg.type === 'ready') {
        setState('idle');
        setStatus(`Ready · ${RUN_SHORTCUT} to run`);
        if (pendingRun) { pendingRun = false; runCode(); }
        return;
    }

    if (msg.type === 'init-error') {
        failToLoad(msg.message);
        return;
    }

    // Everything below belongs to a run; ignore replies from a replaced one.
    if (msg.runId !== runId) return;

    if (msg.type === 'print') {
        terminal.print(msg.lines);

    } else if (msg.type === 'done') {
        setState('idle');
        setStatus(stopRequested ? 'Stopped' : `Done in ${formatElapsed(performance.now() - runStartedAt)}`);

    } else if (msg.type === 'error') {
        setState('idle');
        terminal.error(msg.message, msg.line);
        if (!terminal.isOpen) terminal.open();
        if (msg.line) markErrorLine(msg.line);
        setStatus(msg.line ? `Error on line ${msg.line}` : 'Error — see terminal', 'error');
    }
}

function failToLoad(detail) {
    setState('failed');
    setStatus('Lua failed to load — try reloading', 'error');
    terminal.error(`Could not start the Lua VM: ${detail}`);
    if (!terminal.isOpen) terminal.open();
}

function startWorker() {
    sab    = new SharedArrayBuffer(8);   // [FRAME_ACK, STOP_FLAG]
    sabI32 = new Int32Array(sab);
    worker = new Worker('worker.js');
    worker.onmessage = onWorkerMessage;
    worker.onerror   = (e) => failToLoad(e.message || 'the worker script failed');
    worker.postMessage({ type: 'init' });
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

btnShare.addEventListener('click', share);
$('btn-export').addEventListener('click', () => renderer.exportPNG());

// ---- Command reference ----

// Puts text on its own line below the caret's line, matching its indentation,
// or on the caret's line if that is blank. The caret follows, so repeated
// inserts build up a sequence of commands.
function insertLine(text) {
    const { line } = editor.getCursor();
    const current = editor.getLine(line);
    const end = { line, ch: current.length };
    const insert = current.trim() ? `\n${current.match(/^\s*/)[0]}${text}` : text;
    editor.replaceRange(insert, end);
    editor.setCursor(editor.posFromIndex(editor.indexFromPos(end) + insert.length));
    editor.scrollIntoView(null, 40);
}

const commandRef = initCommandReference({
    overlay: $('api-overlay'),
    button: $('btn-api'),
    shortcut: API_SHORTCUT,
    copyShortcut: `${MOD_LABEL}C`,
    insertShortcut: `${MOD_LABEL}I`,
    // Keep the editor's caret visible while the overlay has focus, and send
    // pastes there, so a copied command can be pasted without leaving it.
    onToggle: (open) => editor.getWrapperElement().classList.toggle('cm-ghost-cursor', open),
    // CodeMirror keeps its selection while blurred, so this restores the caret.
    onClose:  () => editor.focus(),
    onPaste:  (text) => editor.replaceSelection(text),
    onInsert: insertLine,
});
$('api-shortcut').textContent = API_SHORTCUT;
document.querySelectorAll('.api-section-key').forEach((kbd, i) => {
    kbd.textContent = `${SHIFT_LABEL}${i ? '↓' : '↑'}`;
});

// ---- Global shortcuts ----

document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    } else if (e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.code === 'Backquote') {
        e.preventDefault();
        terminal.toggle();
    } else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();   // Chrome and Firefox otherwise focus the search bar
        commandRef.toggle();
    } else if (e.key === 'Escape') {
        if (commandRef.isOpen()) {
            commandRef.close();
        } else if (state === 'running') {
            stopCode();
        }
    }
});

// ---- Boot ----

setState('loading');

if (typeof SharedArrayBuffer === 'undefined') {
    $('sab-warning').hidden = false;
    setState('failed');
    setStatus('Error: missing COOP/COEP headers', 'error');
} else {
    setStatus('Loading Lua…', 'running');
    startWorker();
}
