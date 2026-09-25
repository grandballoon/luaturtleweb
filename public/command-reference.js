// command-reference.js
// The searchable command-reference overlay over the canvas.
//
// Opening it focuses the search bar with an empty query, so a learner can
// press the shortcut and start typing. The query filters rows by their
// signature and description; sections with no matching rows hide entirely.
// Closing it always hands focus to onClose (the editor, at its last caret).
// While focus is inside it, ↑ and ↓ select a row instead of moving the search
// bar's caret, and Shift+↑/↓ jumps to the first row of the previous or next
// section. The selected row shows a hint: the copy shortcut presses its copy
// button (so both paths show the same checkmark), and the insert shortcut
// hands its signature to onInsert (the editor, on a new line).
//
// The owner decides where pastes go: once the learner has picked or copied a
// command, a paste inside the overlay goes to onPaste (the editor) rather than
// the search bar, so copy-then-paste works without closing the overlay.

const COPIED_RESET_MS = 1500;
const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<g class="icon-idle"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/></g>'
    + '<path class="icon-done" d="M20 6 9 17l-5-5"/></svg>';

function addCopyButton(cell, onCopied) {
    const text = cell.textContent.trim();
    const label = `Copy ${text}`;
    const btn = document.createElement('button');
    btn.className = 'api-copy';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = COPY_ICON;

    let resetTimer = null;
    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            window.prompt('Copy this command:', text);
            return;
        }
        onCopied();
        btn.classList.add('copied');
        btn.setAttribute('aria-label', 'Copied');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
            btn.classList.remove('copied');
            btn.setAttribute('aria-label', label);
        }, COPIED_RESET_MS);
    });
    cell.append(btn);
}

// Copy-shortcut presses that belong to the text, not the selected row: a
// highlighted range in the search bar or anywhere on the page.
function hasTextSelection() {
    const el = document.activeElement;
    if (el?.selectionStart != null && el.selectionStart !== el.selectionEnd) return true;
    return !(window.getSelection()?.isCollapsed ?? true);
}

export function initCommandReference({ overlay, button, shortcut, copyShortcut, insertShortcut, onToggle, onClose, onPaste, onInsert }) {
    const search     = overlay.querySelector('#api-search');
    const sections   = [...overlay.querySelectorAll('.api-section')];
    const empty      = overlay.querySelector('#api-empty');
    const emptyQuery = overlay.querySelector('#api-empty-query');
    const list       = overlay.querySelector('#api-list');

    let selected = null;   // the <tr> the arrow keys have highlighted
    let copied = false;    // a command was copied since the query last changed

    // Each row keeps its signature, since its cell's text later includes the
    // copy button and, while selected, the hint.
    for (const cell of overlay.querySelectorAll('.api-section td:first-child')) {
        cell.parentElement.dataset.command = cell.textContent.trim();
        addCopyButton(cell, () => { copied = true; });
    }

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
        .flatMap((section) => [...section.querySelectorAll('tr')].filter((row) => !row.hidden));

    function select(row) {
        if (selected) {
            selected.classList.remove('selected');
            selected.querySelector('.api-copy').removeAttribute('aria-describedby');
        }
        selected = row;
        if (!row) return hint.remove();
        row.classList.add('selected');
        const copy = row.querySelector('.api-copy');
        copy.setAttribute('aria-describedby', hint.id);
        copy.after(hint);
        row.scrollIntoView({ block: 'nearest' });
    }

    function moveSelection(direction) {
        const rows = visibleRows();
        if (!rows.length) return;
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
        const index = visible.indexOf(selected?.closest('.api-section'));
        const next = index === -1
            ? (direction > 0 ? 0 : visible.length - 1)
            : Math.min(visible.length - 1, Math.max(0, index + direction));
        select([...visible[next].querySelectorAll('tr')].find((row) => !row.hidden));
    }

    const isOpen = () => overlay.classList.contains('visible');

    function filter(query) {
        const q = query.trim().toLowerCase();
        select(null);   // detach the hint first, or its text would match the query
        let anyMatch = false;
        for (const section of sections) {
            let sectionMatch = false;
            for (const row of section.querySelectorAll('tr')) {
                const match = !q || row.textContent.toLowerCase().includes(q);
                row.hidden = !match;
                sectionMatch ||= match;
            }
            section.hidden = !sectionMatch;
            anyMatch ||= sectionMatch;
        }
        empty.hidden = anyMatch;
        emptyQuery.textContent = query.trim();
    }

    function setVisible(open) {
        overlay.classList.toggle('visible', open);
        button.classList.toggle('active', open);
        button.setAttribute('aria-expanded', String(open));
        onToggle(open);
    }

    function open() {
        if (isOpen()) return search.focus();
        search.value = '';
        filter('');
        copied = false;
        list.scrollTop = 0;
        setVisible(true);
        search.focus();
    }

    function close() {
        select(null);
        setVisible(false);
        onClose();
    }

    const toggle = () => (isOpen() ? close() : open());

    search.addEventListener('input', () => {
        filter(search.value);
        copied = false;
        list.scrollTop = 0;
    });
    // A paste into the search bar while the learner is still typing a query
    // stays there; any other paste in the overlay is meant for the editor.
    overlay.addEventListener('paste', (e) => {
        if (e.target === search && !selected && !copied) return;
        const text = e.clipboardData?.getData('text/plain');
        if (!text) return;
        e.preventDefault();
        onPaste(text);
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
            if (selected) onInsert(selected.dataset.command);
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
    button.title = `Command reference (${shortcut})`;

    return { isOpen, open, close, toggle };
}
