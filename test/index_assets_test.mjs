// test/index_assets_test.mjs
//
// Every page (index.html, library.html) loads every script and stylesheet
// from public/ (CodeMirror is vendored in public/vendor/codemirror/), except
// the Google Fonts stylesheet, whose loss only changes the typeface. A third-party script is a runtime
// dependency that can take the editor down with it; a local path that does
// not exist does the same without any test failing.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/index_assets_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const PUBLIC = new URL('../public/', import.meta.url);
const ALLOWED_ORIGINS = ['https://fonts.googleapis.com'];

// The src of every <script> and href of every stylesheet <link> in `html`.
function assetUrls(html) {
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
    const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)]
        .map(m => m[0].match(/\bhref="([^"]+)"/)?.[1])
        .filter(Boolean);
    return [...scripts, ...styles];
}

const isRemote = url => /^[a-z]+:|^\/\//i.test(url);

test('assetUrls reads script srcs and stylesheet hrefs only', () => {
    const html = `<link rel="preconnect" href="https://x.test">
<link rel="stylesheet" href="a.css">
<script src="b.js"></script><script type="module" src="c.js"></script><script>inline()</script>`;
    assert.deepEqual(assetUrls(html), ['b.js', 'c.js', 'a.css']);
});

const PAGES = readdirSync(PUBLIC).filter((name) => name.endsWith('.html'));

test('the pages are the editor and the library', () => {
    assert.deepEqual(PAGES.sort(), ['index.html', 'library.html']);
});

for (const page of PAGES) {
    const urls = assetUrls(readFileSync(new URL(page, PUBLIC), 'utf8'));

    test(`${page} loads no scripts or stylesheets from third parties but Google Fonts`, () => {
        const foreign = urls.filter(isRemote).filter(url => !ALLOWED_ORIGINS.includes(new URL(url).origin));
        assert.deepEqual(foreign, []);
    });

    test(`every local script and stylesheet ${page} names exists in public/`, () => {
        const missing = urls.filter(url => !isRemote(url)).filter(url => !existsSync(new URL(url, PUBLIC)));
        assert.deepEqual(missing, []);
    });
}
