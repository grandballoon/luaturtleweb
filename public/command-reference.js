// command-reference.js
// The searchable command reference: a list of command signatures, and a
// detail pane for the selected one.
//
// Where it shows is up to a host (command-placement.js): over the canvas,
// in a tab of the terminal panel, or in a floating window. Buttons in its
// header, one per other place, ask the owner to move it (onMove, with the
// button's data-placement), and the owner hands over the new host with
// setHost, whose name goes in the overlay's data-placement for the
// stylesheet;
// the reference keeps its query and selection through the move. A host can
// also show or hide it on its own (the learner switching tabs), which
// counts as opening or closing it, except that hiding it only takes focus
// back to the editor if focus was inside it.
//
// Opening it focuses the search bar with an empty query, so a learner can
// press the shortcut and start typing. While it's open, typing anywhere but
// an editable field (the editor, say) goes to the search bar too, so
// clicking or arrowing through the rows never strands the learner's typing. The query filters rows by their
// signature and description; sections with no matching rows hide entirely.
// Closing it always hands focus to onClose (the editor, at its last caret).
//
// One row is always selected while any match: the first match, until the
// learner picks another. ↑ and ↓ select a row instead of moving the search
// bar's caret, Shift+↑/↓ jumps to the first row of the previous or next
// section, and a click selects the row clicked. The detail pane shows the
// selected command's description, its demo program, and preview (a
// command-preview.js player) running the demo. Demos come from the worker
// (turtle/demos.lua) via setDemos, keyed by the row's signature.
//
// Each row has buttons at its right edge that insert its signature with
// onInsert (the editor, on a new line) and copy it. They show only on a row
// the learner picked (clicked or arrowed to), with a hint naming their
// shortcuts, so a pointer passing over the list can't hit them. The insert
// and copy shortcuts press the selected row's buttons, picked or not, so
// both paths show the same checkmark. The demo has the same pair of buttons, acting on the whole demo.
//
// The owner decides where pastes go: once the learner has picked or copied a
// command, a paste inside the overlay goes to onPaste (the editor) rather than
// the search bar, so copy-then-paste works without closing the overlay.

import { highlightLua } from './lua-highlight.js';

const DONE_RESET_MS = 1500;
const ICON_OPEN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ICON_DONE = '<path class="icon-done" d="M20 6 9 17l-5-5"/></svg>';
const COPY_ICON = ICON_OPEN
    + '<g class="icon-idle"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/></g>'
    + ICON_DONE;
// An arrow into a line: into the editor, which is to the canvas's left.
const INSERT_ICON = ICON_OPEN
    + '<g class="icon-idle"><path d="M3 19V5"/><path d="m13 6-6 6 6 6"/><path d="M7 12h14"/></g>'
    + ICON_DONE;

// An icon button that runs action() and, if it reports success, shows a
// checkmark for a moment. reset() drops the checkmark early, for when what
// the button acts on changes. With a tooltip (a word or two), the button
// shows it on hover in the page's tooltip style, and the done label while
// the checkmark is up; without one, it has a native title.
function createActionButton({ kind, label, doneLabel, icon, action, tooltip }) {
    const btn = document.createElement('button');
    btn.className = `api-action api-${kind}`;
    if (!tooltip) btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = icon;

    let resetTimer = null;
    function reset() {
        clearTimeout(resetTimer);
        btn.classList.remove('done');
        btn.setAttribute('aria-label', label);
        if (tooltip) btn.dataset.tooltip = tooltip;
    }
    reset();
    btn.addEventListener('click', async () => {
        if (!await action()) return;
        btn.classList.add('done');
        btn.setAttribute('aria-label', doneLabel);
        if (tooltip) btn.dataset.tooltip = doneLabel.toLowerCase();
        clearTimeout(resetTimer);
        resetTimer = setTimeout(reset, DONE_RESET_MS);
    });
    return { button: btn, reset };
}

// A button that copies text(), then calls onCopied. Where the clipboard is
// blocked, it offers the text in a prompt to copy by hand instead.
function createCopyButton(label, text, onCopied) {
    return createActionButton({
        kind: 'copy', label, doneLabel: 'Copied', icon: COPY_ICON, tooltip: 'copy',
        action: async () => {
            const value = text();
            try {
                await navigator.clipboard.writeText(value);
            } catch {
                window.prompt('Copy this code:', value);
                return false;
            }
            onCopied();
            return true;
        },
    });
}

// A button that hands text() to onInsert.
function createInsertButton(label, text, onInsert) {
    return createActionButton({
        kind: 'insert', label, doneLabel: 'Inserted', icon: INSERT_ICON, tooltip: 'insert',
        action: () => {
            onInsert(text());
            return true;
        },
    });
}

// Insert, then copy: the order everywhere they appear together.
function actionGroup(insert, copy) {
    const group = document.createElement('div');
    group.className = 'api-actions';
    group.append(insert.button, copy.button);
    return group;
}

