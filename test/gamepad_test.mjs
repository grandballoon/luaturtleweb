// test/gamepad_test.mjs
//
// The controller's parts that need no page: reading button presses
// (public/gamepad-input.js), the button mapping (gamepad-bindings.js), and
// the menu's two lists of the learner's own (recent-commands.js and
// favorites.js), including what each restores from a previous visit.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/gamepad_test.mjs

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// What the modules save between visits. Cleared before each test.
const saved = new Map();
globalThis.localStorage = {
    getItem: (key) => (saved.has(key) ? saved.get(key) : null),
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: (key) => saved.delete(key),
};
beforeEach(() => saved.clear());

const { createGamepadReader }   = await import('../public/gamepad-input.js');
const { createGamepadBindings } = await import('../public/gamepad-bindings.js');
const { createRecentCommands }  = await import('../public/recent-commands.js');
const { createFavorites }       = await import('../public/favorites.js');
const { XBOX_360 }              = await import('../public/gamepad-layout.js');

// A Gamepad with the buttons in down held (an index, or [index, value] for
// an analog one) and the left stick at stick.
function pad({ index = 0, down = [], stick = [0, 0] } = {}) {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    for (const entry of down) {
        const [button, value] = Array.isArray(entry) ? entry : [entry, 1];
        buttons[button] = { pressed: value === 1, value };
    }
    return { index, buttons, axes: [...stick, 0, 0] };
}

const press   = (button, repeat = false) => ({ type: 'press', button, repeat });
const release = (button) => ({ type: 'release', button });

// A reader that has already seen an idle controller, so presses count.
function awakeReader() {
    const read = createGamepadReader();
    read([pad()], 0);
    return read;
}

// ---- gamepad-input.js ----

test('a button reports one press when it goes down and a release when it comes up', () => {
    const read = awakeReader();
    assert.deepEqual(read([pad({ down: [0] })], 16), [press(0)]);
    assert.deepEqual(read([pad({ down: [0] })], 32), []);
    assert.deepEqual(read([pad()], 48), [release(0)]);
});

test('a held button repeats after a delay, then at a steady rate', () => {
    const read = awakeReader();
    read([pad({ down: [13] })], 1000);
    assert.deepEqual(read([pad({ down: [13] })], 1399), []);
    assert.deepEqual(read([pad({ down: [13] })], 1400), [press(13, true)]);
    assert.deepEqual(read([pad({ down: [13] })], 1509), []);
    assert.deepEqual(read([pad({ down: [13] })], 1510), [press(13, true)]);
});

test('what is down when a controller first shows up is ignored until released', () => {
    const read = createGamepadReader();
    assert.deepEqual(read([pad({ down: [9] })], 0), []);
    assert.deepEqual(read([pad({ down: [9, 0] })], 16), [press(0)]);
    assert.deepEqual(read([pad({ down: [0] })], 32), []);
    assert.deepEqual(read([pad({ down: [0, 9] })], 48), [press(9)]);
});

test('an analog trigger counts as pressed past halfway', () => {
    const read = awakeReader();
    assert.deepEqual(read([pad({ down: [[7, 0.4]] })], 16), []);
    assert.deepEqual(read([pad({ down: [[7, 0.6]] })], 32), [press(7)]);
});

test('the left stick presses the d-pad button in its direction', () => {
    const read = awakeReader();
    assert.deepEqual(read([pad({ stick: [0, -1] })], 16), [press(12)]);
    assert.deepEqual(read([pad({ stick: [0, 0] })], 32), [release(12)]);
    assert.deepEqual(read([pad({ stick: [0, 1] })], 48), [press(13)]);
    assert.deepEqual(read([pad({ stick: [-1, 0] })], 64), [release(13), press(14)]);
    assert.deepEqual(read([pad({ stick: [1, 0] })], 80), [release(14), press(15)]);
});

