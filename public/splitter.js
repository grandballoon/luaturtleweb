// splitter.js
// Draggable, keyboard-accessible divider between the editor and the canvas.
//
// The editor's share of the space is written as a percentage into CSS custom
// properties on #main: --split-x (side by side) and --split-y (stacked). The
// stylesheet decides which one applies at the current width, so crossing the
// mobile breakpoint never leaves a stale inline grid template behind.

import * as storage from './storage.js';

const MIN            = 10;
const MAX            = 90;
const KEY_STEP       = 2;
const KEY_STEP_LARGE = 10;
const STACKED        = window.matchMedia('(max-width: 768px)');

export function initSplitter(mainEl, splitter, { onResize }) {
    const split = { x: null, y: null };   // null = stylesheet default (50/50)

    const axis       = () => (STACKED.matches ? 'y' : 'x');
    const storageKey = (a) => `luaturtle-split-${a}`;

    function apply(a, pct) {
        split[a] = pct;
        if (pct === null) mainEl.style.removeProperty(`--split-${a}`);
        else              mainEl.style.setProperty(`--split-${a}`, `${pct}%`);
        syncAria();
        onResize();
    }

    function set(a, pct, persist) {
        pct = Math.max(MIN, Math.min(MAX, pct));
        apply(a, pct);
        if (persist) storage.save(storageKey(a), pct);
    }

    function reset() {
        const a = axis();
        apply(a, null);
        storage.remove(storageKey(a));
    }

    function syncAria() {
        const a = axis();
        // A vertical separator divides panels laid out side by side.
        splitter.setAttribute('aria-orientation', a === 'x' ? 'vertical' : 'horizontal');
        splitter.setAttribute('aria-valuenow', Math.round(split[a] ?? 50));
    }

    for (const a of ['x', 'y']) {
        const stored = parseFloat(storage.load(storageKey(a)));
        if (Number.isFinite(stored)) split[a] = Math.max(MIN, Math.min(MAX, stored));
        if (split[a] !== null) mainEl.style.setProperty(`--split-${a}`, `${split[a]}%`);
    }
    syncAria();

    // ---- Pointer ----

    let dragging = false;

    function pctAt(e) {
        const rect = mainEl.getBoundingClientRect();
        return axis() === 'x'
            ? ((e.clientX - rect.left) / rect.width)  * 100
            : ((e.clientY - rect.top)  / rect.height) * 100;
    }

    splitter.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        splitter.classList.add('dragging');
        splitter.setPointerCapture(e.pointerId);
    });

    splitter.addEventListener('pointermove', (e) => {
        if (dragging) set(axis(), pctAt(e), false);
    });

    const stopDrag = () => {
        if (!dragging) return;
        dragging = false;
        splitter.classList.remove('dragging');
        const a = axis();
        if (split[a] !== null) storage.save(storageKey(a), split[a]);
    };
    splitter.addEventListener('pointerup',     stopDrag);
    splitter.addEventListener('pointercancel', stopDrag);
    splitter.addEventListener('dblclick', reset);

    // ---- Keyboard ----

    splitter.addEventListener('keydown', (e) => {
        const a    = axis();
        const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        const now  = split[a] ?? 50;
        const back = a === 'x' ? 'ArrowLeft'  : 'ArrowUp';
        const fwd  = a === 'x' ? 'ArrowRight' : 'ArrowDown';

        if      (e.key === back)  set(a, now - step, true);
        else if (e.key === fwd)   set(a, now + step, true);
        else if (e.key === 'Home') set(a, MIN, true);
        else if (e.key === 'End')  set(a, MAX, true);
        else if (e.key === 'Enter') reset();
        else return;
        e.preventDefault();
    });

    STACKED.addEventListener('change', () => { syncAria(); onResize(); });
}
