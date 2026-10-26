// gamepad-input.js
// Reads controllers through the browser's Gamepad API and reports their
// buttons the way the keyboard reports keys: a press when a button goes
// down, more presses (marked as repeats) while it's held, and a release
// when it comes up.
//
// Owns only the reading; what a button does is up to the owner. Buttons are
// numbered as in the W3C "standard" gamepad mapping, which gamepad-layout.js
// names. The left stick counts as the d-pad, so pushing it is a press of the
// d-pad button in that direction. Every connected controller is read as one.
//
// A browser reveals a controller to the page only once one of its buttons
// is pressed. That press is not reported: whatever is down when a controller
// first shows up is ignored until it's released.

const REPEAT_DELAY    = 400;   // ms a button is held before it repeats
const REPEAT_INTERVAL = 110;   // ms between repeats after that
const PRESS_VALUE     = 0.5;   // an analog trigger counts as pressed past this

// The left stick presses a direction past STICK_PRESS and lets go of it
// under STICK_RELEASE. A held direction gives way to the other axis only
// once that axis is STICK_SWITCH times stronger, so a stick resting near a
// diagonal doesn't flicker between the two.
const STICK_PRESS   = 0.6;
const STICK_RELEASE = 0.4;
const STICK_SWITCH  = 1.5;

const DPAD = { up: 12, down: 13, left: 14, right: 15 };

// The d-pad button the left stick at (x, y) presses, or null. previous is
// the one it pressed on the last read.
function stickDirection(x, y, previous) {
    const strength = { [DPAD.left]: -x, [DPAD.right]: x, [DPAD.up]: -y, [DPAD.down]: y };
    const strongest = Math.max(Math.abs(x), Math.abs(y));
    if (previous !== null && strength[previous] >= STICK_RELEASE && strongest < strength[previous] * STICK_SWITCH) {
        return previous;
    }
    if (strongest < STICK_PRESS) return null;
    if (Math.abs(x) > Math.abs(y)) return x < 0 ? DPAD.left : DPAD.right;
    return y < 0 ? DPAD.up : DPAD.down;
}

// Returns read(pads, now): the events since the last read, as
// [{ type: 'press' | 'release', button, repeat }], given the connected
// Gamepad objects and the time in ms. Kept apart from the polling below so
// it can be tested without a browser.
export function createGamepadReader() {
    const seen = new Map();   // pad index → { waking: buttons to ignore until released, stick }
    const held = new Map();   // button → when its next repeat is due

    return function read(pads, now) {
        for (const index of seen.keys()) {
            if (!pads.some((pad) => pad.index === index)) seen.delete(index);
        }

        const down = new Set();
        for (const pad of pads) {
            let state = seen.get(pad.index);
            const first = !state;
            if (first) seen.set(pad.index, state = { waking: new Set(), stick: null });

            const pressed = new Set();
            pad.buttons.forEach((b, i) => {
                if (b.pressed || b.value > PRESS_VALUE) pressed.add(i);
            });
            state.stick = stickDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0, state.stick);
            if (state.stick !== null) pressed.add(state.stick);

            if (first) state.waking = new Set(pressed);
            for (const button of state.waking) {
                if (!pressed.has(button)) state.waking.delete(button);
            }
            for (const button of pressed) {
                if (!state.waking.has(button)) down.add(button);
            }
        }

        const events = [];
        for (const button of held.keys()) {
            if (down.has(button)) continue;
            held.delete(button);
            events.push({ type: 'release', button });
        }
        for (const button of down) {
            const due = held.get(button);
            if (due === undefined) {
                held.set(button, now + REPEAT_DELAY);
                events.push({ type: 'press', button, repeat: false });
            } else if (now >= due) {
                held.set(button, now + REPEAT_INTERVAL);
                events.push({ type: 'press', button, repeat: true });
            }
        }
        return events;
    };
}

// Polls once per frame while any controller is connected, and not at all
// otherwise.
// onPress(button, repeat), onRelease(button): the events above.
// onConnection(connected): a first controller arrived, or the last one left.
export function initGamepadInput({ onPress, onRelease, onConnection }) {
    if (!navigator.getGamepads) return;

    const read = createGamepadReader();
    let frame = 0;
    let connected = false;

    // Null slots are controllers that left; a document without permission
    // to use gamepads throws.
    function pads() {
        try {
            return [...navigator.getGamepads()].filter((pad) => pad?.connected);
        } catch {
            return [];
        }
    }

    function poll(now) {
        const current = pads();
        for (const event of read(current, now)) {
            if (event.type === 'press') onPress(event.button, event.repeat);
            else onRelease(event.button);
        }
        if (connected !== current.length > 0) {
            connected = current.length > 0;
            onConnection(connected);
        }
        frame = connected ? requestAnimationFrame(poll) : 0;
    }

    // The final poll after the last controller leaves releases what it held.
    const wake = () => { if (!frame) frame = requestAnimationFrame(poll); };
    addEventListener('gamepadconnected', wake);
    addEventListener('gamepaddisconnected', wake);
    wake();
}
