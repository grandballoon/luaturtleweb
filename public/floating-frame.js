// floating-frame.js
// Turns an element into a small window floating over the page: dragged by
// a handle, resized from a corner grip, and kept fully on screen when the
// browser window shrinks. Its position and size are remembered.
//
// Owns: the element's geometry while attached (inline left, top, width,
// height), the pointer handling on the handle and grip, and the saved
// geometry. How it looks is up to the stylesheet; the owner puts the
// element where it goes in the page, and takes it out again.

import * as storage from './storage.js';

const MARGIN = 16;   // px between a new frame and the viewport's edges
const DRAG_THRESHOLD = 3;

// Inside the handle, these keep their own pointer behavior.
const INTERACTIVE = 'input, button, label, a, select, textarea';

// handle, grip: the elements dragged to move and to resize.
// key: the storage key for the geometry.
// size: {width, height} a first frame opens at, and minSize the least a
// resize can make it; both shrink to fit a smaller viewport.
export function createFloatingFrame({ handle, grip, key, size, minSize }) {
    let el = null;     // the attached element
    let rect = null;   // {x, y, width, height}, in viewport px

    function load() {
        try {
            const saved = JSON.parse(storage.load(key));
            if (['x', 'y', 'width', 'height'].every((k) => Number.isFinite(saved?.[k]))) return saved;
        } catch { /* fall through to the default */ }
        return null;
    }

    // Bottom-right, where it covers the least of the editor.
    function defaultRect() {
        const width  = Math.min(size.width,  innerWidth  - 2 * MARGIN);
        const height = Math.min(size.height, innerHeight - 2 * MARGIN);
        return { x: innerWidth - width - MARGIN, y: innerHeight - height - MARGIN, width, height };
    }

    // Fits r inside the viewport: no smaller than minSize unless the
    // viewport is, and moved back on screen rather than cut off.
    function clamp(r) {
        const width  = Math.min(Math.max(r.width,  minSize.width),  innerWidth);
        const height = Math.min(Math.max(r.height, minSize.height), innerHeight);
        return {
            width, height,
            x: Math.min(Math.max(r.x, 0), innerWidth  - width),
            y: Math.min(Math.max(r.y, 0), innerHeight - height),
        };
    }

    function apply(next) {
        rect = clamp(next);
        el.style.left   = `${rect.x}px`;
        el.style.top    = `${rect.y}px`;
        el.style.width  = `${rect.width}px`;
        el.style.height = `${rect.height}px`;
    }

    const save = () => storage.save(key, JSON.stringify(rect));

    // Calls move(dx, dy) as the pointer drags from its pointerdown on
    // target, and saves once it's done if it moved at all.
    function track(target, e, move) {
        const start = { x: e.clientX, y: e.clientY, rect };
        let moved = false;
        target.setPointerCapture(e.pointerId);
        const onMove = (ev) => {
            const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
            if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            moved = true;
            move(start.rect, dx, dy);
        };
        const onEnd = () => {
            target.removeEventListener('pointermove', onMove);
            target.removeEventListener('pointerup', onEnd);
            target.removeEventListener('pointercancel', onEnd);
            el?.classList.remove('dragging');
            if (moved) save();
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onEnd);
        target.addEventListener('pointercancel', onEnd);
        el.classList.add('dragging');
    }

    function onHandleDown(e) {
        if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
        e.preventDefault();   // no text selection while dragging
        track(handle, e, (r, dx, dy) => apply({ ...r, x: r.x + dx, y: r.y + dy }));
    }

    function onGripDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        track(grip, e, (r, dx, dy) => apply({
            ...r,
            width:  Math.min(r.width  + dx, innerWidth  - r.x),
            height: Math.min(r.height + dy, innerHeight - r.y),
        }));
    }

    // Kept on screen as the viewport shrinks, without saving: the saved
    // geometry comes back when there's room for it again.
    function onViewportResize() {
        apply(load() ?? rect);
    }

    function attach(element) {
        el = element;
        apply(load() ?? defaultRect());
        handle.addEventListener('pointerdown', onHandleDown);
        grip.addEventListener('pointerdown', onGripDown);
        addEventListener('resize', onViewportResize);
    }

    function detach() {
        handle.removeEventListener('pointerdown', onHandleDown);
        grip.removeEventListener('pointerdown', onGripDown);
        removeEventListener('resize', onViewportResize);
        for (const prop of ['left', 'top', 'width', 'height']) el.style.removeProperty(prop);
        el.classList.remove('dragging');
        el = null;
    }

    return { attach, detach };
}
