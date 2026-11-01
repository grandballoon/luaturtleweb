// tools/dev-server.mjs
// The local dev server: serves public/ the way the deployed site does
// (cross-origin isolated, see public/_headers), plus the dev-only UI
// feedback overlay (dev/feedback/): Option-click any element to leave
// Claude a comment, which this appends to ui-feedback.md.
//
// Run from the repo root:  node tools/dev-server.mjs [port]   (default 5520)
//
// It listens on the loopback addresses only. The overlay is added to index.html as it is
// served and is itself served from dev/, outside public/, so the published
// site (Cloudflare serves public/ as is) never has it. Comments are taken
// only from this server's own pages.
//
// The decisions are pure exported functions (test/dev_server_test.mjs);
// the rest is the shell that reads files and answers requests.

import { createServer } from 'node:http';
import { readFile, appendFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FEEDBACK_ENDPOINT, FEEDBACK_FILE, FEEDBACK_HEADER, formatEntry, parseEntry } from '../dev/feedback/entry.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const HOST = '127.0.0.1';
const IPV6_HOST = '::1';
const MAX_BODY = 64 * 1024;

// URL paths under this are served from dev/ instead of public/.
export const DEV_PREFIX = '/__dev/';
export const OVERLAY_SRC = `${DEV_PREFIX}feedback/overlay.js`;

// What public/_headers sets on the deployed site: SharedArrayBuffer, and so
// the whole animation model, needs the page cross-origin isolated.
export const ISOLATION_HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.lua': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

export function contentType(path) {
    return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

// The file a GET for `urlPath` reads, as { root: 'public' | 'dev', path }
// relative to that root, or null for a path that leaves its root.
export function resolvePath(urlPath) {
    let path;
    try {
        path = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null;
    }
    const dev = path.startsWith(DEV_PREFIX);
    const rel = normalize((dev ? path.slice(DEV_PREFIX.length) : path).replace(/^\/+/, ''));
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes('\0')) return null;
    if (dev) return { root: 'dev', path: rel };
    return { root: 'public', path: rel === '.' || rel === '' || path.endsWith('/') ? join(rel, 'index.html') : rel };
}

// The page with the overlay's script added at the end of its body.
export function injectOverlay(html) {
    const tag = `<script type="module" src="${OVERLAY_SRC}"></script>\n`;
    const at = html.lastIndexOf('</body>');
    return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}

// Whether a POST came from this server's own pages: its Origin, which
// browsers send on every POST, must be this host.
export function fromOwnPage(origin, host) {
    return typeof origin === 'string' && typeof host === 'string' && origin === `http://${host}`;
}

// ---- The shell ----

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > MAX_BODY) reject(new Error('body too large'));
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

// Appends `text` to `file`, starting a new file with its header.
async function record(file, text) {
    try {
        await writeFile(file, FEEDBACK_HEADER + text, { flag: 'wx' });
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        await appendFile(file, text);
    }
}

async function feedback(req, res) {
    if (req.method !== 'POST') return reply(res, 405, 'POST only');
    if (!fromOwnPage(req.headers.origin, req.headers.host)) return reply(res, 403, 'not from this server');
    let entry;
    try {
        entry = parseEntry(JSON.parse(await readBody(req)));
    } catch {
        entry = null;
    }
    if (!entry) return reply(res, 400, 'not a feedback entry');
    try {
        await record(join(REPO, FEEDBACK_FILE), formatEntry(entry, new Date()));
        console.log(`ui-feedback: ${entry.selector} on ${entry.page}`);
        reply(res, 204);
    } catch (err) {
        console.error(`ui-feedback: ${err}`);
        reply(res, 500, 'could not write the feedback file');
    }
}

function reply(res, status, text = '', headers = {}) {
    res.writeHead(status, { ...ISOLATION_HEADERS, ...headers });
    res.end(text);
}

async function serveFile(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, 'GET only');
    const target = resolvePath(req.url);
    if (!target) return reply(res, 404, 'not found');
    let body;
    try {
        body = await readFile(join(REPO, target.root, target.path));
    } catch {
        return reply(res, 404, 'not found');
    }
    if (target.root === 'public' && target.path === 'index.html') body = injectOverlay(body.toString('utf8'));
    res.writeHead(200, {
        ...ISOLATION_HEADERS,
        'Content-Type': contentType(target.path),
        'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
}

function handle(req, res) {
    const answer = req.url.split('?')[0] === FEEDBACK_ENDPOINT ? feedback : serveFile;
    answer(req, res).catch((err) => {
        console.error(err);
        if (!res.headersSent) reply(res, 500, 'server error');
    });
}

// Listens on the loopback addresses only, IPv4 and (where there is one)
// IPv6, since "localhost" may resolve to either.
export function start(port) {
    createServer(handle).listen(port, HOST, () => {
        console.log(`Lua Turtle dev server: http://localhost:${port}`);
        console.log(`Option-click any element to leave feedback in ${FEEDBACK_FILE}`);
    });
    createServer(handle).listen(port, IPV6_HOST).on('error', () => { /* no IPv6 loopback */ });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    start(Number(process.argv[2]) || 5520);
}
