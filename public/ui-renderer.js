// ui-renderer.js
// Draws a program's on-canvas controls from the layout turtle/ui.lua makes
// (sliders, buttons, toggles, radio buttons, text fields). renderer.js calls
// drawUI() over the drawing, in the same turtle-space transform, so the
// controls pan and zoom with it.
//
// The sizes are ui.lua's (FONT, LABEL_H, KNOB_R, ...): it lays the widgets
// out and hit-tests the pointer with them, so a change to one belongs in
// both files. Each record's box is its top-left corner x, y and its size
// w, h in turtle pixels, y up.
//
// The controls keep the app's own colors whatever the program's background,
// except their bare text, which takes whichever of the app's ink or paper
// reads on it. Once the run stops listening they are drawn faded, so dead
// controls don't look live.

const FONT = 13, LABEL_H = 18, TOGGLE_W = 38, TOGGLE_H = 22, OPTION_H = 24, FIELD_H = 28, KNOB_R = 8;
const FAMILY = "'IBM Plex Sans', system-ui, sans-serif";

const ACCENT       = '#237a69';
const ACCENT_DOWN  = '#1b5f52';
const ON_ACCENT    = '#fbf8f2';
const FIELD_BG     = '#fbf8f2';
const FIELD_BORDER = '#c9bfae';
const FIELD_TEXT   = '#3b342b';
const KNOB         = '#fbf8f2';

// Lua sequences arrive as JS arrays, except an empty one, which is {}.
const items = seq => (seq ? Object.values(seq) : []);

// view: { sx(tx), sy(ty), scale, light } — the renderer's turtle → screen
// transform, zoom, and whether the background is light.
export function drawUI(ctx, ui, view, active) {
    const widgets = items(ui?.widgets);
    if (widgets.length === 0) return;
    const theme = {
        text:  view.light ? '#3b342b' : '#f6f2eb',
        muted: view.light ? 'rgba(59, 52, 43, 0.22)' : 'rgba(246, 242, 235, 0.3)',
    };
    ctx.save();
    if (!active) ctx.globalAlpha = 0.45;
    for (const w of widgets) {
        const draw = DRAW[w.kind];
        if (draw) draw(ctx, w, view, theme);
    }
    ctx.restore();
}

// ---- Shared pieces ----

function font(view, weight = 400) {
    return `${weight} ${FONT * view.scale}px ${FAMILY}`;
}

