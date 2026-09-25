// command-preview.js
// A miniature canvas that plays a short Lua program, looping, the way the
// real canvas would show it running.
//
// Faithful by construction: the program runs in its own copy of worker.js,
// the same Lua and turtle library as a real run, which records every frame
// it would have posted ("record"). The frames are drawn by the same
// Renderer as the real canvas, spaced as a live run spaces them: the pause
// speed() sets after each, plus the time the worker spent computing it, as
// measured while recording. The only difference is the view: it is
// centered on the drawing, and scaled down if the drawing would not fit.
//
// Owns: its worker (separate, so a preview never waits on or disturbs the
// learner's own run), the miniature Renderer, fitting the view, playback,
// and the program's print() output shown under the canvas. What to play is
// up to the owner (command-reference.js): show(code) plays it, stop() stops.

import { Renderer } from './renderer.js';

const START_HOLD_MS  = 600;    // the blank canvas, before the program's first frame
const END_HOLD_MS    = 2000;   // the finished drawing, before the loop restarts
const ROUND_TRIP_MS  = 0.5;    // a live frame's post, render and ack, roughly
const FIT_MARGIN     = 16;     // px of paper kept around the drawing
const TURTLE_RADIUS  = 10;     // the arrowhead's reach, in turtle units (renderer.js)

// Accept either a JS array or a key-ordered object (Wasmoon's empty table).
function items(seq) {
    if (!seq) return [];
    return Array.isArray(seq) ? seq : Object.values(seq);
}

