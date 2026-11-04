// test/transcribe_test.mjs
//
// The transcription check's pure core (public/transcribe.js) and the
// samples it offers (public/samples.js). Every lesson's and library
// program's own text must check as done against itself, re-spaced and
// without its comments.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/transcribe_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const {
    luaTokens, codeTokens, posAt, describeChar, checkTranscription, sampleLines, typedOkLines, progressText,
} = await import('../public/transcribe.js');
const { sampleGroups, searchSamples, findSample } = await import('../public/samples.js');

const texts = (src) => luaTokens(src).map((t) => [t.kind, t.text]);

// ---- Tokens ----

test('names, numbers, strings, symbols and comments', () => {
    assert.deepEqual(texts('local x = 1.5e3 .. "a b" -- hi\nx=x+0x1F'), [
        ['name', 'local'], ['name', 'x'], ['symbol', '='], ['number', '1.5e3'], ['symbol', '..'],
        ['string', '"a b"'], ['comment', '-- hi'],
        ['name', 'x'], ['symbol', '='], ['name', 'x'], ['symbol', '+'], ['number', '0x1F'],
    ]);
});

test('long strings and long comments, with levels', () => {
    assert.deepEqual(texts('--[[ a\nb ]] s = [==[x]]y]==]'), [
        ['comment', '--[[ a\nb ]]'], ['name', 's'], ['symbol', '='], ['string', '[==[x]]y]==]'],
    ]);
});

test('escapes inside a string, and the longest symbol', () => {
    assert.deepEqual(texts(`'it\\'s' ... ~= <= // ::`), [
        ['string', `'it\\'s'`], ['symbol', '...'], ['symbol', '~='], ['symbol', '<='], ['symbol', '//'], ['symbol', '::'],
    ]);
});

test('unclosed strings and comments stop where Lua would', () => {
    assert.deepEqual(texts('"abc\nx'), [['string', '"abc'], ['name', 'x']]);
    assert.deepEqual(texts('"ab'), [['string', '"ab']]);
    assert.deepEqual(texts('--[[ never'), [['comment', '--[[ never']]);
    assert.deepEqual(texts('[[ab'), [['string', '[[ab']]);
});

test('offsets point into the text', () => {
    const src = '  fd(10)\n';
    for (const t of luaTokens(src)) assert.equal(src.slice(t.start, t.end), t.text);
    assert.deepEqual(codeTokens('-- a\nb').map((t) => t.text), ['b']);
});

test('posAt counts lines and columns from zero', () => {
    assert.deepEqual(posAt('ab\ncd', 0), { line: 0, ch: 0 });
    assert.deepEqual(posAt('ab\ncd', 4), { line: 1, ch: 1 });
    assert.deepEqual(posAt('ab\ncd', 3), { line: 1, ch: 0 });
});

test('describeChar names what a learner cannot see', () => {
    assert.equal(describeChar(' '), 'a space');
    assert.equal(describeChar('\n'), 'a line break');
    assert.equal(describeChar('\t'), 'a tab');
    assert.equal(describeChar(undefined), 'the end of the program');
    assert.equal(describeChar('('), '`(`');
});

// ---- The check ----

const SAMPLE = '-- A square\nfor i = 1, 4 do\n    forward(100)\n    right(90)\nend\n';

test('nothing typed yet', () => {
    const check = checkTranscription(SAMPLE, '  \n-- my own note\n');
    assert.equal(check.state, 'empty');
    assert.equal(check.next, SAMPLE.indexOf('for'));
    assert.equal(check.total, 16);
});

test('spacing, line breaks and comments do not count', () => {
    const check = checkTranscription(SAMPLE, 'for i=1,4 do forward(100) -- go\nright( 90 ) end');
    assert.equal(check.state, 'done');
    assert.equal(check.matched, check.total);
    assert.equal(check.next, null);
    assert.equal(check.error, null);
});

test('a half typed word is still right', () => {
    const typed = 'for i = 1, 4 do\n    forw';
    const check = checkTranscription(SAMPLE, typed);
    assert.equal(check.state, 'typing');
    assert.equal(check.matched, 7);
    assert.equal(check.next, SAMPLE.indexOf('forward') + 4);
    assert.equal(check.okUntil, typed.indexOf('do') + 2);
});

test('a half typed string and a half typed symbol are still right', () => {
    assert.equal(checkTranscription('write("hi there")', 'write("hi th').state, 'typing');
    assert.equal(checkTranscription('a = b .. c', 'a = b .').state, 'typing');
    assert.equal(checkTranscription('if a == b then end', 'if a =').state, 'typing');
});

