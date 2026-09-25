// terminal.js
// Collapsible, resizable output panel under the editor.
// Owns: open/closed state, persisted height, drag-to-resize on the header,
//       and appending print output, errors, and hints.

import * as storage from './storage.js';

const LINE_HEIGHT   = 20;
const HEADER_HEIGHT = 26;
const BORDER_TOP    = 1;
const DEFAULT_LINES = 3;
const MAX_LINES     = 2000;   // keeps runaway print loops from bloating the DOM
const HEIGHT_KEY    = 'luaturtle-terminal-height';

export class Terminal {
    // els: { panel, header, content, caret, clearBtn, container }
    //   container bounds how tall the panel may grow.
    // onLayout:    called whenever the panel's height changes.
    // onLineClick: called with a 1-based line number when an error's line link is clicked.
    constructor(els, { onLayout, onLineClick }) {
        this.els         = els;
        this.onLayout    = onLayout;
        this.onLineClick = onLineClick;
        this.isOpen      = false;

        els.caret.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._dragMoved) { this._dragMoved = false; return; }
            this.toggle();
        });

        els.clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clear();
        });

        this._initResize();
    }

    // ---- Open / close ----

    _openHeight() {
        const stored = parseInt(storage.load(HEIGHT_KEY), 10);
        return Number.isFinite(stored)
            ? stored
            : HEADER_HEIGHT + BORDER_TOP + LINE_HEIGHT * DEFAULT_LINES + 8;
    }

    open() {
        const { panel, caret } = this.els;
        this.isOpen = true;
        panel.classList.remove('collapsed', 'has-unread');
        panel.style.height = this._openHeight() + 'px';
        caret.dataset.tooltip = 'close';
        caret.setAttribute('aria-expanded', 'true');
        this._scrollToBottom();
        this.onLayout();
    }

    close() {
        const { panel, caret } = this.els;
        this.isOpen = false;
        panel.classList.add('collapsed');
        panel.style.height = (HEADER_HEIGHT + BORDER_TOP) + 'px';
        caret.dataset.tooltip = 'open';
        caret.setAttribute('aria-expanded', 'false');
        this.onLayout();
    }

    toggle() {
        if (this.isOpen) this.close(); else this.open();
    }

    // ---- Resize ----

    _initResize() {
        const { header, panel, container } = this.els;
        let dragging = false, startY = 0, startH = 0;

        header.addEventListener('pointerdown', (e) => {
            if (!this.isOpen || e.button !== 0 || e.target.closest('button')) return;
            dragging = true;
            this._dragMoved = false;
            startY = e.clientY;
            startH = panel.getBoundingClientRect().height;
            header.setPointerCapture(e.pointerId);
        });

        header.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const delta = startY - e.clientY;
            if (!this._dragMoved && Math.abs(delta) < 3) return;
            this._dragMoved = true;
            const maxH = container.getBoundingClientRect().height - 60;
            const minH = HEADER_HEIGHT + BORDER_TOP + LINE_HEIGHT + 8;
            const h    = Math.round(Math.max(minH, Math.min(maxH, startH + delta)));
            panel.style.height = h + 'px';
            this.onLayout();
        });

        const stop = () => {
            if (!dragging) return;
            dragging = false;
            if (this._dragMoved) storage.save(HEIGHT_KEY, Math.round(panel.getBoundingClientRect().height));
        };
        header.addEventListener('pointerup',     stop);
        header.addEventListener('pointercancel', stop);
    }

    // ---- Output ----

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