// Text at turtle point (tx, ty), vertically centered there, shrunk to fit
// maxWidth turtle pixels if it would overflow.
function text(ctx, view, s, tx, ty, color, { align = 'left', maxWidth = Infinity, weight = 400 } = {}) {
    ctx.font = font(view, weight);
    const limit = maxWidth * view.scale;
    const width = ctx.measureText(s).width;
    if (width > limit && limit > 0) {
        ctx.font = `${weight} ${FONT * view.scale * limit / width}px ${FAMILY}`;
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(s, view.sx(tx), view.sy(ty));
}

// A rounded rectangle with its top-left corner at turtle point (tx, ty).
function roundRect(ctx, view, tx, ty, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(view.sx(tx), view.sy(ty), w * view.scale, h * view.scale, r * view.scale);
}

function circle(ctx, view, tx, ty, r) {
    ctx.beginPath();
    ctx.arc(view.sx(tx), view.sy(ty), r * view.scale, 0, 2 * Math.PI);
}

// ---- Widgets ----

const DRAW = {
    slider(ctx, w, view, theme) {
        text(ctx, view, w.text, w.x, w.y - LABEL_H / 2, theme.text, { maxWidth: w.w });
        const x1 = w.x + KNOB_R, x2 = w.x + w.w - KNOB_R, ty = w.y - LABEL_H - 10;
        const knob = x1 + (x2 - x1) * w.fraction;
        ctx.lineCap = 'round';
        ctx.lineWidth = 4 * view.scale;
        ctx.strokeStyle = theme.muted;
        ctx.beginPath();
        ctx.moveTo(view.sx(x1), view.sy(ty));
        ctx.lineTo(view.sx(x2), view.sy(ty));
        ctx.stroke();
        ctx.strokeStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(view.sx(x1), view.sy(ty));
        ctx.lineTo(view.sx(knob), view.sy(ty));
        ctx.stroke();
        circle(ctx, view, knob, ty, w.pressed ? KNOB_R + 1 : KNOB_R);
        ctx.fillStyle = KNOB;
        ctx.fill();
        ctx.lineWidth = 2 * view.scale;
        ctx.strokeStyle = ACCENT;
        ctx.stroke();
    },

    button(ctx, w, view) {
        roundRect(ctx, view, w.x, w.y, w.w, w.h, 6);
        ctx.fillStyle = w.pressed ? ACCENT_DOWN : ACCENT;
        ctx.fill();
        text(ctx, view, w.text, w.x + w.w / 2, w.y - w.h / 2, ON_ACCENT,
            { align: 'center', maxWidth: w.w - 16, weight: 500 });
    },

    toggle(ctx, w, view, theme) {
        roundRect(ctx, view, w.x, w.y, TOGGLE_W, TOGGLE_H, TOGGLE_H / 2);
        ctx.fillStyle = w.value ? ACCENT : theme.muted;
        ctx.fill();
        const r = TOGGLE_H / 2 - 3;
        circle(ctx, view, w.value ? w.x + TOGGLE_W - TOGGLE_H / 2 : w.x + TOGGLE_H / 2, w.y - TOGGLE_H / 2, r);
        ctx.fillStyle = KNOB;
        ctx.fill();
        if (w.text) text(ctx, view, w.text, w.x + TOGGLE_W + 8, w.y - TOGGLE_H / 2, theme.text,
            { maxWidth: w.w - TOGGLE_W - 8 });
    },

    radio(ctx, w, view, theme) {
        let top = w.y;
        if (w.text) {
            text(ctx, view, w.text, w.x, top - LABEL_H / 2, theme.text, { maxWidth: w.w });
            top -= LABEL_H;
        }
        items(w.options).forEach((option, i) => {
            const cy = top - OPTION_H * i - OPTION_H / 2;
            const selected = w.selected === i + 1;   // Lua's index, from 1
            circle(ctx, view, w.x + 8, cy, 7);
            ctx.fillStyle = KNOB;
            ctx.fill();
            ctx.lineWidth = 2 * view.scale;
            ctx.strokeStyle = selected ? ACCENT : FIELD_BORDER;
            ctx.stroke();
            if (selected) {
                circle(ctx, view, w.x + 8, cy, 3.5);
                ctx.fillStyle = ACCENT;
                ctx.fill();
            }
            text(ctx, view, option, w.x + 22, cy, theme.text, { maxWidth: w.w - 22 });
        });
    },

    textfield(ctx, w, view, theme) {
        let top = w.y;
        if (w.text) {
            text(ctx, view, w.text, w.x, top - LABEL_H / 2, theme.text, { maxWidth: w.w });
            top -= LABEL_H;
        }
        roundRect(ctx, view, w.x, top, w.w, FIELD_H, 5);
        ctx.fillStyle = FIELD_BG;
        ctx.fill();
        ctx.lineWidth = (w.focused ? 2 : 1) * view.scale;
        ctx.strokeStyle = w.focused ? ACCENT : FIELD_BORDER;
        ctx.stroke();

        // The text, clipped to the box and scrolled to keep the caret in it.
        const pad = 8;
        const value = String(w.value ?? '');
        ctx.save();
        roundRect(ctx, view, w.x + 1, top - 1, w.w - 2, FIELD_H - 2, 4);
        ctx.clip();
        ctx.font = font(view);
        const caretAt = ctx.measureText([...value].slice(0, w.caret).join('')).width / view.scale;
        const room = w.w - 2 * pad;
        const scroll = w.focused ? Math.max(0, caretAt - room) : 0;
        text(ctx, view, value, w.x + pad - scroll, top - FIELD_H / 2, FIELD_TEXT);
        if (w.focused) {
            const cx = view.sx(w.x + pad - scroll + caretAt);
            ctx.fillStyle = ACCENT;
            ctx.fillRect(Math.round(cx) - 0.75 * view.scale, view.sy(top - 6), 1.5 * view.scale,
                (FIELD_H - 12) * view.scale);
        }
        ctx.restore();
    },
};
