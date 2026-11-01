// dev/feedback/overlay.js
// Dev-only UI feedback: hold Option (Alt off macOS) to outline the element
// under the pointer, Option-click it to write a comment, and the comment is
// posted to the dev server (tools/dev-server.mjs), which appends it to
// ui-feedback.md for Claude to read.
//
// Only the dev server adds this script to the page, and it lives outside
// public/, so the published site never has it; no app module imports it.
// Option-clicks are taken before the app's own listeners see them, and
// keys typed into the comment box never reach the app's shortcuts.

import { capture } from './capture.js';
import { FEEDBACK_ENDPOINT, FEEDBACK_FILE } from './entry.js';

const ACCENT = '#237a69';

const css = `
[data-ui-feedback] { font: 13px/1.45 'IBM Plex Sans', system-ui, -apple-system, sans-serif; color: #3b342b; }
.uif-outline {
  position: fixed; z-index: 2147483646; pointer-events: none; display: none;
  border: 2px solid ${ACCENT}; background: rgba(35, 122, 105, 0.08); border-radius: 3px;
}
.uif-tag {
  position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; padding: 2px 6px; white-space: nowrap;
  background: ${ACCENT}; color: #fbf8f2; border-radius: 3px; font: 600 11px/1.4 'IBM Plex Mono', ui-monospace, monospace;
}
.uif-outline.below .uif-tag { bottom: auto; top: 100%; margin: 4px 0 0; }
.uif-box {
  position: fixed; z-index: 2147483647; width: 320px; padding: 12px; display: none;
  background: #f6f2eb; border: 1px solid #dbd2c4; border-radius: 10px;
  box-shadow: 0 12px 36px rgba(70, 50, 20, 0.18), 0 2px 8px rgba(70, 50, 20, 0.12);
}
.uif-title { margin: 0 0 8px; font-size: 12px; color: #72695c; }
.uif-title code { font: 11px 'IBM Plex Mono', ui-monospace, monospace; color: ${ACCENT}; }
.uif-box textarea {
  display: block; box-sizing: border-box; width: 100%; min-height: 84px; resize: vertical; padding: 8px 10px;
  background: #faf7f1; color: inherit; font: inherit; border: 1px solid #dbd2c4; border-radius: 6px; outline: none;
}
.uif-box textarea:focus { border-color: ${ACCENT}; }
.uif-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.uif-hint { flex: 1; color: #72695c; font-size: 11px; }
.uif-box button {
  padding: 5px 12px; font: 500 12px 'IBM Plex Mono', ui-monospace, monospace; border-radius: 6px; cursor: pointer;
  border: 1px solid #dbd2c4; background: #f6f2eb; color: inherit;
}
.uif-box button.uif-save { background: ${ACCENT}; border-color: ${ACCENT}; color: #fbf8f2; }
.uif-toast {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%);
  padding: 8px 14px; border-radius: 8px; background: #f6f2eb; border: 1px solid #dbd2c4;
  box-shadow: 0 6px 20px rgba(70, 50, 20, 0.12);
  opacity: 0; transition: opacity 160ms; pointer-events: none;
}
.uif-toast.show { opacity: 1; }
.uif-toast.error { border-color: #b5443b; color: #b5443b; }
`;

function el(tag, className, parent) {
    const node = document.createElement(tag);
    node.className = className;
    parent.appendChild(node);
    return node;
}

const root = document.createElement('div');
root.dataset.uiFeedback = '';
el('style', '', root).textContent = css;
const outline = el('div', 'uif-outline', root);
const tag = el('span', 'uif-tag', outline);
const box = el('div', 'uif-box', root);
const title = el('p', 'uif-title', box);
const input = el('textarea', '', box);
input.placeholder = 'What should change here?';
const row = el('div', 'uif-row', box);
el('span', 'uif-hint', row).textContent = '↵ save · ⇧↵ new line · esc cancel';
const cancel = el('button', '', row);
cancel.type = 'button';
cancel.textContent = 'Cancel';
const save = el('button', 'uif-save', row);
save.type = 'button';
save.textContent = 'Save';
const toast = el('div', 'uif-toast', root);
document.body.appendChild(root);

// The element being commented on and where it was clicked, while the box is open.
let pending = null;

const ours = (t) => t instanceof Node && root.contains(t);
const label = (target) => target.tagName.toLowerCase() + (target.id ? `#${target.id}` : '');

function show(target) {
    const r = target.getBoundingClientRect();
    Object.assign(outline.style, {
        display: 'block',
        left: `${r.left - 2}px`,
        top: `${r.top - 2}px`,
        width: `${r.width + 4}px`,
        height: `${r.height + 4}px`,
    });
    outline.classList.toggle('below', r.top < 28);
    tag.textContent = label(target);
}

function hide() {
    outline.style.display = 'none';
}

function open(target, x, y) {
    pending = { target, x, y };
    show(target);
    title.replaceChildren('Feedback for Claude on ');
    const code = document.createElement('code');
    code.textContent = label(target);
    title.append(code);
    box.style.display = 'block';
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    box.style.left = `${Math.max(8, Math.min(x + 12, innerWidth - w - 8))}px`;
    box.style.top = `${Math.max(8, Math.min(y + 12, innerHeight - h - 8))}px`;
    input.value = '';
    input.focus();
}

function close() {
    pending = null;
    box.style.display = 'none';
    hide();
}

let toastTimer = 0;
function notify(text, error = false) {
    toast.textContent = text;
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), error ? 4000 : 1800);
}

async function submit() {
    if (!pending) return;
    const comment = input.value.trim();
    if (!comment) return;
    const { target, x, y } = pending;
    const entry = capture(target, x, y, comment, {
        page: location.pathname + location.search,
        box: target.getBoundingClientRect(),
        viewport: { width: innerWidth, height: innerHeight },
        isUniqueId: (id) => document.querySelectorAll(`#${CSS.escape(id)}`).length === 1,
    });
    close();
    try {
        const res = await fetch(FEEDBACK_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        notify(`Saved to ${FEEDBACK_FILE}`);
    } catch (err) {
        notify(`Comment not saved: ${err instanceof Error ? err.message : err}`, true);
    }
}

// Option-clicks belong to the overlay: take every event of the click before
// the page's own listeners, and open the box on the first of them.
const swallow = (e) => {
    if (!e.altKey || ours(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
};
for (const type of ['pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu']) {
    window.addEventListener(type, swallow, true);
}
window.addEventListener('pointerdown', (e) => {
    if (!e.altKey || ours(e.target) || !(e.target instanceof Element)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(e.target, e.clientX, e.clientY);
}, true);

window.addEventListener('pointermove', (e) => {
    if (pending) return;
    if (e.altKey && e.target instanceof Element && !ours(e.target)) show(e.target);
    else hide();
}, true);
window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && !pending) hide();
});
window.addEventListener('blur', () => {
    if (!pending) hide();
});

// Keys typed into the box are the reviewer's, not the app's.
for (const type of ['keydown', 'keyup', 'keypress']) {
    box.addEventListener(type, (e) => e.stopPropagation());
}
box.addEventListener('pointerdown', (e) => e.stopPropagation());
input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
    }
});
cancel.addEventListener('click', close);
save.addEventListener('click', submit);
