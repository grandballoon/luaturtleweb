// gamepad-controller.js
// Working the app with a game controller: inserting commands from a menu,
// keeping favorites and recently used commands, running the program, and
// choosing which button does what.
//
// Owns the functions a button can be mapped to and sends each press to the
// one its button is mapped to. Everything else is delegated:
//   gamepad-input.js     reads the controller
//   gamepad-layout.js    names its buttons and draws it
//   gamepad-bindings.js  which function each button is mapped to
//   gamepad-menu.js      the menu of commands
//   gamepad-mapping.js   the view that shows and changes the mapping
//   recent-commands.js, favorites.js   the menu's two lists of the learner's own
//
// A function is { id, label, group, run }. Every command in the catalog is
// one too (inserting it), so a button can be mapped to a command directly.
//   repeats    it runs again and again while its button is held
//   needsMenu  it works the menu, so with the menu closed it opens it instead
//   code       its label is Lua
//
// While the mapping view is open, presses go to it rather than to functions.

import { initGamepadInput }      from './gamepad-input.js';
import { XBOX_360 }              from './gamepad-layout.js';
import { createGamepadBindings } from './gamepad-bindings.js';
import { initGamepadMenu }       from './gamepad-menu.js';
import { initGamepadMapping }    from './gamepad-mapping.js';
import { createRecentCommands }  from './recent-commands.js';
import { createFavorites }       from './favorites.js';

// Function ids by button index, until the learner changes them.
const DEFAULTS = {
    0: 'select',            // A
    1: 'back',              // B
    2: 'undo',              // X
    3: 'save',              // Y
    4: 'recent',            // LB
    5: 'favorites',         // RB
    6: 'stop',              // LT
    7: 'run',               // RT
    8: 'mapping',           // Back
    9: 'menu',              // Start
    12: 'up',
    13: 'down',
    14: 'previous-group',   // d-pad left
    15: 'next-group',       // d-pad right
};

// els: { menu, chip, chipGlyph, mapping }, the menu, the button that opens
//   it, the badge on that button, and the mapping view.
// catalog: [{ title, commands: [{ call }] }], from command-catalog.js.
// onInsert(call), onRun(), onStop(), onUndo(), onRedo(): the app's actions.
// onMenuToggle(open): the menu opened or closed.
// onRefocus(): give the keyboard back to the editor.
export function initGamepad({ els, catalog, onInsert, onRun, onStop, onUndo, onRedo, onMenuToggle, onRefocus }) {
    const layout = XBOX_360;
    const calls = new Set(catalog.flatMap((section) => section.commands.map((command) => command.call)));
    const isCommand = (call) => calls.has(call);

    const recents = createRecentCommands({ isKnown: isCommand });
    const favorites = createFavorites({ isKnown: isCommand });

    function insert(call) {
        onInsert(call);
        recents.add(call);
    }

    // Made further down: they are given the functions, which call them.
    let menu, mapping;

    const menuFunction = (id, label, run, repeats = false) => ({ id, label, group: 'Menu', run, repeats, needsMenu: true });
    const functions = [
        { id: 'menu', label: 'Open or close the menu', group: 'Menu', run: () => menu.toggle() },
        menuFunction('up', 'Move up', () => menu.move(-1), true),
        menuFunction('down', 'Move down', () => menu.move(1), true),
        menuFunction('select', 'Select', () => menu.select()),
        menuFunction('back', 'Back', () => menu.back()),
        menuFunction('previous-group', 'Previous group', () => menu.sibling(-1)),
        menuFunction('next-group', 'Next group', () => menu.sibling(1)),
        menuFunction('save', 'Save to favorites', () => menu.alt()),
        { id: 'recent', label: 'Show recent', group: 'Menu', run: () => menu.show('recent') },
        { id: 'favorites', label: 'Show favorites', group: 'Menu', run: () => menu.show('favorites') },
        { id: 'mapping', label: 'Controller mapping', group: 'Menu', run: () => mapping.open() },
        { id: 'run', label: 'Run the program', group: 'Program', run: onRun },
        { id: 'stop', label: 'Stop the program', group: 'Program', run: onStop },
        { id: 'undo', label: 'Undo', group: 'Program', run: onUndo, repeats: true },
        { id: 'redo', label: 'Redo', group: 'Program', run: onRedo, repeats: true },
        ...catalog.flatMap((section) => section.commands.map(({ call }) => ({
            id: `insert:${call}`,
            label: call,
            group: `Insert · ${section.title}`,
            code: true,
            // The menu's Recent page may be showing.
            run: () => { insert(call); menu.refresh(); },
        }))),
    ];
    const byId = new Map(functions.map((fn) => [fn.id, fn]));

    const bindings = createGamepadBindings({
        buttons: layout.buttons.map((b) => b.index),
        defaults: DEFAULTS,
        isKnown: (id) => byId.has(id),
    });

    // The label of the button mapped to a function, or null.
    function glyph(id) {
        const button = bindings.buttonFor(id);
        return button === null ? null : layout.buttons.find((b) => b.index === button).glyph;
    }

    // The button that opens the menu shows while the menu is closed, once a
    // controller has turned up.
    let seen = false;
    function updateChip() {
        els.chip.hidden = !seen || menu.isOpen();
        els.chipGlyph.textContent = glyph('menu') ?? '';
    }

    menu = initGamepadMenu({
        menu: els.menu,
        catalog,
        recents,
        favorites,
        glyph,
        onInsert: insert,
        onMapping: () => mapping.open(),
        onToggle(open) {
            updateChip();
            onMenuToggle(open);
        },
        onRefocus,
    });

    mapping = initGamepadMapping({
        overlay: els.mapping,
        layout,
        bindings,
        functions,
        onChange() {
            updateChip();
            menu.refresh();
        },
        onRefocus,
    });

    initGamepadInput({
        onPress(button, repeat) {
            if (mapping.isOpen()) return mapping.press(button, repeat);
            const fn = byId.get(bindings.get(button));
            if (!fn || (repeat && !fn.repeats)) return;
            if (fn.needsMenu && !menu.isOpen()) return menu.open();
            fn.run();
        },
        onRelease: (button) => mapping.release(button),
        onConnection(connected) {
            seen ||= connected;
            updateChip();
        },
    });

    els.chip.addEventListener('mousedown', (e) => e.preventDefault());   // focus stays in the editor
    els.chip.addEventListener('click', () => menu.open());
    updateChip();

    return {
        isMappingOpen: () => mapping.isOpen(),
        closeMapping:  () => mapping.close(),
    };
}
