// favorites.js
// Commands the learner saved, sorted into categories they make. A command
// can be in several categories. Remembered between visits.
//
// Owns only the categories: [{ id, name, commands: [call] }], in the order
// they were made, each command list in the order saved. Its owner says which
// commands exist (isKnown), so a saved command the reference no longer lists
// is dropped.

import * as storage from './storage.js';

const KEY      = 'luaturtle-favorites';
const NAME_MAX = 40;

// What was saved, keeping only what is well formed.
function restore(saved, isKnown) {
    if (!Array.isArray(saved)) return [];
    const ids = new Set();
    return saved.flatMap((c) => {
        if (!Number.isInteger(c?.id) || ids.has(c.id) || typeof c.name !== 'string' || !Array.isArray(c.commands)) return [];
        ids.add(c.id);
        return [{ id: c.id, name: c.name, commands: [...new Set(c.commands)].filter(isKnown) }];
    });
}

export function createFavorites({ isKnown }) {
    const categories = restore(storage.loadJSON(KEY), isKnown);

    const save = () => storage.saveJSON(KEY, categories);
    const category = (id) => categories.find((c) => c.id === id) ?? null;

    // "Category 1", or the first number no category is using.
    function newName() {
        const names = new Set(categories.map((c) => c.name));
        let n = 1;
        while (names.has(`Category ${n}`)) n++;
        return `Category ${n}`;
    }

    return {
        categories: () => categories,
        category,

        // How many different commands are saved, in any category.
        count: () => new Set(categories.flatMap((c) => c.commands)).size,
        includes: (call) => categories.some((c) => c.commands.includes(call)),

        addCategory() {
            const id = Math.max(0, ...categories.map((c) => c.id)) + 1;
            const added = { id, name: newName(), commands: [] };
            categories.push(added);
            save();
            return added;
        },

        // A blank name leaves the category's name as it was.
        rename(id, name) {
            const c = category(id);
            const trimmed = name.trim().slice(0, NAME_MAX);
            if (!c || !trimmed) return;
            c.name = trimmed;
            save();
        },

        removeCategory(id) {
            const index = categories.findIndex((c) => c.id === id);
            if (index === -1) return;
            categories.splice(index, 1);
            save();
        },

        // Saves call to the category, or takes it back out if it's there.
        // Returns whether it is saved there now.
        toggle(id, call) {
            const c = category(id);
            if (!c) return false;
            const index = c.commands.indexOf(call);
            if (index === -1) c.commands.push(call);
            else c.commands.splice(index, 1);
            save();
            return index === -1;
        },
    };
}