// The turtle-space box every frame draws in, as {minX, minY, maxX, maxY}.
function drawingBounds(frames) {
    const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const add = (x, y, r = 0) => {
        b.minX = Math.min(b.minX, x - r); b.maxX = Math.max(b.maxX, x + r);
        b.minY = Math.min(b.minY, y - r); b.maxY = Math.max(b.maxY, y + r);
    };
    for (const frame of frames) {
        for (const seg of items(frame.segments)) {
            if (seg.type === 'line') {
                add(seg.from[0], seg.from[1], (seg.width || 2) / 2);
                add(seg.to[0], seg.to[1], (seg.width || 2) / 2);
            } else if (seg.type === 'fill') {
                for (const v of items(seg.vertices)) add(v[0], v[1]);
            } else if (seg.type === 'dot') {
                add(seg.pos[0], seg.pos[1], seg.size / 2);
            } else if (seg.type === 'stamp') {
                add(seg.pos[0], seg.pos[1], TURTLE_RADIUS);
            } else if (seg.type === 'text') {
                // Drawn with textBaseline 'bottom'; the width is an estimate.
                const size  = seg.font && seg.font[1] ? seg.font[1] : 20;
                const width = String(seg.content || '').length * size * 0.6;
                const left  = { left: 0, center: -width / 2, right: -width }[seg.align || 'left'] ?? 0;
                add(seg.pos[0] + left, seg.pos[1]);
                add(seg.pos[0] + left + width, seg.pos[1] + size);
            }
        }
        for (const t of items(frame.turtles)) {
            if (t.visible) add(t.x, t.y, TURTLE_RADIUS);
        }
    }
    return Number.isFinite(b.minX) ? b : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export function createCommandPreview({ canvas, output, canvasSize }) {
    const renderer = new Renderer(canvas);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    const cache = new Map();   // "<width>x<height>\n<code>" → recording
    let ready    = false;      // the worker's VM has loaded
    let wanted   = null;       // code the owner asked to show, or null when stopped
    let inFlight = null;       // cache key of the record request the worker is on
    let playing  = null;       // the recording on screen
    let startedAt = 0;
    let shown    = -1;         // index of the frame on screen
    let raf      = 0;

    // ---- Recording ----

    const worker = new Worker('worker.js');
    worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'ready') {
            ready = true;
            request();
        } else if (msg.type === 'recording') {
            const key = inFlight;
            inFlight = null;
            cache.set(key, prepare(msg.frames, msg.error));
            request();
        } else if (msg.type === 'init-error') {
            console.warn('Command preview could not start Lua:', msg.message);
        }
    };
    worker.postMessage({ type: 'init' });

    function keyFor(code) {
        const { width, height } = canvasSize();
        return { key: `${width}x${height}\n${code}`, width, height };
    }

    // Plays the wanted code if it has been recorded, and otherwise asks the
    // worker to record it. One request at a time: the worker runs them in
    // turn, so a burst of selections would otherwise queue up behind each other.
    function request() {
        if (wanted === null) return;
        const { key, width, height } = keyFor(wanted);
        const recording = cache.get(key);
        if (recording) {
            if (recording !== playing) play(recording);
            return;
        }
        if (!ready || inFlight !== null) return;
        inFlight = key;
        worker.postMessage({ type: 'record', code: wanted, canvasWidth: width, canvasHeight: height });
    }

    // Adds what playback needs: when each frame goes up, how long one loop
    // takes, the output printed by each frame, and the drawing's extent.
    // Frame 0 is the blank canvas the program starts from.
    function prepare(frames, error) {
        const times = [0];
        let t = START_HOLD_MS;
        for (let i = 1; i < frames.length; i++) {
            t += frames[i].work;
            times.push(t);
            t += frames[i].delay + ROUND_TRIP_MS;
        }
        const lines = [];
        const printedBy = frames.map((frame) => {
            lines.push(...frame.prints);
            return lines.length;
        });
        return {
            frames, times, lines, printedBy, error,
            duration: times[times.length - 1] + END_HOLD_MS,
            bounds: drawingBounds(frames),
        };
    }

    // ---- Playback ----

    function play(recording) {
        playing = recording;
        shown = -1;
        startedAt = performance.now();
        buildOutput();
        fit();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
    }

    function tick(now) {
        raf = 0;
        const { frames, times, duration } = playing;
        const t = reducedMotion.matches ? Infinity : (now - startedAt) % duration;
        let index = frames.length - 1;
        while (times[index] > t) index--;
        if (index !== shown) drawFrame(index);
        if (!reducedMotion.matches) raf = requestAnimationFrame(tick);
    }

    function drawFrame(index) {
        shown = index;
        const frame = playing.frames[index];
        renderer.applyFrame(frame.segments, frame.turtles, frame.bgcolor);
        const printed = playing.printedBy[index];
        output.querySelectorAll('.preview-line').forEach((line, i) => {
            line.classList.toggle('pending', i >= printed);
        });
    }

    // Every line the program prints is laid out from the start, and revealed
    // as playback reaches it, so the canvas above never changes size mid-loop.
    function buildOutput() {
        const { lines, error } = playing;
        output.replaceChildren(...lines.map((text) => {
            const line = document.createElement('div');
            line.className = 'preview-line pending';
            line.textContent = text;
            return line;
        }));
        if (error) {
            const line = document.createElement('div');
            line.className = 'preview-line error';
            line.textContent = error;
            output.append(line);
        }
        output.hidden = !lines.length && !error;
    }

    // Centers the view on the drawing, scaled down (never up) to fit.
    function fit() {
        if (!playing) return;
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.width / dpr - 2 * FIT_MARGIN;
        const h = canvas.height / dpr - 2 * FIT_MARGIN;
        const { minX, minY, maxX, maxY } = playing.bounds;
        renderer.viewScale = Math.max(0.05, Math.min(
            1,
            maxX > minX ? w / (maxX - minX) : 1,
            maxY > minY ? h / (maxY - minY) : 1,
        ));
        renderer.viewCenterX = (minX + maxX) / 2;
        renderer.viewCenterY = (minY + maxY) / 2;
        renderer.redraw();
    }

    // The canvas is sized by its box, which is hidden while the reference
    // is closed; this also catches the first layout after it opens.
    new ResizeObserver(() => {
        renderer.resize();
        fit();
    }).observe(canvas.parentElement);

    function show(code) {
        wanted = code;
        request();
    }

    function stop() {
        wanted = null;
        playing = null;
        cancelAnimationFrame(raf);
        raf = 0;
    }

    return { show, stop };
}
