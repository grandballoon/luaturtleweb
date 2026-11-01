// dev/library-recorder/recorder.js
// Turns a library program into the frames of its preview video, for
// tools/library-previews.mjs, which loads this page in headless Chromium
// from the dev server and encodes what recordPreview returns.
//
// Faithful by construction, like the command reference's demos
// (command-preview.js): the program runs in worker.js's "record" mode, the
// same Lua and turtle library as a real run, and each frame is drawn by the
// real Renderer, centered on the drawing and scaled down to fit. Rendering
// is off the clock (recording.js's videoFrames picks the frame for each
// tick of the video), so the video is the same however fast the machine is.

import { Renderer } from '/renderer.js';
import { drawingBounds, fitView, frameTimes, videoFrames } from '/recording.js';

const canvas = document.getElementById('canvas');
const renderer = new Renderer(canvas);
renderer.resize();

const worker = new Worker('/worker.js');
const pending = new Map();
let nextId = 0;

window.recorderReady = new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'ready') resolve();
        else if (msg.type === 'init-error') reject(new Error(msg.message));
        else if (msg.type === 'recording') {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
        }
    };
});
worker.postMessage({ type: 'init' });

function record(code, width, height) {
    const id = nextId++;
    return new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ type: 'record', id, code, canvasWidth: width, canvasHeight: height });
    });
}

// The canvas as an image of the given type, base64 without its data: prefix.
function image(type, quality) {
    const url = canvas.toDataURL(type, quality);
    return url.slice(url.indexOf(',') + 1);
}

// The program run on a runWidth × runHeight canvas, as the video's frames:
// {frames: [base64 PNG, or null to repeat the one before], poster, error,
// truncated}, where poster is the finished drawing as a base64 WebP.
// The page's canvas is the video's size in CSS px.
window.recordPreview = async function recordPreview(code, { runWidth, runHeight, timeline, margin }) {
    await window.recorderReady;
    const { frames, error, truncated } = await record(code, runWidth, runHeight);
    if (error || truncated) return { frames: [], poster: null, error, truncated };

    const dpr = window.devicePixelRatio || 1;
    const view = fitView(drawingBounds(frames), canvas.width / dpr, canvas.height / dpr, margin);
    renderer.viewScale = view.scale;
    renderer.viewCenterX = view.centerX;
    renderer.viewCenterY = view.centerY;

    const indices = videoFrames(frameTimes(frames, { measured: false }), timeline);
    let shown = -1;
    const out = indices.map((index) => {
        if (index === shown) return null;
        shown = index;
        const frame = frames[index];
        renderer.applyFrame(frame.segments, frame.turtles, frame.bgcolor);
        return image('image/png');
    });
    // The last frame drawn is the finished drawing, held to the end.
    return { frames: out, poster: image('image/webp', 0.9), error: null, truncated: false };
};
