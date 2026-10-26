// dock.js
// A panel docked to the bottom of a column: open or collapsed to its header,
// and resized by dragging the header. Its height is remembered.
//
// Two panels use it: the command reference under the editor, and the
// terminal under the canvas. Each owns what's inside it; this owns only
// the panel's height, its collapse, and the drag.
//
// dockHeight is the decision, a pure function of the panel's state; the
// rest is the shell that measures, stores, and applies it.

import * as storage from './storage.js';

export const HEADER_HEIGHT = 27;   // the header, and the panel's top border
const MIN_REST     = 60;           // px of the column the panel always leaves showing
const DRAG_THRESHOLD = 3;

// The panel's height in px.
// open: whether it shows more than its header.
// stored: the height the learner last dragged it to, or NaN.
// defaultShare: the most of the column it takes until dragged, so a short
//   column (a phone, a small laptop) keeps room for what's above it.
// available: the column's height, of which MIN_REST stays uncovered.
export function dockHeight({ open, stored, defaultHeight, defaultShare = 1, minHeight, available }) {
    if (!open) return HEADER_HEIGHT;
    const max = Math.max(minHeight, available - MIN_REST);
    const wanted = Number.isFinite(stored) ? stored : Math.min(defaultHeight, available * defaultShare);
    return Math.round(Math.max(minHeight, Math.min(max, wanted)));
}

// panel: the docked element, whose first child is header.
// caret: the button in the header that collapses and opens it.
// column: the element it's docked in, which bounds how tall it can get.
// key: the storage key for its height.
// defaultHeight, defaultShare, minHeight: its open height until the learner
//   drags it, as a most of the column's height, and the least it can be.
// onToggle(open): it opened or collapsed. onLayout(): its height changed.
// Starts collapsed.
export function createDock({ panel, header, caret, column, key, defaultHeight, defaultShare, minHeight, onToggle = () => {}, onLayout = () => {} }) {
    let open = false;

    function apply() {
        const height = dockHeight({
            open,
            stored: parseInt(storage.load(key), 10),
            defaultHeight,
            defaultShare,
            minHeight,
            available: column.getBoundingClientRect().height,
        });
        panel.style.height = `${height}px`;
        onLayout();
    }

    function set(next) {
        if (next === open) return;
        open = next;
        panel.classList.toggle('collapsed', !open);
        caret.dataset.tooltip = open ? 'close' : 'open';
        caret.setAttribute('aria-expanded', String(open));
        apply();
        onToggle(open);
    }

    caret.addEventListener('click', () => set(!open));

    header.addEventListener('pointerdown', (e) => {
        if (!open || e.button !== 0 || e.target.closest('button, input, a')) return;
        const startY = e.clientY;
        const startHeight = panel.getBoundingClientRect().height;
        let moved = false;
        header.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            const delta = startY - ev.clientY;
            if (!moved && Math.abs(delta) < DRAG_THRESHOLD) return;
            moved = true;
            panel.style.height = `${dockHeight({
                open: true,
                stored: startHeight + delta,
                defaultHeight,
                minHeight,
                available: column.getBoundingClientRect().height,
            })}px`;
            onLayout();
        };
        const onEnd = () => {
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onEnd);
            header.removeEventListener('pointercancel', onEnd);
            if (moved) storage.save(key, Math.round(panel.getBoundingClientRect().height));
        };
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onEnd);
        header.addEventListener('pointercancel', onEnd);
    });

    // Back within bounds when the window shrinks, without saving: the
    // dragged height comes back when there's room for it again.
    addEventListener('resize', apply);

    panel.classList.add('collapsed');
    apply();

    return {
        isOpen: () => open,
        open:   () => set(true),
        close:  () => set(false),
        toggle: () => set(!open),
    };
}
