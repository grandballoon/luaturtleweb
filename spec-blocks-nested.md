# Spec: nested blocks

Status: draft, not started, 2026-11-01.
Parent: [spec-blocks.md](spec-blocks.md), plan step 3, which follows only if the deck leaves the mouse wanting.
Companion: [spec-blocks-ui.md](spec-blocks-ui.md), the deck of cards, whose principles, inputs and model this spec extends rather than replaces.

This spec brings the cards view closer to Scratch, Blockly and MakeCode: values built from blocks inside slots, shapes that show where a block fits, and a palette to drag from.
It is split into three stages, each usable on its own, so the cheapest one can be tried with learners before the others are built.

## Purpose

The deck already makes statements into cards, but everything inside a slot that is not a literal or a single name is typed as text (`size * 2`, `i % 2 == 0`, `towards(0, 0)`).
That is where a learner who cannot type yet, or is holding a controller, stops.
In Scratch those are value blocks dropped into slots, and that is the single biggest difference between the two.

Everything else here (shapes, the palette) makes the view look and feel like the visual languages learners may already know, but matters less than building values.

## What stays

These hold for every stage, as the parent and the UI spec decided:

- **The text stays the source of truth.**
  Every operation on a value block is a replacement of that expression's source range, through the buffer, one undo step, with the text outside it unchanged byte for byte.
