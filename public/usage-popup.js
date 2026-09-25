// usage-popup.js
// A popup showing example calls of a turtle command: under a line whose call
// to it was rejected, or under a command name the learner Cmd/Ctrl+clicked.
//
// Owns only the popup's markup and placement. What it shows is usage =
// {command, examples}, from the worker (with an error, or its usage catalog);
// the examples themselves live in turtle/examples.lua. The owner decides when to show and
// hide it (app.js hides it on Run and on Esc).
// An error's popup stays up while the learner edits, so the examples are in
// view as they fix the call; only Esc or its close button dismisses it (or
// deleting the line it sits under).
// A popup shown with { transient: true } (a lookup, not an error) also
// closes on the next click in the editor outside it, and on any edit.
//
// Placed with CodeMirror's addWidget, so it scrolls with the code and floats
// over the lines below (or above, near the end of the document) without
// moving them. A bookmark tracks its anchor through edits, and the popup is
// re-placed there after each one.

export function createUsagePopup(editor) {
    let node = null;

    function build({ command, examples }) {
        const popup = document.createElement('div');
        popup.className = 'usage-popup';
        popup.setAttribute('role', 'note');

        const header = document.createElement('div');
        header.className = 'usage-popup-header';
        const title = document.createElement('span');
        title.className = 'usage-popup-title';
        title.id = 'usage-popup-title';
        title.textContent = `How to call ${command}`;
        popup.setAttribute('aria-labelledby', title.id);
        const close = document.createElement('button');
        close.className = 'usage-popup-close';
        close.setAttribute('aria-label', 'Close examples');
        close.title = 'Close (Esc)';
        close.innerHTML = '&times;';
        close.addEventListener('click', () => { hide(); editor.focus(); });
        const hint = document.createElement('span');
        hint.className = 'usage-popup-hint';
        hint.setAttribute('aria-hidden', 'true');   // the button's label says it
        const key = document.createElement('kbd');
        key.className = 'kbd';
        key.textContent = 'Esc';
        hint.append(key, ' to close');
        const controls = document.createElement('div');
        controls.className = 'usage-popup-controls';
        controls.append(hint, close);
        header.append(title, controls);

        const list = document.createElement('div');
        list.className = 'usage-popup-examples';
        for (const example of examples) {
            const code = document.createElement('pre');
            code.className = 'usage-popup-example';
            code.textContent = example;
            list.append(code);
        }

        popup.append(header, list);
        return popup;
    }

    let anchor = null;     // bookmark at the position the popup sits under
    let offEvents = null;  // removes the open popup's editor handlers

    // Shows usage under pos ({line, ch}, zero-based), replacing any popup
    // already open.
    function show(pos, usage, { transient = false } = {}) {
        hide();
        const shown = node = build(usage);
        anchor = editor.setBookmark(pos);
        editor.addWidget(pos, node, true, 'near');

        const onChanges = () => {
            const at = anchor.find();
            if (transient || !at) hide();   // a deleted line clears its bookmark
            else editor.addWidget(at, shown, true, 'near');
        };
        // Registered during the mousedown that opened it; CodeMirror has
        // already copied its handler list, so it won't see that one.
        const onClick = (cm, e) => {
            if (!shown.contains(e.target)) hide();
        };
        editor.on('changes', onChanges);
        if (transient) editor.on('mousedown', onClick);
        offEvents = () => {
            editor.off('changes', onChanges);
            editor.off('mousedown', onClick);
        };
    }

    function hide() {
        offEvents?.();
        offEvents = null;
        anchor?.clear();
        anchor = null;
        if (!node) return;
        node.remove();
        node = null;
    }

    return { show, hide, isOpen: () => node !== null };
}
