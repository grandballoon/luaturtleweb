// command-preview.js
// A miniature canvas that plays a short Lua program, looping, the way the
// real canvas would show it running.
//
// Faithful by construction: the program runs in its own copy of worker.js,
// the same Lua and turtle library as a real run, which records every frame
// it would have posted ("record"). The frames are drawn by the same
// Renderer as the real canvas, spaced as a live run spaces them: the pause
// speed() sets after each, plus the time the worker spent computing it, as
// measured while recording (recording.js). The only difference is the view: it is
// centered on the drawing, and scaled down if the drawing would not fit.
//
// Owns: its worker (separate, so a preview never waits on or disturbs the
// learner's own run, and started only when the first program is shown, so
// a page that never shows one never loads a second Lua), the miniature
// Renderer, fitting the view, playback,
// and the program's print() output shown under the canvas. What to play is
// up to the owner (command-reference.js): show(code) plays it, stop() stops.

import { Renderer } from './renderer.js';
import { drawingBounds, fitView, frameAt, frameTimes } from './recording.js';

const START_HOLD_MS  = 600;    // the blank canvas, before the program's first frame
const END_HOLD_MS    = 2000;   // the finished drawing, before the loop restarts
const FIT_MARGIN     = 16;     // px of paper kept around the drawing

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

    let worker = null;

    function startWorker() {
        worker = new Worker('worker.js');
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
    }

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
        const times = frameTimes(frames, { startHold: START_HOLD_MS });
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
        const { times, duration } = playing;
        const t = reducedMotion.matches ? Infinity : (now - startedAt) % duration;
        const index = frameAt(times, t);
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
        const view = fitView(playing.bounds, canvas.width / dpr, canvas.height / dpr, FIT_MARGIN);
        renderer.viewScale = view.scale;
        renderer.viewCenterX = view.centerX;
        renderer.viewCenterY = view.centerY;
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
        if (!worker) startWorker();
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