test('a wrong character is found where it is', () => {
    const typed = 'for i = 1, 4 do\n    forwrd(100)';
    const check = checkTranscription(SAMPLE, typed);
    assert.equal(check.state, 'error');
    assert.equal(check.error.from, typed.indexOf('rd('));
    assert.equal(check.error.to, typed.indexOf('('));
    assert.equal(check.error.message, 'Expected `a` in `forward`, but found `r`.');
    assert.equal(check.next, SAMPLE.indexOf('forward') + 4);
    assert.equal(check.matched, 7);
});

test('a word that stops short, followed by more', () => {
    const typed = 'for i = 1, 4 do forwar(100)';
    const check = checkTranscription(SAMPLE, typed);
    assert.deepEqual([check.error.from, check.error.to], [typed.indexOf('('), typed.indexOf('(') + 1]);
    assert.equal(check.error.message, 'Expected `d` in `forward`, but found `(`.');
});

test('a word that stops short at a space', () => {
    const check = checkTranscription(SAMPLE, 'fo ');
    assert.equal(check.state, 'error');
    assert.equal(check.error.message, 'Expected `r` in `for`, but found a space.');
    assert.deepEqual([check.error.from, check.error.to], [0, 2]);
    assert.deepEqual(checkTranscription('fd(1)', 'f\n').error.message, 'Expected `d` in `fd`, but found a line break.');
});

test('a missing space between two words', () => {
    const check = checkTranscription('local x = 1', 'localx');
    assert.equal(check.error.message, 'Expected a space after `local`, but found `x`.');
    assert.deepEqual([check.error.from, check.error.to], [5, 6]);
});

test('a missing token is reported at what came instead', () => {
    const check = checkTranscription('forward(100)', 'forward100)');
    assert.equal(check.error.message, 'Expected `(` after `forward`, but found `1`.');
});

test('spacing inside a string counts', () => {
    const check = checkTranscription('write("a b")', 'write("a  b")');
    assert.equal(check.state, 'error');
    assert.equal(check.error.message, 'Expected `b` in `"a b"`, but found a space.');
});

test('typing past the end of the sample', () => {
    const typed = 'fd(1) fd(2)';
    const check = checkTranscription('fd(1)', typed);
    assert.equal(check.state, 'error');
    assert.equal(check.error.from, typed.indexOf('fd(2)'));
    assert.equal(check.error.to, typed.length);
    assert.equal(check.error.message, 'The sample ends here, but `fd` follows.');
});

test('a lone dash just typed may start a comment', () => {
    assert.equal(checkTranscription('fd(1)\nrt(2)', 'fd(1) -').state, 'typing');
    assert.equal(checkTranscription('fd(1)', 'fd(1) -').state, 'done');
    assert.equal(checkTranscription('fd(1)\nrt(2)', 'fd(1) - ').state, 'error');
    assert.equal(checkTranscription('x = 1 - 2', 'x = 1 -').state, 'typing');
});

test('an empty sample is done at once', () => {
    assert.equal(checkTranscription('-- only a note', '').state, 'done');
});

// ---- Lines ----

test("the sample's lines: done, current, todo, and notes", () => {
    const typed = 'for i = 1, 4 do\n    forward(100)\n    rig';
    const lines = sampleLines(SAMPLE, checkTranscription(SAMPLE, typed));
    assert.deepEqual(lines.map((l) => l.state), ['note', 'done', 'done', 'current', 'todo', 'note']);
    assert.equal(lines[3].text, '    right(90)');
});

test('every code line is done once the sample is typed', () => {
    const lines = sampleLines(SAMPLE, checkTranscription(SAMPLE, SAMPLE));
    assert.deepEqual(lines.map((l) => l.state), ['note', 'done', 'done', 'done', 'done', 'note']);
});

test('a token over several lines puts every line of it in the sample', () => {
    const sample = 's = [[a\nb]]\nfd(1)';
    const lines = sampleLines(sample, checkTranscription(sample, 's = [[a\nb]]'));
    assert.deepEqual(lines.map((l) => l.state), ['done', 'done', 'current']);
});

test("the editor's right lines", () => {
    const typed = 'for i = 1, 4 do\n\n    forward(100)\n    right(9';
    assert.deepEqual(typedOkLines(typed, checkTranscription(SAMPLE, typed)), [0, 2]);
    const wrong = 'for i = 1, 4 do\n    forwrd(100)\n    right(90)';
    assert.deepEqual(typedOkLines(wrong, checkTranscription(SAMPLE, wrong)), [0]);
});

test('progress text', () => {
    const progress = (typed) => {
        const check = checkTranscription(SAMPLE, typed);
        return progressText(check, sampleLines(SAMPLE, check));
    };
    assert.equal(progress(''), 'Start typing the sample into the editor.');
    assert.equal(progress(SAMPLE), 'It matches the sample. Run it!');
    assert.equal(progress('for i = 1,'), '0 of 4 lines typed · no mistakes so far');
    assert.equal(progress('for i = 1, 4 do\n    forward(100)'), '2 of 4 lines typed · no mistakes so far');
    assert.equal(progress('fo '), 'Expected `r` in `for`, but found a space.');
});

