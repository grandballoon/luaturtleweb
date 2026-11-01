// recording.js
// Pure functions over a recorded program: the frames worker.js's "record"
// collects, each {segments, turtles, bgcolor, prints, work, delay}.
// Frame 0 is the blank canvas the program starts from.
//
// Used by command-preview.js, which plays a recording in the command
// reference, and by the library's preview recorder (dev/library-recorder/),
// which turns one into a video. Both space frames and fit the view the same
// way, so a preview looks like the program running on the real canvas,
// zoomed out. test/recording_test.mjs covers them.

const TURTLE_RADIUS = 10;     // the arrowhead's reach, in turtle units (renderer.js)
const ROUND_TRIP_MS = 0.5;    // a live frame's post, render and ack, roughly

// Accept either a JS array or a key-ordered object (Wasmoon's empty table).
export function items(seq) {
    if (!seq) return [];
    return Array.isArray(seq) ? seq : Object.values(seq);
}

// The turtle-space box every frame draws in, as {minX, minY, maxX, maxY}.
export function drawingBounds(frames) {
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

// When each frame goes up, in ms from the start, as a live run spaces them:
// the time spent computing it (work, unless measured is false), then the
// frame, then the pause speed() sets after it. Frame 0, the blank canvas,
// shows for startHold first. A recorder that renders off the clock leaves
// out work, which measures the machine rather than the program.
export function frameTimes(frames, { startHold = 0, measured = true } = {}) {
    const times = [0];
    let t = startHold;
    for (let i = 1; i < frames.length; i++) {
        if (measured) t += frames[i].work;
        times.push(t);
        t += frames[i].delay + ROUND_TRIP_MS;
    }
    return times;
}

// The index of the frame on screen at time t, given frameTimes' times.
export function frameAt(times, t) {
    let index = times.length - 1;
    while (index > 0 && times[index] > t) index--;
    return index;
}

// The view that centers bounds in a width × height canvas, keeping margin
// px of paper around it, scaled down (never up) to fit: {scale, centerX,
// centerY}, as Renderer's viewScale and viewCenterX/Y.
export function fitView(bounds, width, height, margin) {
    const w = width - 2 * margin;
    const h = height - 2 * margin;
    const { minX, minY, maxX, maxY } = bounds;
    return {
        scale: Math.max(0.05, Math.min(
            1,
            maxX > minX ? w / (maxX - minX) : 1,
            maxY > minY ? h / (maxY - minY) : 1,
        )),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
    };
}

// Which recorded frame each frame of a fps video shows, given frameTimes'
// times (measured: false, so they are the program's own pacing): the blank
// canvas for startHold ms, the drawing, then the finished drawing for
// endHold ms. The drawing plays at its own pace, stretched to last at least
// minDraw ms and squeezed to last at most maxDraw, so a quick program can
// still be watched and a slow one still fits. A program that draws in one
// frame shows only the finished drawing.
export function videoFrames(times, { fps, startHold, endHold, minDraw, maxDraw }) {
    const last = times.length - 1;
    const drawn = times[last];
    if (drawn <= 0) return Array(Math.round((startHold + endHold) * fps / 1000)).fill(last);
    const scale = Math.min(Math.max(1, minDraw / drawn), maxDraw / drawn);
    const total = startHold + drawn * scale + endHold;
    const indices = [];
    for (let i = 0; i < Math.round(total * fps / 1000); i++) {
        const t = i * 1000 / fps;
        indices.push(t < startHold ? 0 : frameAt(times, (t - startHold) / scale));
    }
    return indices;
}
