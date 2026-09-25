// terminal.js
// Collapsible, resizable panel under the editor, with tabs.
// Owns: open/closed state, the tab strip, persisted height (per tab),
//       drag-to-resize on the header, and appending print output, errors,
//       and hints to the output tab.
//
// The output tab is always there. Other tabs (the command reference, when
// the learner moves it here) are added with addTab and removed with
// removeTab; their owner supplies the pane, and hears through
// onVisibilityChange whenever that pane comes into or goes out of view,
// whether by selectTab, a tab click, or the panel opening or collapsing.

import * as storage from './storage.js';

const LINE_HEIGHT   = 20;
const HEADER_HEIGHT = 26;
const BORDER_TOP    = 1;
const DEFAULT_LINES = 3;
const MAX_LINES     = 2000;   // keeps runaway print loops from bloating the DOM
const HEIGHT_KEY    = 'luaturtle-terminal-height';
const MIN_EDITOR    = 60;     // px of editor the panel always leaves showing
const OUTPUT        = 'output';

export class Terminal {
    // els: { panel, header, content, caret, clearBtn, container, tabList, outputTab }
    //   container bounds how tall the panel may grow.
    // onLayout:    called whenever the panel's height changes.
    // onLineClick: called with a 1-based line number when an error's line link is clicked.
    constructor(els, { onLayout, onLineClick }) {
        this.els         = els;
        this.onLayout    = onLayout;
        this.onLineClick = onLineClick;
        this.isOpen      = false;
        this.activeTab   = OUTPUT;

        // name → { tab, pane, heightKey, defaultHeight, minHeight, onVisibilityChange }
        this.tabs = new Map([[OUTPUT, {
            tab:           els.outputTab,
            pane:          els.content,
            heightKey:     HEIGHT_KEY,
            defaultHeight: HEADER_HEIGHT + BORDER_TOP + LINE_HEIGHT * DEFAULT_LINES + 8,
            minHeight:     HEADER_HEIGHT + BORDER_TOP + LINE_HEIGHT + 8,
            onVisibilityChange: () => {},
        }]]);
        els.outputTab.addEventListener('click', () => this.selectTab(OUTPUT));

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

    // The tab whose pane is on screen, or null while collapsed.
    get visibleTab() {
        return this.isOpen ? this.activeTab : null;
    }

    open() {
        this._show(true, this.activeTab);
    }

    close() {
        this._show(false, this.activeTab);
    }

    toggle() {
        if (this.isOpen) this.close(); else this.open();
    }

    // For the terminal shortcut, which is about the output: from another tab
    // it brings the output into view instead of collapsing the panel.
    toggleOutput() {
        if (this.visibleTab === OUTPUT) this.close();
        else this.selectTab(OUTPUT);
    }

    // Brings name's tab into view, opening the panel if it's collapsed.
    selectTab(name) {
        if (!this.tabs.has(name)) return;
        this._show(true, name);
    }

    // Moves the panel to open (true or false) with tab active, then tells
    // each tab's owner if its pane came into or went out of view.
    _show(open, tab) {
        const before = this.visibleTab;
        const { panel, caret } = this.els;
        this.isOpen    = open;
        this.activeTab = tab;
        panel.classList.toggle('collapsed', !open);
        panel.dataset.tab = tab;
        caret.dataset.tooltip = open ? 'close' : 'open';
        caret.setAttribute('aria-expanded', String(open));
        for (const [name, t] of this.tabs) {
            const selected = name === tab;
            t.tab.setAttribute('aria-selected', String(selected));
            t.pane.hidden  = !selected;
        }
        this._applyHeight();
        if (this.visibleTab === OUTPUT) {
            panel.classList.remove('has-unread');
            this._scrollToBottom();
        }
        this.onLayout();

        const after = this.visibleTab;
        if (before === after) return;
        this.tabs.get(before)?.onVisibilityChange(false);
        this.tabs.get(after)?.onVisibilityChange(true);
    }

    // ---- Tabs ----

    // Adds a tab after the existing ones, not selected. pane moves into the
    // panel; its owner takes it back out after removeTab.
    // defaultHeight, minHeight: the panel's height on this tab, in px, until
    // the learner resizes it, and the least a resize can make it.
    addTab(name, { label, pane, defaultHeight, minHeight, onVisibilityChange }) {
        const { panel, tabList } = this.els;
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.id = `terminal-tab-${name}`;
        tab.className = 'terminal-tab';
        tab.textContent = label;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', pane.id);
        tab.setAttribute('aria-selected', 'false');
        tab.addEventListener('click', () => this.selectTab(name));
        tabList.append(tab);

        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', tab.id);
        pane.hidden = true;
        panel.append(pane);
        panel.classList.add('tabbed');

        this.tabs.set(name, {
            tab, pane, defaultHeight, minHeight, onVisibilityChange,
            heightKey: `${HEIGHT_KEY}-${name}`,
        });
    }

    // Removes the tab, leaving its pane in place for the owner to move.
    // Doesn't call its onVisibilityChange: the owner is the one removing it.
    // If it was selected, the output tab takes its place.
    removeTab(name) {
        const t = this.tabs.get(name);
        if (!t || name === OUTPUT) return;
        if (this.activeTab === name) {
            this.tabs.delete(name);
            this._show(this.isOpen, OUTPUT);
        } else {
            this.tabs.delete(name);
        }
        t.tab.remove();
        t.pane.hidden = false;
        t.pane.removeAttribute('role');
        t.pane.removeAttribute('aria-labelledby');
        this.els.panel.classList.toggle('tabbed', this.tabs.size > 1);
    }

    // ---- Resize ----

    // The panel's height bounds on the active tab, in px.
    _heightBounds() {
        const t = this.tabs.get(this.activeTab);
        const max = this.els.container.getBoundingClientRect().height - MIN_EDITOR;
        return { min: t.minHeight, max: Math.max(t.minHeight, max) };
    }

    _applyHeight() {
        const { panel } = this.els;
        if (!this.isOpen) {
            panel.style.height = (HEADER_HEIGHT + BORDER_TOP) + 'px';
            return;
        }
        const t = this.tabs.get(this.activeTab);
        const stored = parseInt(storage.load(t.heightKey), 10);
        const { min, max } = this._heightBounds();
        const h = Number.isFinite(stored) ? stored : t.defaultHeight;
        panel.style.height = Math.round(Math.max(min, Math.min(max, h))) + 'px';
    }

    _initResize() {
        const { header, panel } = this.els;
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
            const { min, max } = this._heightBounds();
            const h = Math.round(Math.max(min, Math.min(max, startH + delta)));
            panel.style.height = h + 'px';
            this.onLayout();
        });

        const stop = () => {
            if (!dragging) return;
            dragging = false;
            if (!this._dragMoved) return;
            const key = this.tabs.get(this.activeTab).heightKey;
            storage.save(key, Math.round(panel.getBoundingClientRect().height));
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
        if (this.visibleTab !== OUTPUT) panel.classList.add('has-unread');
    }

    _scrollToBottom() {
        this.els.content.scrollTop = this.els.content.scrollHeight;
    }
}
