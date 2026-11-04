// transcribe.js
// The transcription check's pure core: how a program typed by hand compares
// with the sample it copies, token by token and, within a token, character
// by character. No DOM; transcribe-panel.js is the shell that shows what
// these return, and test/transcribe_test.mjs covers them.
//
// Two programs are the same when their Lua tokens are: spacing, line breaks
// and indentation count only where Lua reads them (between two words, and
// inside a string), and comments do not count at all, so a learner may type
// them or leave them out. A program typed so far is checked as a prefix of
// the sample: its last token may still be half typed.

// ---- Tokens ----

const SYMBOLS = ['...', '..', '==', '~=', '<=', '>=', '<<', '>>', '//', '::'];

// The length of a long bracket opening at `i` (`[[`, `[==[`), or 0.
function longOpen(src, i) {
    const m = /^\[(=*)\[/.exec(src.slice(i, i + 64));
    return m ? m[0].length : 0;
}

// Where a long bracket whose opening has `level` equals signs ends: after
// its closing, or at the end of the text if it is never closed.
function longEnd(src, from, level) {
    const close = `]${'='.repeat(level)}]`;
    const at = src.indexOf(close, from);
    return at < 0 ? src.length : at + close.length;
}

// Where a short string opened by the quote at `i` ends: after its closing
// quote, or before the line break or end of text that cuts it off.
function stringEnd(src, i) {
    const quote = src[i];
    let j = i + 1;
    while (j < src.length) {
        const c = src[j];
        if (c === quote) return j + 1;
        if (c === '\n') return j;
        j += c === '\\' ? 2 : 1;
    }
    return src.length;
}

const NUMBER = /^(?:0[xX][0-9a-fA-F]*(?:\.[0-9a-fA-F]*)?(?:[pP][+-]?\d*)?|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d*)?)/;

// The program's tokens, in order, each {kind, text, start, end} with
// offsets into `src`: kind is 'name', 'number', 'string', 'symbol' or
// 'comment'. It never fails: an unclosed string or comment runs to where
// Lua would stop reading it, and an unknown character is a symbol of its own.
export function luaTokens(src) {
    const tokens = [];
    let i = 0;
    const push = (kind, end) => {
        tokens.push({ kind, text: src.slice(i, end), start: i, end });
        i = end;
    };
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (src.startsWith('--', i)) {
            const open = longOpen(src, i + 2);
            if (open) push('comment', longEnd(src, i + 2 + open, open - 2));
            else {
                const nl = src.indexOf('\n', i);
                push('comment', nl < 0 ? src.length : nl);
            }
            continue;
        }
        if (/[A-Za-z_]/.test(c)) {
            push('name', i + /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0].length);
            continue;
        }
        if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
            push('number', i + NUMBER.exec(src.slice(i))[0].length);
            continue;
        }
        if (c === '"' || c === "'") { push('string', stringEnd(src, i)); continue; }
        const open = longOpen(src, i);
        if (open) { push('string', longEnd(src, i + open, open - 2)); continue; }
        const symbol = SYMBOLS.find((s) => src.startsWith(s, i));
        push('symbol', i + (symbol ? symbol.length : 1));
    }
    return tokens;
}

// The tokens that count: everything but comments.
export function codeTokens(src) {
    return luaTokens(src).filter((t) => t.kind !== 'comment');
}

// ---- Positions ----

// The {line, ch} of an offset, both zero-based, as CodeMirror counts them.
export function posAt(src, offset) {
    const before = src.slice(0, offset);
    const line = before.split('\n').length - 1;
    return { line, ch: offset - (before.lastIndexOf('\n') + 1) };
}

// A character as a learner reads it in a message.
export function describeChar(c) {
    if (c === undefined || c === '') return 'the end of the program';
    if (c === '\n') return 'a line break';
    if (c === '\t') return 'a tab';
    if (/\s/.test(c)) return 'a space';
    return `\`${c}\``;
}

// ---- The check ----