- **The text always parses.**
  No operation leaves a hole: where Scratch would show an empty slot, the code holds a default value (see [Removing a value](#removing-a-value)).
- **One way to move, everywhere.**
  The controller and keyboard reach every value block by the same list walk the deck uses; the mouse adds dragging, never a path the others lack.
- **Cards look like the code.**
  A value block shows the code's own operators and names: `*`, `%`, `==` and `~=`, not ×, mod, = and ≠.
- **Colors by kind, not by section.**
  The UI spec's decision stands: no Movement blue and Pen green, because the text view has none.
- **No program is unrepresentable.**
  An expression with no value block shows its code, typed as text, as an expression slot does today.

## Scratch, and what this spec takes from it

| Scratch | Here |
| --- | --- |
| Value blocks (reporters) in slots | Taken: stage 1 |
| Hexagonal boolean blocks for conditions | Taken: stage 1 |
| An always-open palette by category, dragged from | Taken: stage 2, colored by kind |
| Notched statement blocks and C-shaped loops | Taken: stage 3, as a second look for the same deck |
| The running script glows | Already planned, in the UI spec's execution trace section |
| A free canvas of loose stacks | Left out: a stack not attached to the program has no honest place in a Lua file |
| Hat blocks for events (when key pressed) | Left out for now: turtle programs run top to bottom, and the catalog has no event commands |
| Sentence labels ("move (10) steps") | An open question: it contradicts "cards look like the code" |

The node graphs of game engines (Unreal's Blueprints, Unity's visual scripting) and music tools (Max, Pure Data, Bitwig's Grid) are a different model: data flowing along wires, not steps in order.
A turtle program is steps in order, so it gets stacked blocks.
A geometry construction is a data-flow graph (a midpoint depends on two points), so the parent spec's open question about geometry may be better answered by a node graph than by cards; that is outside this spec.

## Stage 1: value blocks in slots

Stage 1 changes slots, not cards, so it works in the deck as it is drawn today.

### What becomes a value block

A slot's expression becomes a tree of value blocks, read from the parser's expression nodes:

| Expression | Value block |
| --- | --- |
| `Number`, `String`, `Name`, `True`, `False`, `Nil` | A leaf: today's number, color, string or name slot, unchanged |
| `Binop` (`+ - * / % ^ ..`) | An operator block: [left] op [right] |
| `Binop` (`== ~= < > <= >=`, `and`, `or`) | A boolean operator block |
| `Unop` (`-`, `#`) | An operator block: op [operand] |
| `Unop` (`not`) | A boolean operator block |
| `Call` of a catalog command with a `returns`, or of the program's own function that returns a value | A call block: name [param value] … |
| `Paren` | Not drawn: the nesting already shows the grouping; its parentheses stay in the text |
| Anything else (`FunctionExpr`, `Table`, `Index`, `Invoke`, `Vararg`, a call the deck cannot name) | An expression leaf showing its code, edited by typing, as today |

A negative number literal (`-90`) stays a number leaf, as the slot code reads it now, so it scrubs.
A program whose arguments are all literals and names looks exactly as it does today: every slot is a leaf.

### Shapes

- A value block is a pill: radius half its height, the deck's slot look (`background` fill, 1 px `line` border).
- A boolean block has pointed ends, a hexagon, so it reads as "true or false" before it is read at all.
  Booleans are the comparison and logic operators, `true` and `false`, and catalog commands whose `returns` is `"boolean"`.
- A slot that wants a boolean (`if`, `elseif` and `while` conditions, `repeat`'s `until`, a parameter of kind `"boolean"`) is drawn hexagonal too, even while it holds a name.

### Examples

| Code | Card |
| --- | --- |
| `forward(size * 2)` | forward [n ( [size] * [2] )] |
| `if i % 2 == 0 then` | if ⟨ ( [i] % [2] ) == [0] ⟩ |
| `setheading(towards(0, 0))` | setheading [angle ( towards [x 0] [y 0] )] |
| `while not isdown() do` | while ⟨ not ⟨ isdown ⟩ ⟩ |
| `forward(-(size / 2))` | forward [n ( - ( [size] / [2] ) )], the parentheses kept in the text |

### Sizes

- A leaf inside a value block is 22 px tall; a slot leaf on a card stays 26 px, as now.
- Each level of nesting adds 3 px above and below, so a block is its tallest child plus 6 px.
- A card is its tallest slot plus 10 px, and never less than its present 36 px.
- A slot whose blocks would be wider than the card, or nested more than three levels, falls back to showing its code, highlighted, as an expression slot does today, with "Show as blocks" in its choice list once it fits.

### Selecting values

The selection gains a path: a card, a slot on it, and a value inside the slot.

- → and ← (the d-pad right and left) walk a card's values in source order, depth first: an operator block is a stop, then its left operand's values, then its right's.
  It is the same one-dimensional walk the text view's token cursor makes, so a nested value never needs a second axis.
- Past the last value, → goes into a compound's body, as it does past the last slot now.
- Clicking a value selects it; clicking a block's operator or name selects the whole block rather than a child.
- The selected value has the 2 px `accent` outline a selected slot has today.
- The right stick nudges the selected value if it is a number leaf and steps it if it is a color, exactly as now; on any other value it does nothing.
- Scrubbing works on every number leaf, however deep.

### Changing values

A or ↵ on a selected value opens its choice list, the UI spec's slot list with these rows added:

- **Wrap in …**: a page of operators (`+ - * / % ^`, `== ~= < > <= >=`, `and or not`, `..`); the selected value becomes the left operand and the right operand gets a starting value: `1` for arithmetic, `0` for comparisons, `true` for `and` and `or`, `""` for `..`.
- **Replace with …**: the Values and Operators sections of the hand (see [Where value blocks come from](#where-value-blocks-come-from)), then "Type…"; a replacing operator keeps the old value as its left operand, a replacing call does not keep it.
- **Unwrap**, on an operator block: replaces it with its left operand (its only operand for a unary one).
- **Remove**: replaces the value with its default (below).

The mouse does the same by dragging:

- Dragging a value block out of a slot lifts it with its children, and the slot it leaves takes its default.
- Dropping a value block on a slot replaces what is there; the replaced value is discarded, and undo brings it back.
- ⌥-dragging copies instead, as it duplicates a card.
- Dropping a value block on the hand bar or the palette drawer deletes it, leaving the default.
- A boolean block drops only on a boolean slot or a parameter of kind `"any"`; a round block drops on any slot but a binding.
  The slots a lifted block can land on are outlined in `accent_dim` while it is lifted.

### Removing a value

Lua has no empty arguments, so a removed value is replaced by its slot's default:

| Slot wants | Default |
| --- | --- |
| `"number"` | `0` |
| `"boolean"`, or a condition | `true` |
| `"color"` | `"black"` |
| `"string"` | `""` |
| `"any"`, or unknown | `nil` |

The program keeps running, the default draws as an ordinary leaf, and the learner fills it next.

### Parentheses

Wrapping, dropping and replacing decide parentheses by Lua's precedence, in one pure function:

- New text gets parentheses only where precedence needs them: dropping `a + b` on the left of `* c` writes `(a + b) * c`; dropping it into `forward(…)` writes `a + b`.
- Parentheses already in the code are `Paren` nodes and are never removed by an edit that does not replace them.

### Where value blocks come from

- The hand gains two sections after Structure: **Operators** (one block per operator, with starting operands as in Wrap) and **Values** (the catalog's entries with a `returns`, and the program's own functions that return a value).
- While a value or a slot is selected, playing a value block replaces it; while a card is selected, value blocks show in `muted` and say "Select a slot first" when picked, since a value alone is not a statement.
- Typing into a slot is always still there, so nothing that can be typed today becomes harder.

### Catalog additions

The catalog (`public/turtle/catalog.lua`, synced into the desktop app's `vendor/turtle/`) gains a `returns` field for every command that returns something: `"number"`, `"boolean"`, `"string"`, or `"values"` for several (`position()`).
Only single-value returns become value blocks.
Entries that document two commands in one (`xcor() / ycor()`) split into one entry each, so each can be a block.
The program's own function returns a value when its body, not counting nested functions, has a `return` with an expression; its kind is `"any"`.

### The model

| File | Change |
| --- | --- |
| `shared/blocks/value.lua` (new, pure) | An expression node → a value tree `{ kind = "leaf" \| "op" \| "call" \| "code", shape = "round" \| "boolean", op, name, children, l1, c1, l2, c2 }`; the walk order; `compose(op, left, right)` → text with only the parentheses precedence needs; the default for a slot |
| `slots.lua` | A slot holds its value tree; a leaf slot is the slot it is today |
| `edit.lua` | `edit.set_value`, `edit.wrap_value`, `edit.unwrap_value`, `edit.remove_value`, `edit.move_value`, each taking a row, a slot and a path, each a replacement of the value's range |
| `deck_view.lua` | Slot layout becomes recursive; `hit` returns `{ kind = "value", row, slot, path }`; `drop_value(lay, x, y, shape)` → the slot a lifted value lands on |
| `panel.lua` | The selection's path, the value drag, and the new choice-list rows |
| `hand.lua` | The Operators and Values sections |

The deck rows stay a flat list of statements; the tree lives inside a row's slots.
So the card walk, layout of cards, drops between cards and every existing edit are untouched.

## Stage 2: the palette drawer

A drawer of every block, open beside the deck, for the mouse.

- It opens over the canvas's left edge, next to the deck, 240 px wide, so the deck does not reflow; the header gains a **Blocks** button after Cards, and ⌘⇧B toggles it.
- Its contents are the whole hand, in its order: the catalog's sections, then Structure, Operators, Values and Your functions; one source, as the parent spec requires.
- Section names run down its left edge as a short list; clicking one scrolls to it.
  Each name has a dot in its section's kind color, not a color of its own.
- Every entry is drawn as the card or value block it plays, at the size it lands at, so what is dragged is what arrives.
- Dragging a card into the deck drops it as a drag from the hand bar does; dragging a value block onto a slot drops it as stage 1 says.
- Clicking an entry plays it after the selection, as clicking a hand card does.
- Hovering an entry shows its command in the reference dock, with its demo when Demos is on.
- Dropping a card or a value on the drawer deletes it.
- Whether it is open is saved with the cards settings, `turtle-cards`.

The controller already reaches the whole hand through Start, so the drawer adds no controller paths; with the controller, the drawer only follows the menu's selection, to show where in the hand it is.

## Stage 3: the blocks look

A second way to draw the same deck, chosen in the menu next to the experiment's setting: "Cards look: deck or blocks".
It is the UI spec's "Nested blocks, if they come": the same rows, the same edits, the same selection and inputs; only the drawing, the hit testing and the drop targets differ, in a new `shared/blocks/blocks_view.lua` with the same functions as `deck_view.lua`.

- **Statement blocks** stack with no gap between them: a notch 16 px wide and 4 px deep in each block's top edge, 16 px from its left, and the matching tab under its bottom edge.
  A blank line in the source becomes a 12 px gap, so a learner's groups still read as groups.
- **Compound blocks** are C-shapes: the header is the top arm, the body sits in the mouth indented 16 px, the spine down the left is 16 px wide, and the bottom arm is 16 px tall with `end` (or `until` and its slot) in it.
  `if` with `elseif` and `else` has one more arm per branch, carrying its keyword and condition.
- **Fill**: a block is filled in its kind's color, in place of the deck's stripe on `editor_bg`.
  The theme gains `block_command`, `block_control`, `block_name` and `block_lua`, derived from the syntax colors, for light and dark, with text that meets contrast on each.
- **Value wells** are slots cut into the block, round or hexagonal, with stage 1's value blocks inside them.
- **Opaque Lua blocks** show their code in mono on the `block_lua` fill.
- **Dragging** shows a translucent copy of the block where it would land, in place of the drop line.
- The gutter's line numbers, the states (selected, error, running step) and the hand bar are as in the deck.

The look is a setting during the experiment so that both can be tried with the same learners.

## Testing

Everything by equality on values, as the UI spec's tests are:

- **Value trees**: every slot of every program in the repository → its tree; the tree's ranges cover the slot's text exactly, and `Paren` and leaves are where the parser put them.
- **Composition**: a table of operator pairs and positions → the expected text; and for every case, the text parses back to the intended tree.
- **Value edits**: a program, an edit, a row, a slot and a path → the new text and selection; the text outside the value's range unchanged byte for byte; one undo step.
- **Always parses**: for every value in every example, removing it, wrapping it in each operator, and unwrapping it each leave a program that parses.
- **Walks**: → from a card's first slot visits every value in source order and then enters the body; ← walks it back.
- **Layout and hits**: nested slots → rectangles; points → value hits with paths; a lifted boolean → only boolean slots and `"any"` parameters as drops.
- **The drawer and the blocks look**: layout, hits and drops, as for the deck.
- **The tour** gains steps that wrap `forward(100)`'s value into `100 * 2`, scrub the `2`, remove it to `0`, drag `towards` from the drawer into `setheading`, and switch to the blocks look and back.

## Success criteria

The parent spec's criterion carries over, with one task added for stage 1: a learner turns the welcome program's square, once it is wrapped in a loop, into a spiral (`forward(i * 20)`) with the mouse alone, and with the controller alone, faster or with fewer errors than typing.
Each stage stays behind the experiment's setting until it meets it.

## Open questions

- Whether cards should carry sentence labels ("move [100] steps"), from a `label` field in the catalog, which would break "cards look like the code"; worth trying as a hover first.
- Whether dropping a value on a full slot should swap the two when the dragged value came from another slot, rather than discard the one replaced.
- Whether the drawer belongs over the canvas or inside the deck's rectangle, where it would narrow the deck.
- Whether event blocks come in if the desktop app gains an event API (a key pressed, a frame drawn).
- Whether geometry gets a node-graph view for constructions, in place of cards (the parent spec's open question).
- Whether the web app gets any of this (the parent spec's open question).
