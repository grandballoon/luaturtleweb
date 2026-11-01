// lessons.js
// The Lessons sidebar's pure core: the lessons (turtle/lessons.lua, sent by
// the worker) as a flat list of pages, one per example, and everything the
// sidebar decides about them: where a page sits in its lesson, which page a
// move or a key leads to, the table of contents, a paragraph split into
// prose and `code`, and the line numbers beside a chunk of a program. No DOM, no storage; lessons-panel.js is the shell
// that shows what these return.

// Accept either a JS array or a key-ordered object (Wasmoon turns an empty
// Lua table into {}).
function items(seq) {
    if (!seq) return [];
    return Array.isArray(seq) ? seq : Object.values(seq);
}

// Chapters → lessons → examples, flattened into pages in reading order.
// A page's id, "<lesson slug>/<example slug>", is what the sidebar
// remembers, so a saved place survives pages being added around it.
export function lessonPages(chapters) {
    const pages = [];
    items(chapters).forEach((chapter, c) => {
        items(chapter.lessons).forEach((lesson, l) => {
            const examples = items(lesson.examples);
            examples.forEach((example, e) => {
                pages.push({
                    id: `${lesson.slug}/${example.slug}`,
                    chapter: { index: c, title: chapter.title, summary: chapter.summary },
                    lesson: { index: l, slug: lesson.slug, title: lesson.title, summary: lesson.summary },
                    example: e,
                    examples: examples.length,
                    title: example.title,
                    kind: example.kind,
                    problem: example.problem ?? null,
                    source: example.source ?? null,
                    text: items(example.text),
                    // The program's chunks, each with what it does; see
                    // tutorial() in lessons.lua.
                    steps: items(example.steps).map((step) => ({
                        text: items(step.text),
                        code: step.code,
                        first: step.first,
                        fold: Boolean(step.fold),
                    })),
                    code: example.code,
                });
            });
        });
    });
    return pages;
}

// Index of the page with this id, or 0 (the first page) if there is none.
export function pageIndex(pages, id) {
    const index = pages.findIndex((page) => page.id === id);
    return index < 0 ? 0 : index;
}

// `index` moved by `step` pages, kept within the pages.
export function movePage(index, step, count) {
    if (count === 0) return 0;
    return Math.min(count - 1, Math.max(0, index + step));
}

// What the sidebar shows around page `index`.
export function pagerView(pages, index) {
    const page = pages[index];
    return {
        page,
        number: index + 1,
        count: pages.length,
        hasPrev: index > 0,
        hasNext: index < pages.length - 1,
        // "2 of 4": the example's place in its lesson.
        inLesson: `${page.example + 1} of ${page.examples}`,
    };
}

// The table of contents: chapters, their lessons, and each lesson's pages,
// each page with its index, so the contents can jump straight to it, and
// whether it is the page at `current`.
export function contents(pages, current) {
    const chapters = [];
    pages.forEach((page, index) => {
        let chapter = chapters[chapters.length - 1];
        if (!chapter || chapter.index !== page.chapter.index) {
            chapter = { ...page.chapter, lessons: [] };
            chapters.push(chapter);
        }
        let lesson = chapter.lessons[chapter.lessons.length - 1];
        if (!lesson || lesson.index !== page.lesson.index) {
            lesson = { ...page.lesson, pages: [] };
            chapter.lessons.push(lesson);
        }
        lesson.pages.push({ index, title: page.title, kind: page.kind, current: index === current });
    });
    return chapters;
}

// The label a page's kind shows as.
export const KIND_LABELS = {
    plane: 'On the plane',
    turtle: 'With the turtle',
};

// A paragraph as runs of prose and code: `backticks` mark code.
export function paragraphParts(text) {
    return String(text).split('`').map((part, i) => ({ code: i % 2 === 1, text: part }))
        .filter((part) => part.text !== '');
}

// The line numbers beside `code` when its first line is line `first` of
// the program, one per line, as the gutter shows them.
export function lineNumbers(code, first = 1) {
    const count = String(code).split('\n').length;
    return Array.from({ length: count }, (_, i) => String(first + i)).join('\n');
}

// "lines 4–9", or "line 4": where a chunk sits in the program.
export function lineRange(code, first) {
    const last = first + String(code).split('\n').length - 1;
    return last === first ? `line ${first}` : `lines ${first}–${last}`;
}

// What a key pressed inside the sidebar does, or null if it does nothing
// there: arrows and Page Up/Down turn the page, Home and End go to the
// first and last page. Keys with a modifier are left alone.
export function keyAction({ key, ctrlKey, metaKey, altKey, shiftKey }) {
    if (ctrlKey || metaKey || altKey || shiftKey) return null;
    switch (key) {
        case 'ArrowLeft':
        case 'PageUp':
            return 'prev';
        case 'ArrowRight':
        case 'PageDown':
            return 'next';
        case 'Home':
            return 'first';
        case 'End':
            return 'last';
        default:
            return null;
    }
}

// The page a key action leads to from `index`.
export function pageAfter(action, index, count) {
    switch (action) {
        case 'prev': return movePage(index, -1, count);
        case 'next': return movePage(index, 1, count);
        case 'first': return 0;
        case 'last': return Math.max(0, count - 1);
        default: return index;
    }
}
