// dev/feedback/entry.js
// One UI comment, as the overlay sends it and the dev server records it.
// Shared by both sides of the wire, so it stays free of DOM and Node APIs.
// After Triangle Lab's src/dev/feedback/entry.ts, so both projects' files
// read alike.
//
// An entry: { comment, page, selector, element, point: {x, y},
//             size: {width, height}, viewport: {width, height} }
//   comment   what the reviewer wrote
//   page      path and query of the page, e.g. "/?x=1"
//   selector  a CSS selector that finds the element again
//   element   the element's opening tag and the start of its text
//   point     where the click landed, in CSS pixels from the element's top left
//   size      the element's box, in CSS pixels

// Where the overlay posts comments; served by tools/dev-server.mjs.
export const FEEDBACK_ENDPOINT = '/__ui-feedback';

// The file the dev server appends to, in the repo root (gitignored).
export const FEEDBACK_FILE = 'ui-feedback.md';

const isString = (v) => typeof v === 'string';
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isSize = (v) => typeof v === 'object' && v !== null && isNumber(v.width) && isNumber(v.height);

// A decoded request body as an entry, or null if it is not a complete one.
export function parseEntry(value) {
    if (typeof value !== 'object' || value === null) return null;
    const { comment, page, selector, element, point, size, viewport } = value;
    const ok = isString(comment) && comment.trim() !== ''
        && isString(page) && isString(selector) && isString(element)
        && typeof point === 'object' && point !== null && isNumber(point.x) && isNumber(point.y)
        && isSize(size) && isSize(viewport);
    if (!ok) return null;
    return {
        comment: comment.trim(),
        page,
        selector,
        element,
        point: { x: point.x, y: point.y },
        size: { width: size.width, height: size.height },
        viewport: { width: viewport.width, height: viewport.height },
    };
}

// The top of a fresh feedback file, explaining its format to whoever reads it.
export const FEEDBACK_HEADER = `# UI feedback

Comments left on the running dev server with Option-click (Alt-click elsewhere).
Each entry starts open (\`[ ]\`) and is marked \`[x]\` once it has been dealt with.
This file is local and gitignored.
`;

const pad = (n) => String(n).padStart(2, '0');
const px = (s) => `${Math.round(s.width)} × ${Math.round(s.height)} px`;

// One entry as a Markdown section, stamped with local time `at`.
export function formatEntry(entry, at) {
    const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} `
        + `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    const quote = entry.comment.split(/\r?\n/).map((line) => `> ${line}`.trimEnd()).join('\n');
    const { x, y } = entry.point;
    return `
## [ ] ${stamp} · ${entry.page}

${quote}

- Element: \`${entry.element}\`
- Selector: \`${entry.selector}\`
- Clicked at: ${Math.round(x)}, ${Math.round(y)} px inside a ${px(entry.size)} box
- Viewport: ${px(entry.viewport)}
`;
}
