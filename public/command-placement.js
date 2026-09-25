// command-placement.js
// Where the command reference lives: over the canvas, in a tab of the
// terminal panel, or in a small floating window. The learner moves it with
// buttons in its header, and the choice is remembered.
//
// Each place is a host for command-reference.js, which calls:
//   attach(overlay, onVisibilityChange)  put the overlay here, hidden
//   detach(overlay)                      take it back out
//   show(overlay), hide(overlay)         bring it into or out of view
// A host whose view the learner can change without the reference (the
// terminal panel's tabs and collapse) reports it through
// onVisibilityChange(visible).
//
// coversCanvas says whether the reference hides the drawing while shown,
// so the app knows to close it before a run.

import * as storage from './storage.js';
import { createFloatingFrame } from './floating-frame.js';

const PLACEMENT_KEY = 'luaturtle-command-placement';
const TAB           = 'commands';

// The terminal panel's height on the reference's tab: roomy enough for the
// list beside a legible demo, until the learner resizes it.
const TAB_HEIGHT     = 320;
const TAB_MIN_HEIGHT = 180;

// The floating window: two columns with a legible demo at first, and
// never too small for the stacked layout's list and detail strip.
const FLOAT_SIZE     = { width: 600, height: 400 };
const FLOAT_MIN_SIZE = { width: 300, height: 240 };

// Shown by toggling .visible, wherever it is in the page.
const toggleVisible = {
    show: (overlay) => overlay.classList.add('visible'),
    hide: (overlay) => overlay.classList.remove('visible'),
};

function canvasHost(panel) {
    return {
        name: 'canvas',
        coversCanvas: true,
        attach(overlay) {
            overlay.setAttribute('role', 'dialog');
            panel.append(overlay);
        },
        detach(overlay) {
            overlay.classList.remove('visible');
            overlay.remove();
        },
        ...toggleVisible,
    };
}

function terminalHost(terminal) {
    return {
        name: 'terminal',
        coversCanvas: false,
        attach(overlay, onVisibilityChange) {
            terminal.addTab(TAB, {
                label: 'Commands',
                pane: overlay,
                defaultHeight: TAB_HEIGHT,
                minHeight: TAB_MIN_HEIGHT,
                onVisibilityChange,
            });
        },
        detach(overlay) {
            terminal.removeTab(TAB);
            overlay.remove();
        },
        show: () => terminal.selectTab(TAB),
        // Back to the output, rather than collapsing the panel.
        hide: () => terminal.selectTab('output'),
    };
}

// The learner puts it where it covers the least, so a run leaves it open.
function floatHost(frame) {
    return {
        name: 'float',
        coversCanvas: false,
        attach(overlay) {
            overlay.setAttribute('role', 'dialog');
            document.body.append(overlay);
            frame.attach(overlay);
        },
        detach(overlay) {
            frame.detach();
            overlay.classList.remove('visible');
            overlay.remove();
        },
        ...toggleVisible,
    };
}

// Returns { current(), set(name) }: the saved host, and a switch to the
// host called name ('canvas', 'terminal', or 'float') that saves it.
export function createCommandPlacement({ canvasPanel, terminal, floatHandle, floatGrip }) {
    const hosts = {
        canvas:   canvasHost(canvasPanel),
        terminal: terminalHost(terminal),
        float:    floatHost(createFloatingFrame({
            handle: floatHandle,
            grip: floatGrip,
            key: 'luaturtle-command-float',
            size: FLOAT_SIZE,
            minSize: FLOAT_MIN_SIZE,
        })),
    };
    const saved = storage.load(PLACEMENT_KEY);
    let name = Object.hasOwn(hosts, saved) ? saved : 'canvas';

    return {
        current: () => hosts[name],
        set(next) {
            name = next;
            storage.save(PLACEMENT_KEY, name);
            return hosts[name];
        },
    };
}
