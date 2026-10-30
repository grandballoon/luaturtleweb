// test/dev_server_test.mjs
//
// The local dev server's decisions (tools/dev-server.mjs): which file a
// request reads, adding the feedback overlay to the page, and taking
// comments only from its own pages.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/dev_server_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
    resolvePath, injectOverlay, fromOwnPage, contentType, OVERLAY_SRC, ISOLATION_HEADERS,
} = await import('../tools/dev-server.mjs');

test('the site root and folders serve their index.html', () => {
    assert.deepEqual(resolvePath('/'), { root: 'public', path: 'index.html' });
    assert.deepEqual(resolvePath('/?x=1#y'), { root: 'public', path: 'index.html' });
    assert.deepEqual(resolvePath('/turtle/'), { root: 'public', path: 'turtle/index.html' });
});

test('files come from public/, and the overlay from dev/', () => {
    assert.deepEqual(resolvePath('/turtle/lessons.lua'), { root: 'public', path: 'turtle/lessons.lua' });
    assert.deepEqual(resolvePath('/app.js?v=2'), { root: 'public', path: 'app.js' });
    assert.deepEqual(resolvePath(OVERLAY_SRC), { root: 'dev', path: 'feedback/overlay.js' });
});

test('no path leaves its folder', () => {
    assert.equal(resolvePath('/../package.json'), null);
    assert.equal(resolvePath('/%2e%2e/ui-feedback.md'), null);
    assert.equal(resolvePath('/__dev/../../etc/passwd'), null);
    assert.equal(resolvePath('/__dev/%2e%2e/tools/dev-server.mjs'), null);
    assert.equal(resolvePath('/%E0%A4%A'), null);
});

test('the overlay is added at the end of the page body, once', () => {
    const page = '<html><body><p>Hi</p></body></html>';
    const out = injectOverlay(page);
    assert.equal(out, `<html><body><p>Hi</p><script type="module" src="${OVERLAY_SRC}"></script>\n</body></html>`);
    assert.equal(out.split(OVERLAY_SRC).length, 2);
    assert.ok(injectOverlay('<p>no body</p>').endsWith(`src="${OVERLAY_SRC}"></script>\n`));
});

test("comments are taken only from the server's own pages", () => {
    assert.equal(fromOwnPage('http://localhost:5520', 'localhost:5520'), true);
    assert.equal(fromOwnPage('http://127.0.0.1:5520', '127.0.0.1:5520'), true);
    assert.equal(fromOwnPage('http://evil.example', 'localhost:5520'), false);
    assert.equal(fromOwnPage('http://localhost:3000', 'localhost:5520'), false);
    assert.equal(fromOwnPage(undefined, 'localhost:5520'), false);
});

test('files are served with their types and the isolation the app needs', () => {
    assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
    assert.equal(contentType('glue.wasm'), 'application/wasm');
    assert.equal(contentType('turtle/core.lua'), 'text/plain; charset=utf-8');
    assert.equal(contentType('README'), 'application/octet-stream');
    assert.deepEqual(ISOLATION_HEADERS, {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
    });
});

test('the isolation headers are the ones the deployed site sets', () => {
    const deployed = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    for (const [name, value] of Object.entries(ISOLATION_HEADERS)) {
        assert.match(deployed, new RegExp(`^\\s*${name}: ${value}\\s*$`, 'm'), name);
    }
});
