// recent-commands.js
// The commands inserted most recently, newest first, each listed once.
// Remembered between visits.
//
// Owns only the list. Its owner says which commands exist (isKnown), so a
// saved command the reference no longer lists is dropped, and calls add()
// when one is inserted.

import * as storage from './storage.js';

const KEY   = 'luaturtle-recent-commands';
const LIMIT = 5;

export function createRecentCommands({ isKnown }) {
    const saved = storage.loadJSON(KEY, []);
    let calls = (Array.isArray(saved) ? saved : []).filter(isKnown).slice(0, LIMIT);

    return {
        list: () => [...calls],
        add(call) {
            calls = [call, ...calls.filter((c) => c !== call)].slice(0, LIMIT);
            storage.saveJSON(KEY, calls);
        },
    };
}
