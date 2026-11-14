// input-events.js
// Pure decisions about the program's input on the main thread: which keys
// it gets and by what name, and which pointer presses are its rather than
// the canvas's pan gesture. program-input.js listens and acts on these;
// test/input_test.mjs checks them by equality.
//
// `ui` is the latest layout a running program sent (turtle/ui.lua via
// host.ui()): { widgets: [{ x, y, w, h, kind, ... }], pointer, keys, active },
// in turtle pixels: (0, 0) at the canvas's center, y up, a box spanning
// x..x+w and y-h..y.

// KeyboardEvent.key → the name turtle/ui.lua uses, or null for a key the
// program never gets. Tab moves focus off the canvas and Escape stops the
// run, so neither is the program's; nor are lone modifiers it can't use.
const NAMES = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    ' ': 'space', Enter: 'return', Backspace: 'backspace', Delete: 'delete',
    Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
    Shift: 'shift', Control: 'ctrl', Alt: 'alt',
};

export function keyName(key) {
    if (key in NAMES) return NAMES[key];
    if ([...key].length === 1) return key.toLowerCase();
    if (/^F([1-9]|1[0-2])$/.test(key)) return key.toLowerCase();
    return null;
}

// The character a key types, or null: one character, never a named key.
export function keyText(key) {
    return [...key].length === 1 ? key : null;
}

// A keydown as the event the program gets, or null if it isn't the
// program's: shortcuts with ⌘ or Ctrl stay the page's.
export function keyEvent(e, type) {
    if (e.metaKey || e.ctrlKey || e.isComposing) return null;
    const key = keyName(e.key);
    if (!key) return null;
    return type === 'key' ? { type, key, text: keyText(e.key) } : { type, key };
}

// The widget whose box holds turtle point (x, y), topmost first, or null.
export function widgetAt(ui, x, y) {
    const widgets = ui?.widgets ? Object.values(ui.widgets) : [];
    for (let i = widgets.length - 1; i >= 0; i--) {
        const w = widgets[i];
        if (x >= w.x && x <= w.x + w.w && y <= w.y && y >= w.y - w.h) return w;
    }
    return null;
}

// Whether a press at turtle point (x, y) is the program's, so the canvas
// mustn't pan: it has a click, drag or release handler, or the press is on
// one of its controls.
export function claimsPress(ui, x, y) {
    if (!ui?.active) return false;
    return Boolean(ui.pointer || widgetAt(ui, x, y));
}

// The cursor over turtle point (x, y): a hand over a control, a text bar
// over a text field, an arrow where the program takes clicks, and the
// canvas's own (grab) elsewhere, as ''.
export function cursorAt(ui, x, y) {
    if (!ui?.active) return '';
    const w = widgetAt(ui, x, y);
    if (w) return w.kind === 'textfield' ? 'text' : 'pointer';
    return ui.pointer ? 'default' : '';
}
