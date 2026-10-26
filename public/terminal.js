// terminal.js
// The terminal under the canvas: print output, errors, and hints, in a
// panel docked to the bottom of the canvas's column (dock.js).
// Owns: appending lines (bounded, following new output unless the learner
// scrolled up), error line links, clearing, and the unread mark for output
// that arrives while it's collapsed.

import { createDock, HEADER_HEIGHT } from './dock.js';

const LINE_HEIGHT   = 20;
const DEFAULT_LINES = 3;
const MAX_LINES     = 2000;   // keeps runaway print loops from bloating the DOM
const HEIGHT_KEY    = 'luaturtle-terminal-height';

export class Terminal {
    // els: { panel, header, content, caret, clearBtn, column }
    //   column bounds how tall the panel may grow.
    // onLineClick: called with a 1-based line number when an error's line link is clicked.
    constructor(els, { onLineClick }) {
        this.els         = els;
        this.onLineClick = onLineClick;
        this.dock = createDock({
            panel:  els.panel,
            header: els.header,
            caret:  els.caret,
            column: els.column,
            key:    HEIGHT_KEY,
            defaultHeight: HEADER_HEIGHT + LINE_HEIGHT * DEFAULT_LINES + 8,
            minHeight:     HEADER_HEIGHT + LINE_HEIGHT + 8,
            onToggle: (open) => {
                if (!open) return;
                els.panel.classList.remove('has-unread');
                this._scrollToBottom();
            },
        });

        els.clearBtn.addEventListener('click', () => this.clear());
    }

    get isOpen() {
        return this.dock.isOpen();
    }

    open()   { this.dock.open(); }
    close()  { this.dock.close(); }
    toggle() { this.dock.toggle(); }

    clear() {
        this.els.content.replaceChildren();
        this.els.panel.classList.remove('has-unread');
    }

    info(text) {
        this._append([this._line(text, 'info')]);
    }

    print(lines) {
        this._append(lines.map((text) => this._line(String(text))));
    }

    // line: 1-based source line the error points at, if known.
    error(message, line) {
        const el = this._line('', 'error');
        if (line) {
            const link = document.createElement('button');
            link.type        = 'button';
            link.className   = 'terminal-link';
            link.textContent = `Line ${line}`;
            link.title       = 'Jump to this line';
            link.addEventListener('click', () => this.onLineClick(line));
            el.append(link, ' ');
        }
        el.append(message);
        this._append([el]);
    }

    _line(text, kind) {
        const el = document.createElement('div');
        el.className   = kind ? `terminal-line ${kind}` : 'terminal-line';
        el.textContent = text;
        return el;
    }

    _append(nodes) {
        const { content, panel } = this.els;
        // Follow new output only if the reader hasn't scrolled up to look at something.
        const follow = content.scrollHeight - content.scrollTop - content.clientHeight < 4;
        content.append(...nodes);
        const excess = content.childElementCount - MAX_LINES;
        for (let i = 0; i < excess; i++) content.firstElementChild.remove();
        if (follow) this._scrollToBottom();
        if (!this.isOpen) panel.classList.add('has-unread');
    }

    _scrollToBottom() {
        this.els.content.scrollTop = this.els.content.scrollHeight;
    }
}