// ---- Every real sample ----

// The program as a learner might type it: no comments, one space between
// tokens wherever there was any space, and each line's indentation dropped.
function retyped(src) {
    let out = '';
    let prev = null;
    for (const t of luaTokens(src)) {
        if (t.kind === 'comment') continue;
        if (prev !== null && t.start > prev) out += src.slice(prev, t.start).includes('\n') ? '\n' : ' ';
        out += t.text;
        prev = t.end;
    }
    return out;
}

const libraryDir = new URL('../public/library/programs/', import.meta.url);

test('every library program checks as done when retyped', () => {
    const files = readdirSync(libraryDir).filter((f) => f.endsWith('.lua'));
    assert.ok(files.length > 0);
    for (const file of files) {
        const src = readFileSync(new URL(file, libraryDir), 'utf8');
        assert.equal(checkTranscription(src, retyped(src)).state, 'done', file);
        assert.equal(checkTranscription(src, src).state, 'done', file);
    }
});

// The lessons' programs, as the sidebar gets them: lessons.lua run by plain
// lua, each program printed after a NUL.
function lessonPrograms() {
    const script = [
        'local chapters = dofile("public/turtle/lessons.lua")',
        'for _, c in ipairs(chapters) do for _, l in ipairs(c.lessons) do for _, e in ipairs(l.examples) do',
        '  io.write("\\0", l.slug, "/", e.slug, "\\0", e.code)',
        'end end end',
    ].join('\n');
    const out = execFileSync('lua', ['-e', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    const parts = out.split('\0').slice(1);
    const programs = [];
    for (let i = 0; i < parts.length; i += 2) programs.push({ id: parts[i], code: parts[i + 1] });
    return programs;
}

test('every lesson program checks as done when retyped', () => {
    const programs = lessonPrograms();
    assert.ok(programs.length > 10);
    for (const { id, code } of programs) {
        assert.ok(codeTokens(code).length > 0, id);
        assert.equal(checkTranscription(code, retyped(code)).state, 'done', id);
    }
});

// ---- Samples ----

const pages = [
    { id: 'balance/a', title: 'Scales', code: 'fd(1)', chapter: { index: 0, title: 'Linear' }, lesson: { title: 'Balance' } },
    { id: 'balance/b', title: 'Seesaw', code: 'fd(2)', chapter: { index: 0, title: 'Linear' }, lesson: { title: 'Balance' } },
    { id: 'roots/a', title: 'Parabola', code: 'fd(3)', chapter: { index: 1, title: 'Quadratic' }, lesson: { title: 'Roots' } },
];
const catalog = { examples: [{ id: 'rose-curve', name: 'Rose curve', about: 'Petals from sine.', concepts: [] }] };

test('the samples are the lessons by chapter, then the library', () => {
    const groups = sampleGroups(pages, catalog);
    assert.deepEqual(groups.map((g) => [g.title, g.samples.map((s) => s.id)]), [
        ['Lessons · Linear', ['lesson:balance/a', 'lesson:balance/b']],
        ['Lessons · Quadratic', ['lesson:roots/a']],
        ['Library', ['library:rose-curve']],
    ]);
    assert.equal(groups[0].samples[1].code, 'fd(2)');
    assert.equal(groups[2].samples[0].libraryId, 'rose-curve');
    assert.equal(groups[2].samples[0].code, undefined);
});

test('a group with no samples is left out', () => {
    assert.deepEqual(sampleGroups([], catalog).map((g) => g.id), ['library']);
    assert.deepEqual(sampleGroups(pages, null).map((g) => g.id), ['lessons/0', 'lessons/1']);
});

test('a search keeps the samples with every word', () => {
    const groups = sampleGroups(pages, catalog);
    assert.deepEqual(searchSamples(groups, 'balance see').map((g) => g.samples.map((s) => s.id)), [['lesson:balance/b']]);
    assert.deepEqual(searchSamples(groups, 'petals').map((g) => g.id), ['library']);
    assert.deepEqual(searchSamples(groups, 'quadratic').map((g) => g.id), ['lessons/1']);
    assert.equal(searchSamples(groups, '  '), groups);
    assert.deepEqual(searchSamples(groups, 'nothing'), []);
});

test('findSample finds a sample by id', () => {
    const groups = sampleGroups(pages, catalog);
    assert.equal(findSample(groups, 'lesson:roots/a').title, 'Parabola');
    assert.equal(findSample(groups, 'nope'), null);
});