test('a stick near a diagonal keeps the direction it already has', () => {
    const read = awakeReader();
    assert.deepEqual(read([pad({ stick: [0.1, -0.9] })], 16), [press(12)]);
    assert.deepEqual(read([pad({ stick: [0.8, -0.7] })], 32), []);
    assert.deepEqual(read([pad({ stick: [0.9, -0.5] })], 48), [release(12), press(15)]);
});

test('a stick lets go lower than it presses', () => {
    const read = awakeReader();
    assert.deepEqual(read([pad({ stick: [0, 0.5] })], 16), []);
    assert.deepEqual(read([pad({ stick: [0, 0.7] })], 32), [press(13)]);
    assert.deepEqual(read([pad({ stick: [0, 0.5] })], 48), []);
    assert.deepEqual(read([pad({ stick: [0, 0.3] })], 64), [release(13)]);
});

test('every controller is read as one', () => {
    const read = createGamepadReader();
    read([pad({ index: 0 }), pad({ index: 1 })], 0);
    assert.deepEqual(read([pad({ index: 0, down: [0] }), pad({ index: 1 })], 16), [press(0)]);
    assert.deepEqual(read([pad({ index: 0, down: [0] }), pad({ index: 1, down: [0, 1] })], 32), [press(1)]);
    assert.deepEqual(read([pad({ index: 0 }), pad({ index: 1, down: [0, 1] })], 48), []);
});

test('a controller that leaves releases what it held', () => {
    const read = awakeReader();
    read([pad({ down: [0] })], 16);
    assert.deepEqual(read([], 32), [release(0)]);
    // Back again, it is new: what it holds is ignored once more.
    assert.deepEqual(read([pad({ down: [0] })], 48), []);
});

// ---- gamepad-layout.js ----

test('the layout names sixteen different buttons, and its nav buttons are among them', () => {
    const indices = XBOX_360.buttons.map((b) => b.index);
    assert.deepEqual(indices, [...Array(16).keys()]);
    assert.equal(new Set(XBOX_360.buttons.map((b) => b.glyph)).size, 16);
    for (const button of Object.values(XBOX_360.nav)) assert.ok(indices.includes(button));
});

// ---- gamepad-bindings.js ----

const bindingOptions = {
    buttons: [0, 1, 2],
    defaults: { 0: 'select', 1: 'back' },
    isKnown: (id) => ['select', 'back', 'run'].includes(id),
};

test('buttons start on their defaults, and the rest do nothing', () => {
    const bindings = createGamepadBindings(bindingOptions);
    assert.equal(bindings.get(0), 'select');
    assert.equal(bindings.get(2), null);
    assert.equal(bindings.buttonFor('back'), 1);
    assert.equal(bindings.buttonFor('run'), null);
});

test('a changed mapping is there on the next visit', () => {
    const bindings = createGamepadBindings(bindingOptions);
    bindings.set(2, 'run');
    bindings.set(0, null);
    const next = createGamepadBindings(bindingOptions);
    assert.equal(next.get(2), 'run');
    assert.equal(next.get(0), null);
    assert.equal(next.get(1), 'back');
});

test('a button outside the layout cannot be mapped', () => {
    const bindings = createGamepadBindings(bindingOptions);
    bindings.set(16, 'run');
    assert.equal(bindings.get(16), null);
    assert.equal(bindings.buttonFor('run'), null);
});

test('a saved function that no longer exists leaves its button doing nothing', () => {
    saved.set('luaturtle-gamepad-bindings', JSON.stringify({ 0: 'gone', 1: 'run' }));
    const bindings = createGamepadBindings(bindingOptions);
    assert.equal(bindings.get(0), null);
    assert.equal(bindings.get(1), 'run');
    assert.equal(bindings.get(2), null);
});

test('an unreadable saved mapping falls back to the defaults', () => {
    for (const junk of ['not json', '"text"', '7', 'null']) {
        saved.set('luaturtle-gamepad-bindings', junk);
        assert.equal(createGamepadBindings(bindingOptions).get(0), 'select', junk);
    }
});

