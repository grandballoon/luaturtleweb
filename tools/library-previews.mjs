// tools/library-previews.mjs
// Makes the /library page's preview videos: for each example in
// public/library/catalog.json, a short looping MP4 of its program drawing
// (library/previews/<id>.mp4) and a WebP of the finished drawing to show
// before it plays (<id>.webp).
//
// Run from the repo root, after `npm install`:
//   npm run previews                 the examples whose program changed
//   npm run previews -- --all        every example
//   npm run previews -- rose-curve   just these
//
// It starts the dev server, loads its dev-only recorder page
// (dev/library-recorder/) in headless Chromium through Playwright, and
// pipes the frames the page renders into ffmpeg, which must be on the PATH.
// previews/manifest.json records each preview's program by its hash, so a
// changed program is remade, and test/library_test.mjs fails while any
// preview is stale.
//
// The decisions are pure exported functions (test/library_test.mjs); the
// rest is the shell that runs the browser and ffmpeg.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIBRARY = join(REPO, 'public', 'library');
const PREVIEWS = join(LIBRARY, 'previews');
const MANIFEST = join(PREVIEWS, 'manifest.json');
const PORT = 5538;

// What every preview is made with. Changing any of it changes every hash,
// so the next run remakes them all.
export const SETTINGS = {
    runWidth: 800,             // the canvas the program runs on: screen_width(), screen_height()
    runHeight: 600,
    videoWidth: 240,           // the video, in CSS px, rendered at 2x
    videoHeight: 180,
    scale: 2,
    margin: 8,                 // px of paper kept around the drawing
    timeline: { fps: 30, startHold: 300, endHold: 2000, minDraw: 4000, maxDraw: 8000 },
    crf: 27,
};

// The hash a preview is made from: its program and the settings.
export function previewHash(code) {
    return createHash('sha256').update(JSON.stringify(SETTINGS)).update(code).digest('hex').slice(0, 16);
}

// The ids to make: the ones named, or with all, every one, or else those
// whose hash differs from the manifest's.
export function toMake(ids, hashes, manifest, { named = [], all = false } = {}) {
    if (named.length) return ids.filter((id) => named.includes(id));
    return ids.filter((id) => all || manifest[id] !== hashes[id]);
}

// ---- The shell ----

function startServer() {
    const server = spawn(process.execPath, [join(REPO, 'tools', 'dev-server.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.stdout.on('data', (chunk) => {
            if (String(chunk).includes('dev server')) resolve(server);
        });
    });
}

// Encodes base64 PNG frames (null repeats the last) into an MP4.
function encode(frames, file) {
    const { fps } = SETTINGS.timeline;
    const ffmpeg = spawn('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
        '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(SETTINGS.crf),
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
        file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    return new Promise((resolve, reject) => {
        ffmpeg.on('error', (err) => reject(new Error(`could not run ffmpeg: ${err.message}`)));
        ffmpeg.on('close', (status) => (status === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${status}`))));
        let last = null;
        for (const frame of frames) {
            last = frame ? Buffer.from(frame, 'base64') : last;
            ffmpeg.stdin.write(last);
        }
        ffmpeg.stdin.end();
    });
}

async function main(argv) {
    const all = argv.includes('--all');
    const named = argv.filter((arg) => !arg.startsWith('--'));

    const catalog = JSON.parse(await readFile(join(LIBRARY, 'catalog.json'), 'utf8'));
    const ids = catalog.examples.map((example) => example.id);
    const unknown = named.filter((id) => !ids.includes(id));
    if (unknown.length) throw new Error(`not in the catalog: ${unknown.join(', ')}`);

    const programs = {};
    const hashes = {};
    for (const id of ids) {
        programs[id] = await readFile(join(LIBRARY, 'programs', `${id}.lua`), 'utf8');
        hashes[id] = previewHash(programs[id]);
    }
    let manifest = {};
    try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')); } catch { /* none yet */ }

    const make = toMake(ids, hashes, manifest, { named, all });
    if (!make.length) {
        console.log('Every preview is up to date (--all remakes them anyway).');
        return;
    }
    await mkdir(PREVIEWS, { recursive: true });

    const { chromium } = await import('playwright');
    const server = await startServer();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({
            viewport: { width: SETTINGS.videoWidth, height: SETTINGS.videoHeight },
            deviceScaleFactor: SETTINGS.scale,
        });
        page.on('pageerror', (err) => console.error(`recorder: ${err.message}`));
        await page.goto(`http://127.0.0.1:${PORT}/__dev/library-recorder/index.html`);
        await page.waitForFunction(() => typeof window.recordPreview === 'function');
        await page.evaluate(() => window.recorderReady);

        for (const id of make) {
            const started = Date.now();
            const result = await page.evaluate(
                ([code, options]) => window.recordPreview(code, options),
                [programs[id], { runWidth: SETTINGS.runWidth, runHeight: SETTINGS.runHeight, timeline: SETTINGS.timeline, margin: SETTINGS.margin }],
            );
            if (result.error) throw new Error(`${id} fails: ${result.error}`);
            if (result.truncated) throw new Error(`${id} posts too many frames to record; batch them with tracer(n)`);

            await encode(result.frames, join(PREVIEWS, `${id}.mp4`));
            await writeFile(join(PREVIEWS, `${id}.webp`), Buffer.from(result.poster, 'base64'));
            manifest[id] = hashes[id];
            const seconds = result.frames.length / SETTINGS.timeline.fps;
            console.log(`${id}: ${seconds.toFixed(1)} s of video in ${((Date.now() - started) / 1000).toFixed(1)} s`);
        }
    } finally {
        await browser.close();
        server.kill();
        // Only examples still in the catalog, in its order.
        const kept = Object.fromEntries(ids.filter((id) => manifest[id]).map((id) => [id, manifest[id]]));
        await writeFile(MANIFEST, `${JSON.stringify(kept, null, 2)}\n`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
}
