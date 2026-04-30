// renderer.js
// Main thread Canvas2D renderer for Lua Turtle web.
// Owns: canvas element, offscreen commit canvas, coordinate transform,
//       viewport (zoom/pan), grid, turtle head drawing.
//
// Used by index.html. Call Renderer.init(canvasEl) once, then
// renderer.applyFrame(frameMsg) on each worker "frame" message.

export class Renderer {
    constructor(canvasEl) {
        this.canvas      = canvasEl;
        this.ctx         = canvasEl.getContext('2d');
        this.commitCanvas = null;
        this.commitCtx   = null;

        // Viewport
        this.viewScale   = 1;
        this.viewCenterX = 0;
        this.viewCenterY = 0;
        this.ZOOM_MIN    = 0.05;
        this.ZOOM_MAX    = 20;
        this.ZOOM_STEP   = 1.15;

        this.gridVisible = localStorage.getItem('luaturtle-grid') === 'true';

        // Latest data from worker (used for export and zoom-triggered full redraws)
        this._lastBgColor  = [0.07, 0.07, 0.07, 1];
        this._lastTurtles  = [];
        this._lastSegments = [];

        // Incremental rendering state.
        // After each frame, _lastRenderedCount tracks how many segments are already
        // painted on the commit canvas. _lastBoundaryLogIndex is the _log_index of
        // the last rendered segment — if it still matches next frame, the prefix is
        // intact and we can append-only (O(1) per frame). Any structural change
        // (clear/undo/clearstamp) shifts the visible list and the check fails,
        // falling back to a full redraw.
        // _needsViewRedraw is set by zoom/pan so the next frame redraws at new scale.
        this._lastRenderedCount    = 0;
        this._lastBoundaryLogIndex = -1;
        this._needsViewRedraw      = false;

        this._initCommitCanvas();
    }

    // ---- Coordinate transform ----

    screenX(tx) {
        const cssW = this.canvas.width / (window.devicePixelRatio || 1);
        return cssW / 2 + (tx - this.viewCenterX) * this.viewScale;
    }

    screenY(ty) {
        const cssH = this.canvas.height / (window.devicePixelRatio || 1);
        return cssH / 2 - (ty - this.viewCenterY) * this.viewScale;
    }

    // ---- Color ----