test('reset puts back the defaults, for this visit and the next', () => {
    const bindings = createGamepadBindings(bindingOptions);
    bindings.set(0, 'run');
    bindings.reset();
    assert.equal(bindings.get(0), 'select');
    assert.equal(createGamepadBindings(bindingOptions).get(0), 'select');
});

// ---- recent-commands.js ----

const isKnown = (call) => call !== 'gone()';

test('recent commands are the last five, newest first, each once', () => {
    const recents = createRecentCommands({ isKnown });
    for (const call of ['a()', 'b()', 'c()', 'd()', 'e()', 'f()', 'c()']) recents.add(call);
    assert.deepEqual(recents.list(), ['c()', 'f()', 'e()', 'd()', 'b()']);
});

test('recent commands are there on the next visit, without ones that no longer exist', () => {
    const recents = createRecentCommands({ isKnown });
    recents.add('gone()');
    recents.add('a()');
    assert.deepEqual(createRecentCommands({ isKnown }).list(), ['a()']);
});

test('unreadable saved recent commands start the list empty', () => {
    for (const junk of ['not json', '{"a":1}', '7']) {
        saved.set('luaturtle-recent-commands', junk);
        assert.deepEqual(createRecentCommands({ isKnown }).list(), [], junk);
    }
});

// ---- favorites.js ----

test('new categories are numbered, reusing a number that is free', () => {
    const favorites = createFavorites({ isKnown });
    const first = favorites.addCategory();
    const second = favorites.addCategory();
    assert.deepEqual([first.name, second.name], ['Category 1', 'Category 2']);
    favorites.removeCategory(first.id);
    const third = favorites.addCategory();
    assert.equal(third.name, 'Category 1');
    assert.notEqual(third.id, second.id);
});

test('a command is saved to a category and taken back out', () => {
    const favorites = createFavorites({ isKnown });
    const shapes = favorites.addCategory();
    const moves = favorites.addCategory();
    assert.equal(favorites.toggle(shapes.id, 'a()'), true);
    assert.equal(favorites.toggle(moves.id, 'a()'), true);
    assert.equal(favorites.toggle(moves.id, 'b()'), true);
    assert.equal(favorites.count(), 2);
    assert.equal(favorites.includes('a()'), true);
    assert.equal(favorites.toggle(shapes.id, 'a()'), false);
    assert.deepEqual(favorites.category(shapes.id).commands, []);
    assert.equal(favorites.includes('a()'), true);
    assert.equal(favorites.toggle(99, 'a()'), false);
});

test('a category is renamed, but not to nothing', () => {
    const favorites = createFavorites({ isKnown });
    const { id } = favorites.addCategory();
    favorites.rename(id, '  Shapes  ');
    assert.equal(favorites.category(id).name, 'Shapes');
    favorites.rename(id, '   ');
    assert.equal(favorites.category(id).name, 'Shapes');
    favorites.rename(id, 'x'.repeat(60));
    assert.equal(favorites.category(id).name.length, 40);
});

test('favorites are there on the next visit, without commands that no longer exist', () => {
    const favorites = createFavorites({ isKnown });
    const { id } = favorites.addCategory();
    favorites.rename(id, 'Shapes');
    favorites.toggle(id, 'a()');
    favorites.toggle(id, 'gone()');
    const next = createFavorites({ isKnown });
    assert.deepEqual(next.categories(), [{ id, name: 'Shapes', commands: ['a()'] }]);
});

test('unreadable saved favorites keep only the well-formed categories', () => {
    saved.set('luaturtle-favorites', JSON.stringify([
        { id: 1, name: 'Kept', commands: ['a()', 'a()'] },
        { id: 1, name: 'Same id', commands: [] },
        { id: 'two', name: 'Bad id', commands: [] },
        { id: 3, commands: [] },
        { id: 4, name: 'No list' },
        null,
    ]));
    assert.deepEqual(createFavorites({ isKnown }).categories(), [{ id: 1, name: 'Kept', commands: ['a()'] }]);
    saved.set('luaturtle-favorites', 'not json');
    assert.deepEqual(createFavorites({ isKnown }).categories(), []);
});
