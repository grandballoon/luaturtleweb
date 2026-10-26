// gamepad-menu.js
// The controller menu: the reference's commands as a list to step through
// and insert from, small enough to sit in a corner of the canvas while the
// learner builds a program.
//
// It is a stack of pages, each a list of rows, with one row selected. The
// first page lists Recent, Favorites, and the reference's sections; opening
// one pushes its page of commands. Favorites holds the learner's categories,
// each a page of the commands saved to it. Selecting a command inserts it
// with onInsert. A row can have a second action: on a command, saving it to
// a favorites category (or taking it out), and on a category, renaming or
// deleting it. Those are pages too, so everything is reached the same way.
//
// Owns what the menu shows and where the learner is in it. It never reads a
// controller: its owner (gamepad.js) calls move, select, alt, back, sibling,
// and show, and says which button does each with glyph(), for the hints
// under the list. Rows can be clicked as well. The commands come from the
// catalog, and the lists from recent-commands.js and favorites.js.
//
// The menu never takes focus from the editor, so the caret stays where an
// insert will land. The one exception is typing a category's name.

const ICON_OPEN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const STAR_ICON = `${ICON_OPEN}<path d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.8-4.6 6.6-1z"/></svg>`;
const EDIT_ICON = `${ICON_OPEN}<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;

// catalog: [{ title, commands: [{ call }] }], from command-catalog.js.
// glyph(action): the label of the button that does 'select', 'save' (a
//   row's second action), or 'back', or null if no button does.
// onInsert(call): put a command in the editor.
// onMapping(): the learner asked for the controller mapping.
// onToggle(open): the menu opened or closed.
// onRefocus(): the name field is done with the keyboard.
export function initGamepadMenu({ menu, catalog, recents, favorites, glyph, onInsert, onMapping, onToggle, onRefocus }) {
    const title   = menu.querySelector('#gamepad-menu-title');
    const backBtn = menu.querySelector('#gamepad-menu-back');
    const list    = menu.querySelector('#gamepad-menu-rows');
    const empty   = menu.querySelector('#gamepad-menu-empty');
    const form    = menu.querySelector('#gamepad-menu-form');
    const input   = menu.querySelector('#gamepad-menu-input');
    const status  = menu.querySelector('#gamepad-menu-status');
    const hints   = menu.querySelector('#gamepad-menu-hints');

    let shown = false;
    let stack = [];      // [{ page, key, index, from }], the first page first
    let rows  = [];      // the top page's rows, as last rendered
    let typing = null;   // the stack entry whose name field is showing

    const top = () => stack[stack.length - 1];

    // from: the key of the row that opened the page, on the page below.
    function push(page, from) {
        stack.push({ page, key: null, index: 0, from });
    }

    function pop(count = 1) {
        stack.length = Math.max(1, stack.length - count);
    }

    // Read out by screen readers; the editor and the rows show it otherwise.
    function announce(text) {
        status.textContent = text;
    }

    // ---- Pages ----
    //
    // A page is { title(), rows(), empty, input, transient }:
    //   empty      what to say when it has no rows
    //   input      { label, value(), commit(text) }: a page that asks for text
    //   transient  a step in doing something, not a place to come back to
    // A row is { key, kind, label, detail, hint, saved, alt } with either
    // select() or open(), which returns the page the row leads to. hint
    // names what selecting it does. alt is { icon, label, hint, run() }.

    const groupRow = (key, label, count, open, alt) => (
        { key, kind: 'group', label, detail: String(count), hint: 'Open', open, alt }
    );

    const commandRow = (call) => ({
        key: call,
        kind: 'command',
        label: call,
        hint: 'Insert',
        saved: favorites.includes(call),
        select() {
            onInsert(call);
            announce(`Inserted ${call}`);
        },
        alt: { icon: STAR_ICON, label: `Save ${call} to favorites`, hint: 'Save', run: () => push(savePage(call)) },
    });

    const rootPage = {
        title: () => 'Commands',
        rows: () => [
            groupRow('recent', 'Recent', recents.list().length, () => recentPage),
            groupRow('favorites', 'Favorites', favorites.count(), () => favoritesPage),
            ...catalog.map((section) => groupRow(
                `section:${section.title}`, section.title, section.commands.length, () => sectionPage(section),
            )),
        ],
    };

    const recentPage = {
        title: () => 'Recent',
        empty: 'Commands you insert show up here.',
        rows: () => recents.list().map(commandRow),
    };

    const sectionPage = (section) => ({
        title: () => section.title,
        rows: () => section.commands.map((command) => commandRow(command.call)),
    });

    const favoritesPage = {
        title: () => 'Favorites',
        rows: () => [
            ...favorites.categories().map((c) => groupRow(
                `category:${c.id}`, c.name, c.commands.length, () => categoryPage(c.id),
                { icon: EDIT_ICON, label: `Rename or delete ${c.name}`, hint: 'Edit', run: () => push(editPage(c.id)) },
            )),
            {
                key: 'new',
                kind: 'action',
                label: 'New category',
                hint: 'Create',
                select() {
                    const added = favorites.addCategory();
                    top().key = `category:${added.id}`;
                    announce(`Created ${added.name}`);
                },
            },
        ],
    };

    const categoryName = (id) => favorites.category(id)?.name ?? '';

    const categoryPage = (id) => ({
        title: () => categoryName(id),
        empty: 'Nothing saved here yet. Save a command from any list to add it.',
        rows: () => (favorites.category(id)?.commands ?? []).map(commandRow),
    });

    // Lists every category; selecting one saves the command there, or takes
    // it out if it's there already.
    const savePage = (call) => ({
        transient: true,
        title: () => `Save ${call}`,
        rows: () => [
            ...favorites.categories().map((c) => {
                const saved = c.commands.includes(call);
                return {
                    key: `category:${c.id}`,
                    kind: 'action',
                    label: c.name,
                    detail: saved ? 'Saved' : '',
                    hint: saved ? 'Remove' : 'Save',
                    saved,
                    select() {
                        favorites.toggle(c.id, call);
                        announce(saved ? `Removed ${call} from ${c.name}` : `Saved ${call} to ${c.name}`);
                        pop();
                    },
                };
            }),
            {
                key: 'new',
                kind: 'action',
                label: 'New category',
                hint: 'Save',
                select() {
                    const added = favorites.addCategory();
                    favorites.toggle(added.id, call);
                    announce(`Saved ${call} to ${added.name}`);
                    pop();
                },
            },
        ],
    });

    const editPage = (id) => ({
        transient: true,
        title: () => categoryName(id),
        rows: () => [
            { key: 'rename', kind: 'action', label: 'Rename', hint: 'Rename', select: () => push(renamePage(id)) },
            { key: 'delete', kind: 'action', label: 'Delete', hint: 'Delete', select: () => push(deletePage(id)) },
        ],
    });

    // Both end back on the Favorites page, past the edit page they came from.
    const renamePage = (id) => ({
        transient: true,
        title: () => 'Rename category',
        empty: 'Type a name, then press Enter.',
        rows: () => [],
        input: {
            label: 'Category name',
            value: () => categoryName(id),
            commit(text) {
                favorites.rename(id, text);
                announce(`Renamed to ${categoryName(id)}`);
                pop(2);
            },
        },
    });

    const deletePage = (id) => ({
        transient: true,
        title: () => `Delete ${categoryName(id)}?`,
        rows: () => [
            { key: 'keep', kind: 'action', label: 'Keep it', hint: 'Keep', select: () => pop() },
            {
                key: 'delete',
                kind: 'danger',
                label: 'Delete it',
                hint: 'Delete',
                select() {
                    announce(`Deleted ${categoryName(id)}`);
                    favorites.removeCategory(id);
                    pop(2);
                },
            },
        ],
    });

    // ---- Rendering ----

    // Runs a row's action with that row selected.
    function act(row, action) {
        top().key = row.key;
        action();
        render();
    }

    const activate = (row) => (row.open ? push(row.open(), row.key) : row.select());

    function rowElement(row, selected) {
        const li = document.createElement('li');
        li.className = `pad-row pad-row-${row.kind}`;
        li.classList.toggle('selected', selected);
        li.classList.toggle('saved', !!row.saved);

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'pad-row-main';
        const label = document.createElement('span');
        label.className = 'pad-row-label';
        label.textContent = row.label;
        main.append(label);
        if (row.detail) {
            const detail = document.createElement('span');
            detail.className = 'pad-row-detail';
            detail.textContent = row.detail;
            main.append(detail);
        }
        main.addEventListener('click', () => act(row, () => activate(row)));
        li.append(main);

        if (row.alt) {
            const alt = document.createElement('button');
            alt.type = 'button';
            alt.className = 'pad-row-alt';
            alt.title = row.alt.label;
            alt.setAttribute('aria-label', row.alt.label);
            alt.innerHTML = row.alt.icon;
            alt.addEventListener('click', () => act(row, row.alt.run));
            li.append(alt);
        }
        return li;
    }

    function hintElement(action, text) {
        const label = glyph(action);
        if (!label) return [];
        const hint = document.createElement('span');
        hint.className = 'pad-hint';
        const badge = document.createElement('span');
        badge.className = 'pad-glyph';
        badge.textContent = label;
        hint.append(badge, text);
        return [hint];
    }

    // Shows the page's name field, or puts it away and gives the keyboard
    // back if it was in use.
    function renderInput(entry) {
        const asking = entry.page.input;
        if (asking && typing !== entry) {
            typing = entry;
            form.hidden = false;
            input.value = asking.value();
            input.setAttribute('aria-label', asking.label);
            input.focus();
            input.select();
        } else if (!asking && typing) {
            const hadFocus = document.activeElement === input;
            typing = null;
            form.hidden = true;
            if (hadFocus) onRefocus();
        }
    }

    function render() {
        const entry = top();
        rows = entry.page.rows();
        // The row selected before, or the one now in its place if it's gone.
        const found = rows.findIndex((row) => row.key === entry.key);
        entry.index = Math.max(0, found === -1 ? Math.min(entry.index, rows.length - 1) : found);
        entry.key = rows[entry.index]?.key ?? null;
        const row = rows[entry.index];

        title.textContent = entry.page.title();
        backBtn.hidden = stack.length === 1;
        list.replaceChildren(...rows.map((r, i) => rowElement(r, i === entry.index)));
        list.hidden = rows.length === 0;
        empty.textContent = entry.page.empty ?? '';
        empty.hidden = rows.length > 0 || !entry.page.empty;
        renderInput(entry);
        hints.replaceChildren(
            ...(row ? hintElement('select', row.hint) : []),
            ...(row?.alt ? hintElement('save', row.alt.hint) : []),
            ...hintElement('back', stack.length > 1 ? 'Back' : 'Close'),
        );
        list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }

    // ---- What the owner calls ----

    const isOpen = () => shown;

    function open() {
        if (!shown) {
            shown = true;
            menu.hidden = false;
            onToggle(true);
        }
        render();
    }

    // Steps left half done are dropped, so it reopens on a list.
    function close() {
        if (!shown) return;
        while (top().page.transient) pop();
        render();
        shown = false;
        menu.hidden = true;
        onToggle(false);
    }

    const toggle = () => (shown ? close() : open());

    function move(direction) {
        if (!rows.length) return;
        const entry = top();
        entry.index = Math.min(rows.length - 1, Math.max(0, entry.index + direction));
        entry.key = rows[entry.index].key;
        render();
    }

    function select() {
        const row = rows[top().index];
        if (row) act(row, () => activate(row));
    }

    function alt() {
        const row = rows[top().index];
        if (row?.alt) act(row, row.alt.run);
    }

    function back() {
        if (stack.length === 1) return close();
        pop();
        render();
    }

    // Swaps the page for the one before or after it on the page below: the
    // next section, or the next favorites category.
    function sibling(direction) {
        if (stack.length < 2) return;
        const parent = stack[stack.length - 2];
        const groups = parent.page.rows().filter((row) => row.open);
        const index = groups.findIndex((row) => row.key === top().from);
        const next = groups[index + direction];
        if (index === -1 || !next) return;
        pop();
        parent.key = next.key;
        push(next.open(), next.key);
        render();
    }

    // Opens the menu on the first page's row called key: 'recent' or 'favorites'.
    function show(key) {
        const row = rootPage.rows().find((r) => r.key === key);
        stack = [{ page: rootPage, key, index: 0 }];
        push(row.open(), key);
        open();
    }

    // Keeps focus in the editor through a click on the menu.
    menu.addEventListener('mousedown', (e) => {
        if (e.target !== input) e.preventDefault();
    });
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        top().page.input?.commit(input.value);
        render();
    });
    // Esc cancels the name, and stops there rather than also stopping a run.
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        back();
    });
    backBtn.addEventListener('click', back);
    menu.querySelector('#gamepad-menu-mapping').addEventListener('click', onMapping);
    menu.querySelector('#gamepad-menu-close').addEventListener('click', close);

    push(rootPage);

    // refresh: something the menu shows changed outside it (the mapping).
    return { isOpen, open, close, toggle, move, select, alt, back, sibling, show, refresh: () => { if (shown) render(); } };
}
