// program-input.js
// Gives a running program the pointer and the keyboard on its canvas: the
// imperative shell around input-events.js's decisions.
//
// While the program listens (its latest UI says it has handlers or
// controls), every press that starts on the canvas is sent to it, with the
// moves and the release that follow, in turtle pixels. A press it claims
// (it handles clicks, or the press is on a control) doesn't pan the canvas;
// canvas-view.js asks claims() before it pans. Keys typed while the canvas
// has the keyboard are sent too, and the canvas takes the keyboard by
// itself once the program wants keys, giving it back when the run ends.
//
// send(event) delivers an event to the program (runner.input); returnFocus()
// is called when the run that took the keyboard ends with it still on the
// canvas.

import { keyEvent, claimsPress, cursorAt } from './input-events.js';

export function createProgramInput({ canvas, renderer, send, returnFocus = () => {} }) {
    let ui = null;            // the running program's latest UI, or null
    let tookKeyboard = false; // this run moved the keyboard to the canvas
    const presses = new Set();   // pointer ids of presses sent to the program

    function turtlePoint(e) {
        const rect = canvas.getBoundingClientRect();
        const p = renderer.turtlePoint(e.clientX - rect.left, e.clientY - rect.top);
        return { x: Math.round(p.x), y: Math.round(p.y) };
    }

    // ---- What the program wants ----

    // The run's latest UI, or null when no run is listening.
    function setUI(next) {
        ui = next?.active ? next : null;
        const keys = Boolean(ui?.keys);
        canvas.tabIndex = keys ? 0 : -1;
        canvas.classList.toggle('program-keys', keys);
        if (keys && !tookKeyboard && document.activeElement !== canvas) {
            tookKeyboard = true;
            canvas.focus({ preventScroll: true });
        }
        if (!ui) {
            canvas.style.cursor = '';
            presses.clear();
            if (tookKeyboard && document.activeElement === canvas) returnFocus();
            tookKeyboard = false;
        }
    }

    function claims(e) {
        if (!ui) return false;
        const p = turtlePoint(e);
        return claimsPress(ui, p.x, p.y);
    }

    // ---- Pointer ----

    canvas.addEventListener('pointerdown', (e) => {
        if (!ui || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const p = turtlePoint(e);
        if (ui.keys) canvas.focus({ preventScroll: true });
        if (claimsPress(ui, p.x, p.y)) {
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
        }
        presses.add(e.pointerId);
        send({ type: 'down', ...p });
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!ui) return;
        const p = turtlePoint(e);
        if (presses.has(e.pointerId)) send({ type: 'move', ...p });
        else if (e.buttons === 0) canvas.style.cursor = cursorAt(ui, p.x, p.y);
    });

    const release = (e) => {
        if (!presses.delete(e.pointerId)) return;
        send({ type: 'up', ...turtlePoint(e) });
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    // ---- Keys ----

    function onKey(type) {
        return (e) => {
            if (!ui?.keys) return;
            const event = keyEvent(e, type);
            if (!event) return;
            e.preventDefault();   // arrows and space would scroll the page
            send(event);
        };
    }
    canvas.addEventListener('keydown', onKey('key'));
    canvas.addEventListener('keyup', onKey('keyup'));
    canvas.addEventListener('blur', () => { if (ui) send({ type: 'blur' }); });

    return { setUI, claims };
}
