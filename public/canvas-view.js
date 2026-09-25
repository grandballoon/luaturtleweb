// canvas-view.js
// Canvas panel interaction. Drives the Renderer's viewport; draws nothing itself.
// Owns: toolbar (zoom in/out, reset, grid toggle + its persisted preference),
//       gestures (drag to pan, scroll to pan, pinch or Ctrl/⌘+scroll to zoom),
//       and keeping the canvas backing store matched to panel size and DPR.

import * as storage from './storage.js';

const GRID_KEY         = 'luaturtle-grid';
const WHEEL_ZOOM_RATE  = 0.01;   // zoom factor = e^(-deltaY * rate)
const WHEEL_ZOOM_CLAMP = 25;     // tames big mouse-wheel notches without slowing pinches
const LINE_PX          = 16;     // deltaMode 1 (lines) → pixels

export function initCanvasView(renderer, els) {
    const { panel, canvas, zoomIn, zoomOut, zoomReset, zoomLabel, gridBtn } = els;

    function viewChanged() {
        zoomLabel.textContent = renderer.zoomLabel();
        renderer.requestRedraw();
    }

    // ---- Toolbar ----

    zoomIn.addEventListener('click',    () => { renderer.zoomCenter(renderer.ZOOM_STEP);     viewChanged(); });
    zoomOut.addEventListener('click',   () => { renderer.zoomCenter(1 / renderer.ZOOM_STEP); viewChanged(); });
    zoomReset.addEventListener('click', () => { renderer.resetView();                        viewChanged(); });

    function setGrid(on) {
        renderer.gridVisible = on;
        gridBtn.classList.toggle('active', on);
        gridBtn.setAttribute('aria-pressed', String(on));
        storage.save(GRID_KEY, on);
        renderer.requestRedraw();
    }
    setGrid(storage.load(GRID_KEY) === 'true');
    gridBtn.addEventListener('click', () => setGrid(!renderer.gridVisible));

    // ---- Gestures ----

    function localPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    // Scroll pans; pinch (reported as Ctrl+wheel) or Ctrl/⌘+scroll zooms at the cursor.
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? canvas.clientHeight : 1;
        let dx = e.deltaX * unit;
        let dy = e.deltaY * unit;

        if (e.ctrlKey || e.metaKey) {
            const d = Math.max(-WHEEL_ZOOM_CLAMP, Math.min(WHEEL_ZOOM_CLAMP, dy));
            const p = localPoint(e);
            renderer.zoomAt(Math.exp(-d * WHEEL_ZOOM_RATE), p.x, p.y);
        } else {
            // Shift+wheel on a plain mouse means horizontal scroll.
            if (e.shiftKey && dx === 0) { dx = dy; dy = 0; }
            renderer.panBy(-dx, -dy);
        }
        viewChanged();
    }, { passive: false });

    // Pointer drag pans; two touch points pinch-zoom about their midpoint.
    const pointers = new Map();
    let pinch = null;   // { mid, dist } from the previous two-pointer move

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, localPoint(e));
        pinch = null;
        canvas.classList.add('panning');
    });

    canvas.addEventListener('pointermove', (e) => {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const p = localPoint(e);
        pointers.set(e.pointerId, p);

        if (pointers.size === 1) {
            renderer.panBy(p.x - prev.x, p.y - prev.y);
        } else if (pointers.size === 2) {
            const [a, b] = pointers.values();
            const mid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch && pinch.dist > 0) {
                renderer.panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
                renderer.zoomAt(dist / pinch.dist, mid.x, mid.y);
            }
            pinch = { mid, dist };
        }
        viewChanged();
    });

    const release = (e) => {
        pointers.delete(e.pointerId);
        pinch = null;
        if (pointers.size === 0) canvas.classList.remove('panning');
    };
    canvas.addEventListener('pointerup',     release);
    canvas.addEventListener('pointercancel', release);

    // ---- Sizing ----

    new ResizeObserver(() => renderer.resize()).observe(panel);
    renderer.resize();

    // ResizeObserver doesn't fire when the window moves to a display with a
    // different pixel ratio; without this the drawing goes blurry.
    (function watchPixelRatio() {
        matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
            .addEventListener('change', () => { renderer.resize(); watchPixelRatio(); }, { once: true });
    })();

    viewChanged();
}