    static colorCSS(r, g, b, a) {
        return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})`;
    }

    // ---- Commit canvas ----

    _initCommitCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w   = this.canvas.width  / dpr;
        const h   = this.canvas.height / dpr;
        this.commitCanvas = document.createElement('canvas');
        this.commitCanvas.width  = this.canvas.width;
        this.commitCanvas.height = this.canvas.height;
        this.commitCtx = this.commitCanvas.getContext('2d');
        this.commitCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize() {
        const panel = this.canvas.parentElement;
        const w = panel.clientWidth;
        const h = panel.clientHeight;
        if (w === 0 || h === 0) return;
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width  = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this._initCommitCanvas();
        this._redrawAllSegments(this._lastSegments);
        this._syncIncrementalState();
    }

    // ---- Apply a frame from the worker ----
    // Normally draws only segments added since the last frame (O(1) per frame).
    // Falls back to a full clear+redraw when the visible segment list has shrunk
    // or shifted — which only happens on clear/undo/clearstamp — or when the
    // viewport changed (zoom/pan).

    applyFrame(segments, turtles, bgcolor) {
        this._lastBgColor  = bgcolor  || this._lastBgColor;
        this._lastTurtles  = turtles  || [];
        this._lastSegments = segments || [];

        const segs = this._lastSegments;
        const n    = segs.length;
        const prev = this._lastRenderedCount;

        // The boundary check: if the segment at position [prev-1] still has the
        // same _log_index we recorded, the prefix on the canvas is still valid.
        const prefixIntact = prev > 0 && n >= prev
            && segs[prev - 1]?._log_index === this._lastBoundaryLogIndex;

        if (!prefixIntact || this._needsViewRedraw) {
            this._redrawAllSegments(segs);
        } else if (n > prev) {
            this._drawSegmentRange(segs, prev, n);
        }

        this._syncIncrementalState();
        this._needsViewRedraw = false;
        this._renderOverlay(this._lastBgColor, this._lastTurtles);
    }

    // Append segments[from..to) onto the commit canvas without clearing it.
    _drawSegmentRange(segments, from, to) {
        for (let i = from; i < to; i++) {
            const seg = segments[i];
            if (seg && seg.type === 'fill') this._drawFill(seg);
        }
        for (let i = from; i < to; i++) {
            const seg = segments[i];
            if (!seg || seg.type === 'fill' || seg.type === 'clear') continue;
            this._drawSegment(seg);
        }
    }

    // Record the current segment count and boundary index after any draw.
    _syncIncrementalState() {
        const segs = this._lastSegments;
        const n    = segs.length;
        this._lastRenderedCount    = n;
        this._lastBoundaryLogIndex = n > 0 ? segs[n - 1]._log_index : -1;
    }

    _redrawAllSegments(segments) {
        const dpr = window.devicePixelRatio || 1;
        const w   = this.commitCanvas.width  / dpr;
        const h   = this.commitCanvas.height / dpr;
        this.commitCtx.clearRect(0, 0, w, h);

        if (!segments) return;

        const n = Array.isArray(segments) ? segments.length
                                          : Object.keys(segments).length;

        // Draw fills first (behind lines)
        for (let i = 0; i < n; i++) {
            const seg = segments[i] ?? segments[i + 1];
            if (seg && seg.type === 'fill') this._drawFill(seg);
        }
        // Then lines, dots, text, stamps
        for (let i = 0; i < n; i++) {
            const seg = segments[i] ?? segments[i + 1];
            if (!seg || seg.type === 'fill' || seg.type === 'clear') continue;
            this._drawSegment(seg);
        }
    }

    _drawSegment(seg) {
        const cc = this.commitCtx;
        if (seg.type === 'line') {
            const c = seg.color;
            cc.beginPath();
            cc.moveTo(this.screenX(seg.from[0]), this.screenY(seg.from[1]));
            cc.lineTo(this.screenX(seg.to[0]),   this.screenY(seg.to[1]));
            cc.strokeStyle = Renderer.colorCSS(c[0], c[1], c[2], c[3]);
            cc.lineWidth   = (seg.width || 2) * this.viewScale;
            cc.lineCap     = 'round';
            cc.stroke();

        } else if (seg.type === 'dot') {
            const c = seg.color;
            cc.save();
            cc.fillStyle = Renderer.colorCSS(c[0], c[1], c[2], c[3]);
            cc.beginPath();
            cc.arc(this.screenX(seg.pos[0]), this.screenY(seg.pos[1]),
                (seg.size / 2) * this.viewScale, 0, 2 * Math.PI);
            cc.fill();
            cc.restore();

        } else if (seg.type === 'text') {
            const c        = seg.color;
            const fontSize = (seg.font && seg.font[1] ? seg.font[1] : 20) * this.viewScale;
            cc.save();
            cc.font         = fontSize + 'px sans-serif';
            cc.fillStyle    = Renderer.colorCSS(c[0], c[1], c[2], c[3]);
            cc.textBaseline = 'bottom';
            cc.textAlign    = seg.align || 'left';
            cc.fillText(seg.content || '', this.screenX(seg.pos[0]), this.screenY(seg.pos[1]));
            cc.restore();

        } else if (seg.type === 'stamp') {
            this._drawTurtleShape(
                cc,
                seg.pos[0], seg.pos[1], seg.heading,
                seg.color, seg.fill_color, seg.size
            );
        }
    }

    _drawFill(seg) {
        const cc       = this.commitCtx;
        const vertices = seg.vertices;
        const c        = seg.color;
        if (!vertices) return;

        const n = Array.isArray(vertices) ? vertices.length
                                        : Object.keys(vertices).length;
        if (n < 3) return;

        cc.save();
        cc.fillStyle = Renderer.colorCSS(c[0], c[1], c[2], c[3]);
        cc.beginPath();

        const v0 = vertices[0];
        cc.moveTo(this.screenX(v0[0]), this.screenY(v0[1]));
        for (let i = 1; i < n; i++) {
            const v = vertices[i];
            if (v) cc.lineTo(this.screenX(v[0]), this.screenY(v[1]));
        }
        cc.closePath();
        cc.fill();
        cc.restore();
    }

    _renderOverlay(bgcolor, turtles) {
        const ctx  = this.ctx;
        const dpr  = window.devicePixelRatio || 1;
        const w    = this.canvas.width  / dpr;
        const h    = this.canvas.height / dpr;

        // Background
        ctx.fillStyle = Renderer.colorCSS(bgcolor[0], bgcolor[1], bgcolor[2], bgcolor[3]);
        ctx.fillRect(0, 0, w, h);

        // Grid
        if (this.gridVisible) this._drawGrid(w, h);

        // Committed segments
        if (this.commitCanvas) ctx.drawImage(this.commitCanvas, 0, 0, w, h);

        // Turtle heads
        if (turtles) {
            const n = Array.isArray(turtles) ? turtles.length
                                             : Object.keys(turtles).length;
            for (let i = 0; i < n; i++) {
                const t = turtles[i] ?? turtles[i + 1];
                if (t && t.visible) {
                    this._drawTurtleHead(ctx, t.x, t.y, t.angle,
                        [t.pen_r, t.pen_g, t.pen_b, t.pen_a]);
                }
            }
        }
    }

    _drawTurtleHead(ctx, tx, ty, angle, penColor) {
        const sx = this.screenX(tx);
        const sy = this.screenY(ty);
        const screenAngle = -angle * Math.PI / 180;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(screenAngle);
        const s = 10 * this.viewScale;
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(-s * 0.6,  s * 0.6);
        ctx.lineTo(-s * 0.6, -s * 0.6);
        ctx.closePath();
        ctx.fillStyle = Renderer.colorCSS(0.2, 0.9, 0.4, 1);
        ctx.fill();
        ctx.restore();
    }

    _drawTurtleShape(cc, tx, ty, heading, penColor, fillColor, size) {
        const rad    = heading * Math.PI / 180;
        const len    = (size || 2) * 6 * this.viewScale;
        const halfW  = len * 0.4;
        const cosH   = Math.cos(rad), sinH = Math.sin(rad);
        const cosP   = Math.cos(rad + Math.PI / 2), sinP = Math.sin(rad + Math.PI / 2);

        const tipX  = tx + cosH * len;
        const tipY  = ty + sinH * len;
        const leftX = tx - cosH * len * 0.3 + cosP * halfW;
        const leftY = ty - sinH * len * 0.3 + sinP * halfW;
        const rightX= tx - cosH * len * 0.3 - cosP * halfW;
        const rightY= ty - sinH * len * 0.3 - sinP * halfW;

        const sx1 = this.screenX(tipX),   sy1 = this.screenY(tipY);
        const sx2 = this.screenX(leftX),  sy2 = this.screenY(leftY);
        const sx3 = this.screenX(rightX), sy3 = this.screenY(rightY);

        if (fillColor) {
            const c = fillColor;
            cc.fillStyle = Renderer.colorCSS(c[1], c[2], c[3], c[4]);
            cc.beginPath();
            cc.moveTo(sx1, sy1); cc.lineTo(sx2, sy2); cc.lineTo(sx3, sy3);
            cc.closePath(); cc.fill();
        }
        if (penColor) {
            const c = penColor;
            cc.strokeStyle = Renderer.colorCSS(c[1], c[2], c[3], c[4]);
            cc.lineWidth = (size || 2) * this.viewScale;
            cc.beginPath();
            cc.moveTo(sx1, sy1); cc.lineTo(sx2, sy2);
            cc.moveTo(sx2, sy2); cc.lineTo(sx3, sy3);
            cc.moveTo(sx3, sy3); cc.lineTo(sx1, sy1);
            cc.stroke();
        }
    }

    // ---- Grid ----

    _drawGrid(w, h) {
        const pitch = 60;
        const cx    = this.screenX(0);
        const cy    = this.screenY(0);
        const ctx   = this.ctx;

        ctx.save();
        ctx.lineWidth = 1;

        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.beginPath();
        for (let x = ((cx % pitch) + pitch) % pitch; x <= w; x += pitch) {
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
        }
        for (let y = ((cy % pitch) + pitch) % pitch; y <= h; y += pitch) {
            ctx.moveTo(0, y); ctx.lineTo(w, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
        ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.stroke();

        ctx.restore();
    }

    // ---- Viewport ----

    zoomAt(factor, sx, sy) {
        const dpr  = window.devicePixelRatio || 1;
        const cssW = this.canvas.width  / dpr;
        const cssH = this.canvas.height / dpr;
        const txB  = (sx - cssW / 2) / this.viewScale + this.viewCenterX;
        const tyB  = -(sy - cssH / 2) / this.viewScale + this.viewCenterY;
        this.viewScale = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, this.viewScale * factor));
        this.viewCenterX = txB - (sx - cssW / 2) / this.viewScale;
        this.viewCenterY = tyB + (sy - cssH / 2) / this.viewScale;
        this._needsViewRedraw = true;
    }

    zoomCenter(factor) {
        const dpr  = window.devicePixelRatio || 1;
        const cssW = this.canvas.width  / dpr;
        const cssH = this.canvas.height / dpr;
        this.zoomAt(factor, cssW / 2, cssH / 2);
    }

    resetView() {
        this.viewScale   = 1;
        this.viewCenterX = 0;
        this.viewCenterY = 0;
        this._needsViewRedraw = true;
    }

    // Force an immediate redraw of the commit canvas and overlay.
    // Call after zoom/pan when no animation is running.
    redraw() {
        this._redrawAllSegments(this._lastSegments);
        this._syncIncrementalState();
        this._needsViewRedraw = false;
        this._renderOverlay(this._lastBgColor, this._lastTurtles);
    }

    zoomLabel() {
        return Math.round(this.viewScale * 100) + '%';
    }

    // ---- Export ----

    exportPNG() {
        const dpr  = window.devicePixelRatio || 1;
        const cssW = this.canvas.width  / dpr;
        const cssH = this.canvas.height / dpr;
        const tmp  = document.createElement('canvas');
        tmp.width  = this.canvas.width;
        tmp.height = this.canvas.height;
        const tc   = tmp.getContext('2d');
        tc.setTransform(dpr, 0, 0, dpr, 0, 0);

        const bg = this._lastBgColor;
        tc.fillStyle = Renderer.colorCSS(bg[1], bg[2], bg[3], bg[4]);
        tc.fillRect(0, 0, cssW, cssH);
        tc.drawImage(this.commitCanvas, 0, 0, cssW, cssH);

        for (const t of (this._lastTurtles || [])) {
            if (t && t.visible) {
                this._drawTurtleHead(tc, t.x, t.y, t.angle,
                    [t.pen_r, t.pen_g, t.pen_b, t.pen_a]);
            }
        }

        tmp.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = 'turtle.png';
            a.click();
            URL.revokeObjectURL(url);
        }, 'image/png');
    }
}