// gamepad-bindings.js
// Which function each controller button is mapped to. Remembered between
// visits.
//
// Owns only the mapping: button index → function id, or null for a button
// that does nothing. What the ids mean is up to the owner (gamepad.js),
// which supplies the buttons, the default mapping, and isKnown: a saved id
// that no longer names a function leaves its button doing nothing.

import * as storage from './storage.js';

const KEY = 'luaturtle-gamepad-bindings';

// buttons: the button indices that can be mapped.
// defaults: { [button]: id } for the ones mapped until the learner changes them.
export function createGamepadBindings({ buttons, defaults, isKnown }) {
    const initial = () => new Map(buttons.map((button) => [button, defaults[button] ?? null]));

    // A button the saved mapping doesn't mention (one added since) gets its
    // default; one it maps to null was unmapped on purpose.
    function restore() {
        const map = initial();
        const saved = storage.loadJSON(KEY);
        if (saved === null || typeof saved !== 'object') return map;
        for (const button of buttons) {
            if (!Object.hasOwn(saved, button)) continue;
            map.set(button, isKnown(saved[button]) ? saved[button] : null);
        }
        return map;
    }

    let map = restore();

    return {
        get: (button) => map.get(button) ?? null,

        // The first button mapped to id, or null.
        buttonFor(id) {
            for (const [button, bound] of map) if (bound === id) return button;
            return null;
        },

        set(button, id) {
            if (!map.has(button)) return;
            map.set(button, id);
            storage.saveJSON(KEY, Object.fromEntries(map));
        },

        reset() {
            map = initial();
            storage.remove(KEY);
        },
    };
}
