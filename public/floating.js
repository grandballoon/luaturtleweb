// floating.js
// Where a floating panel sits: its box, as pure functions of the window's
// size. It is dragged by its header and resized from any edge or corner.
// A box is { x, y, width, height } in CSS pixels from the top left of the
// window. Every function returns a box that fits the window, so a panel
// can be dragged, resized or brought back from a bigger screen without ever
// ending up out of reach. The shell (lessons-panel.js) applies the box and
// stores it.

export const MARGIN = 8;                          // px kept clear at the window's edges
export const MIN_SIZE = { width: 300, height: 240 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The box moved and shrunk as little as it takes to fit `view`
// ({ width, height }): never smaller than MIN_SIZE unless the window is.
export function clampRect(rect, view) {
    const roomW = Math.max(0, view.width - 2 * MARGIN);
    const roomH = Math.max(0, view.height - 2 * MARGIN);
    const width = clamp(rect.width, Math.min(MIN_SIZE.width, roomW), roomW);
    const height = clamp(rect.height, Math.min(MIN_SIZE.height, roomH), roomH);
    return {
        x: clamp(rect.x, MARGIN, view.width - MARGIN - width),
        y: clamp(rect.y, MARGIN, view.height - MARGIN - height),
        width,
        height,
    };
}

// Where a panel first floats: along the right edge, below `top` (the
// page's header), over the canvas rather than the code.
export function defaultRect(view, top = 0) {
    const width = Math.min(440, Math.round(view.width * 0.4));
    const height = view.height - top - 2 * MARGIN;
    return clampRect({ x: view.width - MARGIN - width, y: top + MARGIN, width, height }, view);
}

// The box dragged by (dx, dy).
export function dragRect(rect, dx, dy, view) {
    return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, view);
}

// The box resized by dragging the `edges` it is held by ({ left, right,
// top, bottom }, a corner being two of them) by (dx, dy). The edges held
// move; the others stay put. No edge goes past the window's margin, and the
// box keeps MIN_SIZE (unless the window is smaller), so a held edge stops
// where the box would get too small.
export function resizeRect(rect, edges, dx, dy, view) {
    const minW = Math.min(MIN_SIZE.width, view.width - 2 * MARGIN);
    const minH = Math.min(MIN_SIZE.height, view.height - 2 * MARGIN);
    let left = rect.x;
    let right = rect.x + rect.width;
    let top = rect.y;
    let bottom = rect.y + rect.height;
    if (edges.left) left = clamp(left + dx, MARGIN, right - minW);
    if (edges.right) right = clamp(right + dx, left + minW, view.width - MARGIN);
    if (edges.top) top = clamp(top + dy, MARGIN, bottom - minH);
    if (edges.bottom) bottom = clamp(bottom + dy, top + minH, view.height - MARGIN);
    return clampRect({ x: left, y: top, width: right - left, height: bottom - top }, view);
}

// The edges a resize handle holds, from its data-edges attribute ("top
// left", "right", ...).
export function edgesOf(names) {
    const held = new Set(String(names).split(/\s+/));
    return { left: held.has('left'), right: held.has('right'), top: held.has('top'), bottom: held.has('bottom') };
}

// A stored box, if it is one; anything else (nothing stored, or a value
// from an older version) is null.
export function readRect(value) {
    if (!value || typeof value !== 'object') return null;
    const { x, y, width, height } = value;
    return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}