// A key that types into a text field: a character, or deleting one. Not
// with Ctrl or Cmd, which are shortcuts; Alt (Option) types characters on
// macOS. Space on a button presses it instead.
function isTypingKey(e) {
    if (e.ctrlKey || e.metaKey || e.isComposing) return false;
    if (e.key === ' ' && e.target.closest?.('button, a')) return false;
    return e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete';
}

function isEditable(el) {
    return !!el?.closest?.('input, textarea, select') || !!el?.isContentEditable;
}

// Copy-shortcut presses that belong to the text, not the selected row: a
// highlighted range in the search bar or anywhere on the page.
function hasTextSelection() {
    const el = document.activeElement;
    if (el?.selectionStart != null && el.selectionStart !== el.selectionEnd) return true;
    return !(window.getSelection()?.isCollapsed ?? true);
}

export function initCommandReference({ overlay, button, preview, host: initialHost, shortcut, copyShortcut, insertShortcut, onToggle, onClose, onPaste, onInsert, onMove }) {
    const search      = overlay.querySelector('#api-search');
    const sections    = [...overlay.querySelectorAll('.api-section')];
    const empty       = overlay.querySelector('#api-empty');
    const emptyQuery  = overlay.querySelector('#api-empty-query');
    const list        = overlay.querySelector('#api-list');
    const detail      = overlay.querySelector('#api-detail');
    const detailCall  = overlay.querySelector('#api-detail-call');
    const detailAbout = overlay.querySelector('#api-detail-about');
    const detailDemo  = overlay.querySelector('#api-detail-demo');
    const detailCode  = overlay.querySelector('#api-detail-code');
    const moveButtons = [...overlay.querySelectorAll('.api-move')];

    let selected = null;   // the row <li> shown in the detail pane
    let picked = false;    // the learner picked or copied a command since the query last changed
    let demos = {};        // signature → demo program; empty until the worker is ready
    let shown = false;     // open, in whichever host it lives
    let host = null;       // where it shows: see command-placement.js

    // Each row keeps its signature and description, since its text later
    // includes the buttons and, while selected, the hint.
    for (const row of overlay.querySelectorAll('.api-section li')) {
        const call = row.querySelector('code');
        const text = call.textContent.trim();
        row.dataset.command = text;
        row.dataset.about = row.querySelector('.api-about').textContent.trim();
        call.after(actionGroup(
            createInsertButton(`Insert ${text} into the editor`, () => text, onInsert),
            createCopyButton(`Copy ${text}`, () => text, () => { picked = true; }),
        ));
    }

    let demo = null;   // the demo program in the detail pane
    const demoInsert = createInsertButton('Insert example into the editor', () => demo, onInsert);
    const demoCopy = createCopyButton('Copy example', () => demo, () => { picked = true; });
    const demoActions = actionGroup(demoInsert, demoCopy);
    demoActions.classList.add('api-demo-actions');
    detailDemo.append(demoActions);

    const hint = document.createElement('span');
    hint.id = 'api-copy-hint';
    hint.className = 'api-copy-hint';
    hint.setAttribute('role', 'tooltip');
    hint.innerHTML = `<kbd class="kbd"></kbd> insert · <kbd class="kbd"></kbd> copy`;
    const [insertKey, copyKey] = hint.querySelectorAll('kbd');
    copyKey.textContent = copyShortcut;
    insertKey.textContent = insertShortcut;

    const visibleRows = () => sections
        .filter((section) => !section.hidden)
        .flatMap((section) => [...section.querySelectorAll('li')].filter((row) => !row.hidden));

    const isOpen = () => shown;
    const hasFocus = () => overlay.contains(document.activeElement);

    // Selects row (or nothing, with null) and shows it in the detail pane.
    // The buttons and hint show on a row only once the learner is choosing rows.
    function select(row) {
        if (selected) {
            selected.classList.remove('selected', 'picked');
            selected.querySelector('.api-copy').removeAttribute('aria-describedby');
        }
        hint.remove();
        selected = row;
        showDetail();
        if (!row) return;
        row.classList.add('selected');
        if (picked) {
            row.classList.add('picked');
            const copy = row.querySelector('.api-copy');
            copy.setAttribute('aria-describedby', hint.id);
            row.append(hint);
        }
        row.scrollIntoView({ block: 'nearest' });
    }

    function showDetail() {
        detail.classList.toggle('empty', !selected);
        if (!selected || !isOpen()) return preview.stop();
        const { command, about } = selected.dataset;
        const next = Object.hasOwn(demos, command) ? demos[command] : null;
        if (next !== demo) {
            demoCopy.reset();
            demoInsert.reset();
        }
        demo = next;
        detailCall.textContent = command;
        detailAbout.textContent = about;
        highlightLua(demo ?? '', detailCode);
        detailDemo.hidden = demo === null;
        if (demo === null) preview.stop();
        else preview.show(demo);
    }

    function moveSelection(direction) {
        const rows = visibleRows();
        if (!rows.length) return;
        picked = true;
        const index = rows.indexOf(selected);
        const next = index === -1
            ? (direction > 0 ? 0 : rows.length - 1)
            : Math.min(rows.length - 1, Math.max(0, index + direction));
        select(rows[next]);
    }

    // Selects the first row of the neighbouring section. From no selection, ↓
    // lands on the first section and ↑ on the last.
    function jumpSection(direction) {
        const visible = sections.filter((section) => !section.hidden);
        if (!visible.length) return;
        picked = true;
        const index = visible.indexOf(selected?.closest('.api-section'));
        const next = index === -1
            ? (direction > 0 ? 0 : visible.length - 1)
            : Math.min(visible.length - 1, Math.max(0, index + direction));
        select([...visible[next].querySelectorAll('li')].find((row) => !row.hidden));
    }

    // Shows the rows matching query, and selects the first of them.
    function filter(query) {
        const q = query.trim().toLowerCase();
        picked = false;
        hint.remove();   // first, or its text would match the query
        let anyMatch = false;
        for (const section of sections) {
            let sectionMatch = false;
            for (const row of section.querySelectorAll('li')) {
                const match = !q || row.textContent.toLowerCase().includes(q);
                row.hidden = !match;
                sectionMatch ||= match;
            }
            section.hidden = !sectionMatch;
            anyMatch ||= sectionMatch;
        }
        empty.hidden = anyMatch;
        emptyQuery.textContent = query.trim();
        list.scrollTop = 0;
        select(visibleRows()[0] ?? null);
    }

    // Set before asking the host to show or hide it, so the host's report
    // of the change finds nothing left to do.
    function setShown(open) {
        shown = open;
        button.classList.toggle('active', open);
        button.setAttribute('aria-expanded', String(open));
        onToggle(open);
    }

    function open() {
        if (shown) return search.focus();
        search.value = '';
        setShown(true);
        host.show(overlay);
        filter('');
        search.focus();
    }

    function close() {
        setShown(false);
        host.hide(overlay);
        select(null);
        onClose();
    }

    // The host showed or hid it without being asked.
    function hostChanged(visible) {
        if (visible === shown) return;
        if (visible) return open();
        const hadFocus = hasFocus();
        setShown(false);
        select(null);
        if (hadFocus) onClose();
    }

    // Moves it into next, open or closed as it was. The move takes focus
    // out of the page, so it goes to the button that moves it back.
    function setHost(next) {
        const refocus = hasFocus();
        const previous = host;
        previous?.detach(overlay);
        host = next;
        overlay.dataset.placement = next.name;
        host.attach(overlay, hostChanged);
        if (!shown) return;
        host.show(overlay);
        if (refocus) moveButtons.find((b) => b.dataset.placement === previous.name)?.focus();
    }

    const toggle = () => (isOpen() ? close() : open());

    search.addEventListener('input', () => filter(search.value));
    list.addEventListener('click', (e) => {
        const row = e.target.closest('.api-section li');
        if (!row || (row === selected && picked)) return;
        picked = true;
        select(row);
    });
    // A paste into the search bar while the learner is still typing a query
    // stays there; any other paste in the overlay is meant for the editor.
    overlay.addEventListener('paste', (e) => {
        if (e.target === search && !picked) return;
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;
        e.preventDefault();
        onPaste(text);
    });
    // Focusing the search bar during keydown sends the key's character (or
    // deletion) to it, in every browser. The caret goes to the end, so the
    // key extends the query.
    document.addEventListener('keydown', (e) => {
        if (!shown || e.defaultPrevented || !isTypingKey(e) || isEditable(e.target)) return;
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
    });
    overlay.addEventListener('keydown', (e) => {
        if (e.altKey) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.shiftKey && e.key.toLowerCase() === 'c') {
            if (!selected || hasTextSelection()) return;
            e.preventDefault();
            selected.querySelector('.api-copy').click();
            return;
        }
        // Always claimed inside the overlay, so a press with no selection
        // doesn't fall through to the browser (Firefox opens Page Info).
        if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            selected?.querySelector('.api-insert').click();
            return;
        }
        const direction = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (mod || !direction) return;
        e.preventDefault();
        if (e.shiftKey) jumpSection(direction);
        else moveSelection(direction);
    });
    button.addEventListener('click', toggle);
    overlay.querySelector('#api-close').addEventListener('click', close);
    for (const b of moveButtons) b.addEventListener('click', () => onMove(b.dataset.placement));
    setHost(initialHost);
    button.title = `Command reference (${shortcut})`;

    // demos: signature → demo program, from the worker's ready message.
    function setDemos(next) {
        demos = next || {};
        showDetail();
    }

    return { isOpen, hasFocus, open, close, toggle, setHost, setDemos };
}