// How far `typed`, the editor's text, has got in copying `sample`:
//
//   {
//     state:   'empty' | 'typing' | 'error' | 'done',
//     matched: how many of the sample's tokens are typed in full,
//     total:   how many tokens the sample has,
//     next:    offset in the sample of the next character to type, or null
//              once it is all typed,
//     error:   null, or {from, to, expected, found, message}, from and to
//              being offsets in `typed` of what is wrong,
//     okUntil: offset in `typed` of the end of the last token typed in full
//              and right,
//   }
//
// Only the first mistake is reported: what follows it is not checked until
// it is fixed, as in a typing tutor.
export function checkTranscription(sample, typed) {
    const want = codeTokens(sample);
    const got = codeTokens(typed);
    const total = want.length;
    const result = (fields) => ({ matched: 0, total, next: want[0]?.start ?? null, error: null, okUntil: 0, ...fields });

    if (got.length === 0) return result({ state: total === 0 ? 'done' : 'empty', next: total ? want[0].start : null });

    let okUntil = 0;
    for (let k = 0; k < got.length; k++) {
        const g = got[k];
        const w = want[k];
        const last = k === got.length - 1;
        const atEnd = last && g.end === typed.length;

        if (!w) {
            // A lone `-` just typed may be the start of a comment.
            if (atEnd && g.text === '-') return result({ state: 'done', matched: total, next: null, okUntil });
            return result({
                state: 'error', matched: total, next: null, okUntil,
                error: {
                    from: g.start, to: typed.length,
                    expected: 'the end of the program', found: describeToken(g.text),
                    message: `The sample ends here, but ${describeToken(g.text)} follows.`,
                },
            });
        }

        // A lone `-` just typed, where the sample has none, may be the start
        // of a comment: wait and see.
        if (atEnd && g.text === '-' && !w.text.startsWith('-')) {
            return result({ state: 'typing', matched: k, next: w.start, okUntil });
        }

        const i = commonPrefix(g.text, w.text);
        if (i === g.text.length && i === w.text.length) {
            okUntil = g.end;
            continue;
        }
        if (i === g.text.length && atEnd) {
            // Still typing this token.
            return result({ state: 'typing', matched: k, next: w.start + i, okUntil });
        }

        // The first character that differs: inside the typed token, or just
        // after it if it stopped short. What is marked is the rest of the
        // token from there; or, for a token that stopped short, the
        // character after it, or the token itself if what follows is space
        // (a line break could not be seen marked).
        const expectedChar = i < w.text.length ? w.text[i] : sample[w.end];
        const foundChar = i < g.text.length ? g.text[i] : typed[g.end];
        const expected = describeChar(expectedChar);
        const found = describeChar(foundChar);
        const [from, to] = i < g.text.length ? [g.start + i, g.end]
            : /\s/.test(foundChar) ? [g.start, g.end]
            : [g.end, g.end + 1];
        return result({
            state: 'error', matched: k, next: w.start + Math.min(i, w.text.length), okUntil,
            error: {
                from, to, expected, found,
                message: `Expected ${expected}${inToken(w.text, i)}, but found ${found}.`,
            },
        });
    }

    const done = got.length === total;
    return result({ state: done ? 'done' : 'typing', matched: got.length, next: done ? null : want[got.length].start, okUntil });
}

function commonPrefix(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
}

function describeToken(text) {
    return text.length > 24 ? `\`${text.slice(0, 24)}…\`` : `\`${text}\``;
}

// " in `forward`": the word the expected character belongs to, when it is
// one character of a longer token.
function inToken(text, i) {
    return i < text.length && text.length > 1 ? ` in ${describeToken(text)}` : ` after ${describeToken(text)}`;
}

// ---- Lines ----

// Each line of the sample, as the panel shows it: 'done' once all of its
// code is typed, 'current' for the line of the next character to type (or
// of the mistake), 'todo' after it, and 'note' for a line with no code
// (blank, or only a comment), which is never typed.
export function sampleLines(sample, check) {
    const lines = sample.split('\n');
    const codeLines = new Set();
    for (const t of codeTokens(sample)) {
        const first = posAt(sample, t.start).line;
        const last = posAt(sample, Math.max(t.start, t.end - 1)).line;
        for (let l = first; l <= last; l++) codeLines.add(l);
    }
    const current = check.next === null ? lines.length : posAt(sample, check.next).line;
    return lines.map((text, line) => ({
        text,
        state: !codeLines.has(line) ? 'note' : line < current ? 'done' : line === current ? 'current' : 'todo',
    }));
}

// The editor's lines whose code is all checked and right: each line with
// code, every token of it typed in full before `okUntil`. A line with a
// half typed token, or the mistake, is not right yet.
export function typedOkLines(typed, check) {
    const byLine = new Map();
    for (const t of codeTokens(typed)) {
        const line = posAt(typed, t.start).line;
        byLine.set(line, (byLine.get(line) ?? true) && t.end <= check.okUntil);
    }
    return [...byLine].filter(([, ok]) => ok).map(([line]) => line);
}

// A one-line summary of the check, for the panel's status, given the
// sample's lines as sampleLines() returns them.
export function progressText(check, lines) {
    switch (check.state) {
        case 'empty': return 'Start typing the sample into the editor.';
        case 'done': return 'It matches the sample. Run it!';
        case 'error': return check.error.message;
        default: {
            const code = lines.filter((line) => line.state !== 'note');
            const done = code.filter((line) => line.state === 'done').length;
            return `${done} of ${code.length} lines typed · no mistakes so far`;
        }
    }
}
