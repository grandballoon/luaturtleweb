// gamepad-mapping.js
// The controller mapping view: a drawing of the controller, a legend naming
// what each button does, and the list of functions a button can be given.
//
// The learner picks a button (in the legend, on the drawing, or by pressing
// it on the controller), then picks a function for it from the list. While
// the view is open its owner hands it every press, and the controller works
// the view through the layout's nav buttons whatever they are mapped to, so
// a mapping that unmapped the menu's own buttons can still be repaired:
// up and down move, confirm picks, cancel goes back and then closes. Any
// other button pressed is the one to change.
//
// Owns the view and which button is being changed. The mapping itself is
// gamepad-bindings.js's, the drawing and button names gamepad-layout.js's,
// and the functions its owner's (gamepad.js).

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOTHING = 'Nothing';

function svgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    return el;
}

function glyphElement(text) {
    const badge = document.createElement('span');
    badge.className = 'pad-glyph';
    badge.textContent = text;
    return badge;
}

// functions: [{ id, label, group, code }] in the order to list them, where
//   code marks a label that is Lua.
// onChange(): the mapping changed.
// onRefocus(): it closed while it had focus.
export function initGamepadMapping({ overlay, layout, bindings, functions, onChange, onRefocus }) {
    const diagram     = overlay.querySelector('#gamepad-mapping-diagram');
    const legend      = overlay.querySelector('#gamepad-mapping-legend');
    const pickerTitle = overlay.querySelector('#gamepad-mapping-button');
    const picker      = overlay.querySelector('#gamepad-mapping-options');
    const help        = overlay.querySelector('#gamepad-mapping-help');

    const byId = new Map(functions.map((fn) => [fn.id, fn]));
    const order = layout.buttons.map((b) => b.index);
    // What the picker lists: nothing, then every function.
    const choices = [null, ...functions.map((fn) => fn.id)];

    let shown = false;
    let button = order[0];   // the button being changed
    let choosing = false;    // the controller is in the picker, not the legend
    let choice = 0;          // the picker row it is on, an index into choices

    // ---- Built once ----

    const shapes = new Map();       // button → its <g> in the drawing
    const legendRows = new Map();   // button → { row, label }
    const options = [];             // the picker's rows, in the order of choices

    function buildDiagram() {
        const svg = svgElement('svg', { viewBox: layout.viewBox, 'aria-hidden': 'true' });
        const drawButton = (b) => {
            const g = svgElement('g', { class: 'pad-button' });
            g.append(svgElement(b.shape.tag, { class: 'pad-shape', ...b.shape.attrs }));
            if (b.text) {
                const [x, y, size] = b.text;
                const text = svgElement('text', { x, y, 'font-size': size });
                text.textContent = b.glyph;
                g.append(text);
            }
            g.addEventListener('click', () => change(b.index));
            shapes.set(b.index, g);
            return g;
        };
        const byLayer = (a, b) => a.layer - b.layer;
        const behind = layout.buttons.filter((b) => b.layer < 2).sort(byLayer);
        const onTop = layout.buttons.filter((b) => b.layer >= 2);
        svg.append(
            ...behind.map(drawButton),
            svgElement('path', { class: 'pad-body', d: layout.body }),
            ...layout.details.map((d) => svgElement(d.tag, { class: 'pad-detail', ...d.attrs })),
            ...onTop.map(drawButton),
        );
        diagram.append(svg);
    }

    function buildLegend() {
        for (const b of layout.buttons) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'pad-map-row';
            const label = document.createElement('span');
            label.className = 'pad-map-function';
            row.append(glyphElement(b.glyph), label);
            row.addEventListener('click', () => change(b.index));
            const li = document.createElement('li');
            li.append(row);
            legend.append(li);
            legendRows.set(b.index, { row, label, name: b.name });
        }
    }

    function buildPicker() {
        let group = null;
        choices.forEach((id) => {
            const fn = byId.get(id);
            if (fn && fn.group !== group) {
                group = fn.group;
                const heading = document.createElement('li');
                heading.className = 'pad-option-group';
                heading.textContent = group;
                picker.append(heading);
            }
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'pad-option';
            option.classList.toggle('code', !!fn?.code);
            const label = document.createElement('span');
            label.className = 'pad-option-label';
            label.textContent = fn ? fn.label : NOTHING;
            option.append(label);
            option.addEventListener('click', () => assign(id));
            const li = document.createElement('li');
            li.append(option);
            picker.append(li);
            options.push(option);
        });
    }

    // ---- State ----

    function update() {
        for (const [index, { row, label, name }] of legendRows) {
            const fn = byId.get(bindings.get(index));
            const selected = index === button;
            label.textContent = fn ? fn.label : NOTHING;
            label.classList.toggle('code', !!fn?.code);
            row.classList.toggle('unmapped', !fn);
            row.classList.toggle('selected', selected);
            row.setAttribute('aria-label', `${name}: ${label.textContent}`);
            row.setAttribute('aria-pressed', String(selected));
            const shape = shapes.get(index);
            shape.classList.toggle('unmapped', !fn);
            shape.classList.toggle('selected', selected);
        }
        const mapped = bindings.get(button);
        pickerTitle.textContent = legendRows.get(button).name;
        options.forEach((option, i) => {
            const current = choices[i] === mapped;
            option.classList.toggle('current', current);
            option.classList.toggle('selected', choosing && i === choice);
            option.setAttribute('aria-pressed', String(current));
        });
        overlay.classList.toggle('choosing', choosing);
        const cursor = choosing ? options[choice] : legendRows.get(button).row;
        cursor.scrollIntoView({ block: 'nearest' });
    }

    // Starts changing a button: the picker opens on what it does now.
    function change(index) {
        button = index;
        choosing = true;
        choice = Math.max(0, choices.indexOf(bindings.get(button)));
        update();
    }

    function assign(id) {
        bindings.set(button, id);
        choosing = false;
        onChange();
        update();
    }

    function step(direction) {
        if (choosing) {
            choice = Math.min(choices.length - 1, Math.max(0, choice + direction));
        } else {
            const at = order.indexOf(button) + direction;
            button = order[Math.min(order.length - 1, Math.max(0, at))];
        }
        update();
    }

    // ---- What the owner calls ----

    const isOpen = () => shown;

    function open() {
        if (shown) return;
        shown = true;
        choosing = false;
        overlay.hidden = false;
        update();
    }

    function close() {
        if (!shown) return;
        const hadFocus = overlay.contains(document.activeElement);
        shown = false;
        overlay.hidden = true;
        for (const shape of shapes.values()) shape.classList.remove('pressed');
        if (hadFocus) onRefocus();
    }

    function press(index, repeat) {
        const { up, down, confirm, cancel } = layout.nav;
        shapes.get(index)?.classList.add('pressed');
        if (index === up || index === down) return step(index === up ? -1 : 1);
        if (repeat) return;
        if (index === confirm) return choosing ? assign(choices[choice]) : change(button);
        if (index === cancel) {
            if (!choosing) return close();
            choosing = false;
            return update();
        }
        if (shapes.has(index)) change(index);
    }

    function release(index) {
        shapes.get(index)?.classList.remove('pressed');
    }

    buildDiagram();
    buildLegend();
    buildPicker();
    const glyphOf = (index) => layout.buttons.find((b) => b.index === index).glyph;
    help.append(
        'Press the button you want to change, or pick it below. ',
        glyphElement(glyphOf(layout.nav.up)), ' ', glyphElement(glyphOf(layout.nav.down)), ' move, ',
        glyphElement(glyphOf(layout.nav.confirm)), ' picks, ',
        glyphElement(glyphOf(layout.nav.cancel)), ' goes back.',
    );
    overlay.querySelector('#gamepad-mapping-reset').addEventListener('click', () => {
        bindings.reset();
        choosing = false;
        onChange();
        update();
    });
    overlay.querySelector('#gamepad-mapping-close').addEventListener('click', close);

    return { isOpen, open, close, press, release };
}
