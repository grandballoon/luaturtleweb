// command-lookup.js
// Cmd+click (Ctrl+click off macOS) on a turtle command in the editor asks
// for that command's usage, like "go to definition" in an IDE. While the
// modifier is held, the command under the pointer is underlined as a link.
//
// Owns only finding the command under the pointer and the hover underline.
// What counts as a command, and its usage, comes from lookup(name) (the
// worker's usage catalog); what to do with it is up to onLookup (app.js
// shows the usage popup).
//
// A name counts only where it is called, name( or t:name(, not as a
// variable, table field, or inside a comment or string. A modifier+click
// anywhere else falls through to CodeMirror (which adds a cursor there).

const CALL_AFTER = /^\s*[({"']/;   // Lua calls: f(...), f{...}, f"..."

// Widgets floating over the code (the usage popup) are marked with this by
// CodeMirror; pointer events on them are not about the code underneath.
const inWidget = (e) => e.target.closest?.('[cm-ignore-events]') != null;

export function initCommandLookup(editor, { isMac, lookup, onLookup }) {
    const modHeld = (e) => (isMac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;

    // The command under the viewport point (x, y), as {from, to, usage}, or null.
    function commandAt(x, y) {
        const pos = editor.coordsChar({ left: x, top: y }, 'window');
        const word = editor.findWordAt(pos);
        const from = word.anchor, to = word.head;
        if (from.ch === to.ch) return null;

        // coordsChar snaps to the nearest character, so check the pointer is
        // really over the word, not past the end of its line.
        const start = editor.charCoords(from, 'window');
        const end = editor.charCoords(to, 'window');
        if (x < start.left || x > end.left || y < start.top || y > start.bottom) return null;

        const usage = lookup(editor.getRange(from, to));
        if (!usage) return null;

        const token = editor.getTokenAt({ line: from.line, ch: from.ch + 1 }, true);
        if (/\b(comment|string)\b/.test(token.type || '')) return null;
        const text = editor.getLine(from.line);
        if (text[from.ch - 1] === '.') return null;              // obj.name: not ours
        if (!CALL_AFTER.test(text.slice(to.ch))) return null;
        return { from, to, usage };
    }

    // ---- Hover underline while the modifier is held ----

    let hoverMark = null;
    let pointer = null;   // last pointer position over the editor, {x, y}

    function setHover(hit) {
        if (hoverMark) {
            const at = hoverMark.find();
            if (hit && at && at.from.line === hit.from.line && at.from.ch === hit.from.ch) return;
            hoverMark.clear();
            hoverMark = null;
        }
        if (hit) hoverMark = editor.markText(hit.from, hit.to, { className: 'cm-command-link' });
    }

    function refreshHover(e) {
        setHover(pointer && modHeld(e) ? commandAt(pointer.x, pointer.y) : null);
    }

    const wrapper = editor.getWrapperElement();
    wrapper.addEventListener('mousemove', (e) => {
        pointer = inWidget(e) ? null : { x: e.clientX, y: e.clientY };
        refreshHover(e);
    });
    wrapper.addEventListener('mouseleave', () => {
        pointer = null;
        setHover(null);
    });
    // Pressing or releasing the modifier without moving the mouse.
    document.addEventListener('keydown', refreshHover);
    document.addEventListener('keyup', refreshHover);
    window.addEventListener('blur', () => setHover(null));
    editor.on('scroll', () => setHover(null));

    // ---- Click ----

    editor.on('mousedown', (cm, e) => {
        if (e.button !== 0 || !modHeld(e) || inWidget(e)) return;
        const hit = commandAt(e.clientX, e.clientY);
        if (!hit) return;
        e.preventDefault();   // stops CodeMirror adding a cursor here
        onLookup(hit.from, hit.usage);
    });
}
