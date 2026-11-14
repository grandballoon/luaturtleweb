// public/swipe-guard.js
//
// Keeps a sideways two-finger swipe from going back or forward in Safari's
// history. styles.css sets overscroll-behavior-x: none on the root, which
// stops it in Chrome, Edge and Firefox; Safari can still navigate when a
// sideways wheel scroll reaches a page that nothing scrolls sideways.
//
// The decision is pure: given a wheel's deltas and the boxes from the
// pointer's element up to the root, cancel the wheel only when it is mostly
// sideways and no box can scroll further that way. A swipe that some box can
// still scroll is left alone, so the editor and wide code blocks scroll as
// before. installSwipeGuard is the shell.

// Within this many pixels of an edge counts as at the edge (zoomed pages
// report fractional scroll positions).
const EDGE_SLOP = 1;

// Whether `box` ({ overflowX, scrollLeft, scrollWidth, clientWidth }) would
// scroll for a sideways delta `dx` (positive scrolls right).
export function canScrollSideways(box, dx) {
    if (dx === 0) return false;
    if (box.overflowX !== 'auto' && box.overflowX !== 'scroll') return false;
    if (dx < 0) return box.scrollLeft > EDGE_SLOP;
    return box.scrollLeft + box.clientWidth < box.scrollWidth - EDGE_SLOP;
}

// Whether to cancel a wheel event with deltas { dx, dy } over `boxes`, the
// pointer's element and its ancestors, innermost first.
export function shouldBlockSwipe({ dx, dy }, boxes) {
    if (Math.abs(dx) <= Math.abs(dy)) return false;
    return !boxes.some(box => canScrollSideways(box, dx));
}

// Safari is the browser that needs the guard, and the only one with
// GestureEvent. Elsewhere the CSS is enough, and leaving out the listener
// keeps wheel scrolling off the main thread.
export function needsSwipeGuard(win) {
    return 'GestureEvent' in win;
}

function boxesFrom(element, win) {
    const boxes = [];
    for (let el = element; el instanceof win.Element; el = el.parentElement) {
        boxes.push({
            overflowX: win.getComputedStyle(el).overflowX,
            scrollLeft: el.scrollLeft,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        });
    }
    return boxes;
}

export function installSwipeGuard(win = window) {
    if (!needsSwipeGuard(win)) return;
    win.addEventListener('wheel', (e) => {
        if (e.defaultPrevented) return;   // the canvas already took it
        if (shouldBlockSwipe({ dx: e.deltaX, dy: e.deltaY }, boxesFrom(e.target, win))) {
            e.preventDefault();
        }
    }, { passive: false });
}
