// gamepad-layout.js
// A controller, as data: what its buttons are called, and a drawing of it
// for the mapping view (gamepad-mapping.js).
//
// Button indices are the W3C "standard" gamepad mapping's, which is what
// gamepad-input.js reports. Supporting another controller means adding
// another object of this shape; nothing else knows what a controller looks
// like.
//
//   glyph  the short label shown wherever the button is named
//   name   its full name
//   shape  where it is in the drawing, as an SVG element's tag and attributes
//   text   [x, y, size] of the glyph in the drawing, for buttons that show it
//   layer  drawing order: 0 and 1 go behind the body (triggers, then
//          bumpers, which the body partly covers), 2 on top of it
//
// nav: the buttons that work the mapping view itself, whatever they are
// mapped to, so a mapping can always be repaired with the controller alone.

const circle = (cx, cy, r) => ({ tag: 'circle', attrs: { cx, cy, r } });
const rect = (x, y, width, height, rx) => ({ tag: 'rect', attrs: { x, y, width, height, rx } });

export const XBOX_360 = {
    name: 'Xbox 360 controller',
    viewBox: '0 0 400 286',
    body: 'M90 46C140 36 260 36 310 46C350 48 370 76 380 126C392 186 396 236 376 258'
        + 'C356 278 332 256 310 216C298 194 280 186 260 186L140 186C120 186 102 194 90 216'
        + 'C68 256 44 278 24 258C4 236 8 186 20 126C30 76 50 48 90 46Z',
    // Drawn on the body, under the buttons: the wells the sticks sit in, the
    // guide button, and the d-pad's center.
    details: [circle(85, 101, 27), circle(260, 148, 25), circle(200, 101, 12), rect(132, 142, 12, 12, 0)],
    buttons: [
        { index: 0,  glyph: 'A',     name: 'A button',           layer: 2, shape: circle(315, 123, 10), text: [315, 123, 10] },
        { index: 1,  glyph: 'B',     name: 'B button',           layer: 2, shape: circle(337, 101, 10), text: [337, 101, 10] },
        { index: 2,  glyph: 'X',     name: 'X button',           layer: 2, shape: circle(293, 101, 10), text: [293, 101, 10] },
        { index: 3,  glyph: 'Y',     name: 'Y button',           layer: 2, shape: circle(315, 79, 10),  text: [315, 79, 10] },
        { index: 4,  glyph: 'LB',    name: 'Left bumper',        layer: 1, shape: rect(58, 30, 72, 40, 10),  text: [94, 37, 8] },
        { index: 5,  glyph: 'RB',    name: 'Right bumper',       layer: 1, shape: rect(270, 30, 72, 40, 10), text: [306, 37, 8] },
        { index: 6,  glyph: 'LT',    name: 'Left trigger',       layer: 0, shape: rect(72, 6, 44, 34, 9),    text: [94, 18, 8] },
        { index: 7,  glyph: 'RT',    name: 'Right trigger',      layer: 0, shape: rect(284, 6, 44, 34, 9),   text: [306, 18, 8] },
        { index: 8,  glyph: 'Back',  name: 'Back button',        layer: 2, shape: circle(172, 101, 7), text: [172, 116, 6] },
        { index: 9,  glyph: 'Start', name: 'Start button',       layer: 2, shape: circle(228, 101, 7), text: [228, 116, 6] },
        { index: 10, glyph: 'LS',    name: 'Left stick, pressed',  layer: 2, shape: circle(85, 101, 20),  text: [85, 101, 9] },
        { index: 11, glyph: 'RS',    name: 'Right stick, pressed', layer: 2, shape: circle(260, 148, 18), text: [260, 148, 9] },
        { index: 12, glyph: '↑',     name: 'D-pad up',           layer: 2, shape: rect(132, 130, 12, 12, 2) },
        { index: 13, glyph: '↓',     name: 'D-pad down',         layer: 2, shape: rect(132, 154, 12, 12, 2) },
        { index: 14, glyph: '←',     name: 'D-pad left',         layer: 2, shape: rect(120, 142, 12, 12, 2) },
        { index: 15, glyph: '→',     name: 'D-pad right',        layer: 2, shape: rect(144, 142, 12, 12, 2) },
    ],
    nav: { up: 12, down: 13, confirm: 0, cancel: 1 },
};
