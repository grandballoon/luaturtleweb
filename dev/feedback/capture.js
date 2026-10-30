// dev/feedback/capture.js
// Turns a clicked element into a feedback entry (see entry.js): a selector
// that finds it again and a short description a reader can recognise it by.
// Reads only an element's tagName, id, classList, attributes, textContent,
// parentElement and children, so it works on anything shaped like one.

// Identifiers that are safe to drop into a selector unescaped.
const plain = /^-?[A-Za-z_][\w-]*$/;

// The element's own step in a selector: tag, a few classes, and position.
function step(el) {
    const tag = el.tagName.toLowerCase();
    const classes = [...el.classList].filter((c) => plain.test(c)).slice(0, 2);
    let part = tag + classes.map((c) => `.${c}`).join('');
    const parent = el.parentElement;
    if (parent) {
        const twins = [...parent.children].filter((c) => c.tagName === el.tagName);
        if (twins.length > 1) part += `:nth-of-type(${twins.indexOf(el) + 1})`;
    }
    return part;
}

// A selector for `el`, anchored at the nearest ancestor with an id that
// `isUniqueId(id)` says no other element has. It stops at <body>.
export function selectorFor(el, isUniqueId) {
    const parts = [];
    for (let node = el; node && !/^(body|html)$/i.test(node.tagName); node = node.parentElement) {
        if (node.id && plain.test(node.id) && isUniqueId(node.id)) {
            parts.unshift(`#${node.id}`);
            return parts.join(' > ');
        }
        parts.unshift(step(node));
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
}

const TEXT_LIMIT = 60;

// The opening tag with its identifying attributes, then the start of its text.
export function describe(el) {
    const attrs = [...el.attributes]
        .filter((a) => a.name === 'id' || a.name === 'class' || a.name === 'aria-label' || a.name.startsWith('data-'))
        .map((a) => ` ${a.name}="${a.value}"`)
        .join('');
    const tag = `<${el.tagName.toLowerCase()}${attrs}>`;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return tag;
    return `${tag} "${text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text}"`;
}

// Everything about a click on `el` at client point (x, y), plus the comment.
// `where` is what the page knows: { page, box, viewport, isUniqueId }.
export function capture(el, x, y, comment, { page, box, viewport, isUniqueId }) {
    return {
        comment,
        page,
        selector: selectorFor(el, isUniqueId),
        element: describe(el),
        point: { x: x - box.left, y: y - box.top },
        size: { width: box.width, height: box.height },
        viewport,
    };
}
