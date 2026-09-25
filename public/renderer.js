// renderer.js
// Main thread Canvas2D renderer for Lua Turtle web.
// Owns: canvas element, offscreen commit canvas, coordinate transform,
//       viewport (zoom/pan), grid, turtle head drawing.
//
// Used by app.js: construct once with the canvas element, then call
// renderer.applyFrame(segments, turtles, bgcolor) on each worker "frame"
// message. canvas-view.js drives the viewport (zoom/pan/grid).
//
// Lua sequences arrive from Wasmoon as 0-based JS arrays, except that an
// empty Lua table arrives as {} — hence the items() helper below.

// Accept either a JS array or a key-ordered object (Wasmoon's empty table).
function items(seq) {
    if (!seq) return [];
    return Array.isArray(seq) ? seq : Object.values(seq);
}

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

        this.gridVisible = false;
        this._redrawRaf  = 0;

        // Latest data from worker (used for export). Before the first frame
        // this is the default paper set in turtle_web.lua: white.
        this._lastBgColor  = [1, 1, 1, 1];
        this._lastTurtles  = [];
        this._lastSegments = [];

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

    // Overlays (grid, turtle head) pick contrasting colors from the
    // background, which the program can set to anything.
    _bgIsLight() {
        const [r, g, b] = this._lastBgColor;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
    }

    // ---- Commit canvas ----

    _initCommitCanvas() {
        const dpr = window.devicePixelRatio || 1;
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
        this.redraw();
    }

    // ---- Apply a frame from the worker ----
    // Redraws the full commit canvas from the visible segment list,
    // then composites with turtle heads.

    applyFrame(segments, turtles, bgcolor) {
        this._lastBgColor  = bgcolor  || this._lastBgColor;
        this._lastTurtles  = turtles  || [];
        this._lastSegments = segments || [];

        this.redraw();
    }

    redraw() {
        const dpr = window.devicePixelRatio || 1;
        this._redrawAllSegments(this._lastSegments);
        this._composite(this.ctx, this.canvas.width / dpr, this.canvas.height / dpr,
                        this.gridVisible);
    }

    // Coalesce viewport-driven redraws (wheel, drag, pinch) to one per frame.
    requestRedraw() {
        if (this._redrawRaf) return;
        this._redrawRaf = requestAnimationFrame(() => {
            this._redrawRaf = 0;
            this.redraw();
        });
    }

    _redrawAllSegments(segments) {
        const dpr = window.devicePixelRatio || 1;
        const w   = this.commitCanvas.width  / dpr;
        const h   = this.commitCanvas.height / dpr;
        this.commitCtx.clearRect(0, 0, w, h);

        const segs = items(segments);

        // Draw fills first (behind lines)
        for (const seg of segs) {
            if (seg && seg.type === 'fill') this._drawFill(seg);
        }
        // Then lines, dots, text, stamps
        for (const seg of segs) {
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
            this._drawStamp(cc, seg);
        }
    }

    _drawFill(seg) {
        const cc       = this.commitCtx;
        const vertices = items(seg.vertices);
        const c        = seg.color;
        if (vertices.length < 3) return;

        cc.save();
        cc.fillStyle = Renderer.colorCSS(c[0], c[1], c[2], c[3]);
        cc.beginPath();

        const v0 = vertices[0];
        cc.moveTo(this.screenX(v0[0]), this.screenY(v0[1]));
        for (let i = 1; i < vertices.length; i++) {
            const v = vertices[i];
            if (v) cc.lineTo(this.screenX(v[0]), this.screenY(v[1]));
        }
        cc.closePath();
        cc.fill();
        cc.restore();
    }

    // Background, optional grid, committed drawing, then turtle heads.
    // Shared by the live view and PNG export so the two cannot drift apart.
    _composite(ctx, w, h, withGrid) {
        const bg = this._lastBgColor;
        ctx.fillStyle = Renderer.colorCSS(bg[0], bg[1], bg[2], bg[3]);
        ctx.fillRect(0, 0, w, h);

        if (withGrid) this._drawGrid(ctx, w, h);

        if (this.commitCanvas) ctx.drawImage(this.commitCanvas, 0, 0, w, h);

        for (const t of items(this._lastTurtles)) {
            if (t && t.visible) this._drawTurtleHead(ctx, t.x, t.y, t.angle);
        }
    }

    // Traces the turtle arrowhead at a turtle-space position. Size is fixed
    // in turtle units, so heads and stamps scale with zoom like the drawing.
    _traceArrowhead(ctx, tx, ty, angle) {
        const s = 10 * this.viewScale;
        ctx.save();
        ctx.translate(this.screenX(tx), this.screenY(ty));
        ctx.rotate(-angle * Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(-s * 0.6,  s * 0.6);
        ctx.lineTo(-s * 0.6, -s * 0.6);
        ctx.closePath();
        ctx.restore();   // the path keeps its transformed points
    }

    _drawTurtleHead(ctx, tx, ty, angle) {
        this._traceArrowhead(ctx, tx, ty, angle);
        ctx.fillStyle = this._bgIsLight() ? 'rgb(20,150,75)' : 'rgb(51,230,102)';
        ctx.fill();
    }

    // A stamp is the turtle's shape left on the canvas, in its fill and pen colors.
    _drawStamp(cc, seg) {
        this._traceArrowhead(cc, seg.pos[0], seg.pos[1], seg.heading);
        const f = seg.fill_color, p = seg.color;
        if (f) {
            cc.fillStyle = Renderer.colorCSS(f[0], f[1], f[2], f[3]);
            cc.fill();
        }
        if (p) {
            cc.strokeStyle = Renderer.colorCSS(p[0], p[1], p[2], p[3]);
            cc.lineWidth   = Math.max(1, this.viewScale);
            cc.lineJoin    = 'round';
            cc.stroke();
        }
    }

    // ---- Grid ----

    _drawGrid(ctx, w, h) {
        const pitch = 60;
        const cx    = this.screenX(0);
        const cy    = this.screenY(0);

        const ink   = this._bgIsLight() ? '0,0,0' : '255,255,255';

        ctx.save();
        ctx.lineWidth = 1;

        ctx.strokeStyle = `rgba(${ink},0.09)`;
        ctx.beginPath();
        for (let x = ((cx % pitch) + pitch) % pitch; x <= w; x += pitch) {
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
        }
        for (let y = ((cy % pitch) + pitch) % pitch; y <= h; y += pitch) {
            ctx.moveTo(0, y); ctx.lineTo(w, y);
        }
        ctx.stroke();

        ctx.strokeStyle = `rgba(${ink},0.2)`;
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
    }

    zoomCenter(factor) {
        const dpr  = window.devicePixelRatio || 1;
        const cssW = this.canvas.width  / dpr;
        const cssH = this.canvas.height / dpr;
        this.zoomAt(factor, cssW / 2, cssH / 2);
    }

    // Move the drawing by (dx, dy) screen pixels.
    panBy(dx, dy) {
        this.viewCenterX -= dx / this.viewScale;
        this.viewCenterY += dy / this.viewScale;
    }

    resetView() {
        this.viewScale   = 1;
        this.viewCenterX = 0;
        this.viewCenterY = 0;
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

        this._composite(tc, cssW, cssH, false);

        tmp.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = 'turtle.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Revoking synchronously can cancel the download in some browsers.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, 'image/png');
    }
}