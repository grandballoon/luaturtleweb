// lua-editor.js
// The CodeMirror editor every page writes Lua in: the "turtle" theme (its
// colors are the palette tokens in styles.css), 4-space soft tabs, and
// turtle commands highlighted by name (lua-highlight.js).
// Used by app.js and library-page.js; CodeMirror itself is loaded by the
// page as a classic script (vendor/codemirror/).

import { TURTLE_COMMANDS } from './lua-highlight.js';

export function createLuaEditor(textarea) {
    const editor = CodeMirror.fromTextArea(textarea, {
        mode: 'lua',
        theme: 'turtle',
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: false,
        smartIndent: false,
        extraKeys: {
            'Tab':       (cm) => cm.execCommand('insertSoftTab'),
            'Shift-Tab': (cm) => cm.execCommand('indentLess'),
        },
    });

    editor.addOverlay({
        token(stream) {
            if (stream.match(TURTLE_COMMANDS)) return 'turtle-cmd';
            stream.next();
            return null;
        },
    });

    return editor;
}
