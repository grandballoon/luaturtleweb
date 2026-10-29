# Spec: the deck of cards, its UI

Status: implemented in `../love2d_turtle` (branch `blocks-deck`), behind the setting; [Implementation notes](#implementation-notes) records where it settled what this spec left open, 2026-10-29.
Parent: [spec-blocks.md](spec-blocks.md), which decides the model (text as the source of truth, a pure parser, rich blocks and opaque cards, edits that touch only their own range).
This document decides what the learner sees and does: where the deck goes, what a card looks like, and how mouse, keyboard and controller work it.
It covers plan step 2 of that spec, the deck of cards; nested blocks get a short section at the end, since they follow only if the deck leaves the mouse wanting.

Everything here is for the desktop app in `../love2d_turtle`.
Whether the web gets it too is still an open question in the parent spec.

## Principles

- **The deck is the editor, seen differently.**
  It takes the editor's place in the window, edits the same buffer, shares its undo history, and switching back and forth loses nothing, not even the selection.
- **One way to move, everywhere.**
  The deck is a list, so the controller works it as it works the menu: the d-pad moves, A picks, B goes back.
  The mouse, the keyboard and the virtual pointer reach every part of it too, and no widget has controller code of its own.
- **Cards look like the code.**
  A card's colors are the syntax colors of the text view, and its words are the words of the program, so a learner who switches views recognises what they see.
  A card never shows a label the code does not contain, apart from the parameter names from the catalog's signatures.
- **No program is unrepresentable.**
  What the deck cannot show richly it shows as code, on an opaque card, editable as text.
- **The core decides, the shell draws.**
  The deck, its layout and every edit are pure functions over values; the shell reads input, draws, and applies the buffer edits the core returns.

## Turning it on

The deck is an experiment, so it sits behind a setting until the success criteria in the parent spec are met.

- The setting is a row in the menu's Commands page, next to vibration: "Cards view (experiment)", on or off, saved with the learner's other preferences.
- With it on, the header gains a **Cards** button between Reference and Run, drawn like Grid: active while the deck is shown.
- ⌘B (Ctrl+B off macOS) switches between text and cards.
- A controller function, `cards`, "Switch between text and cards", in the Menu group of the mapping view; its default is the chord `leftshoulder+start`.

With the setting off, none of these exist and nothing of the deck is loaded.

### Switching keeps your place

- From text to cards: the selected card is the innermost statement whose range holds the caret's line.
  On a blank line, it is the gap where that line sits (see [The insertion gap](#the-insertion-gap)).
- From cards to text: the caret goes to the start of the selected card's first token, with the line scrolled into view where the card was.
- A scrub or an edit in progress is committed before the switch.

## Where the deck goes

The deck takes the editor's rectangle from `turtle/layout.lua`, and nothing else in the window moves:

```
┌ header ─ Lua Turtle  Commands  Reference  [Cards]  Run  Stop  Export  Grid  Reset view ─── status ┐
├──────────────────────────────┬──────────────────────────────────────────────────────────────────────┤
│  deck                        │                                                                      │
│   1 ▌forward  n 100          │                                                                      │
│   2 ▌right    degrees 90     │                         canvas                                       │
│                              │                                                                      │
│   4 ▌for i = 1 … 4           │                                                                      │
│   5   ▌forward  n 100        │                                                                      │
│   6   ▌right    degrees 90   │                                                                      │
│     ▌end                     │                                                                      │
│ ── hand: forward right for + │                                                                      │
├──────────────────────────────┤──────────────────────────────────────────────────────────────────────┤
│  reference dock              │  output panel                                                        │
└──────────────────────────────┴──────────────────────────────────────────────────────────────────────┘
```

- The command reference stays docked under it and keeps following the selected card's command, as it follows the menu now.
- The hand bar sits at the bottom of the deck's rectangle, inside it (see [The hand](#the-hand)).
- The deck scrolls vertically within its rectangle, by the wheel, by dragging the scrollbar, and to keep the selected card in view, exactly as the editor scrolls to keep the caret in view.
  It never scrolls horizontally; a card too wide for the column truncates its code with an ellipsis and shows the whole on hover.

At 1280×800 (the Steam Deck, and the window's default) the column is 537 px wide, which leaves room for six levels of nesting before cards get narrower than 360 px.
Deeper nesting keeps indenting; the cards just get narrower.

## The card

### Anatomy

A simple card is one row, 36 px tall:

```
  12 ▌ pencolor   name "red" ●          ⋮⋮
  │  │ │          └ slot: parameter name, value, swatch
  │  │ └ the command, as written in the code
  │  └ the stripe: 4 px, the color of its kind
  └ the gutter: the line the statement starts on
```

| Part | Look |
| --- | --- |
| Gutter | The editor's gutter: Plex Mono 13, `editor_gutter`, right-aligned in 40 px; the statement's first line number |
| Card | `editor_bg` fill on the deck's `panel` background, 1 px `line` border, 6 px corner radius (the header buttons' radius) |
| Stripe | 4 px along the card's left edge, inside the radius, in the color of its kind (below) |
| Name | Plex Sans SemiBold 15, `text`; the name exactly as the code writes it, alias included (`fd` stays `fd`) |
| Slot | A pill per argument (see [Slots](#slots)), 8 px apart, after a 12 px gap |
| Handle | ⋮⋮ in `line`, at the right edge, shown on hover and on the selected card; the place to grab a card with the mouse, though the whole card body drags too |

Cards are 6 px apart.
A blank line in the source becomes a 16 px gap instead, so the groups a learner made with blank lines still read as groups; several blank lines in a row still show as one gap, and are kept in the text.

### Kinds and colors

The stripe color is the syntax color of the word that leads the statement, so cards and text agree:

| Kind | Statements | Stripe |
| --- | --- | --- |
| Command | A call to a catalog command, or a desktop-only command | `syn_turtle` |
| Control | `for`, `while`, `repeat`, `if` | `syn_keyword` |
| Name | `local` assignment, a function definition, a call to the program's own function | `syn_name` |
| Note | A comment on its own line | none; the card has no fill or border, just the comment in Plex Sans 14, `syn_comment` |
| Lua | An opaque card | `muted` |

There are no per-section colors (Movement blue, Pen green, and so on) as in Scratch: the text view has none, and two color systems for one program would be one too many.

### Compound cards

A `for`, `while`, `repeat`, `if` or `function` is a header card, its body indented beneath it, and a foot:

```
   4 ▌ for  i = 1 … 4                       header: 36 px
   ▌     5 ▌ forward  n 100                 body: indented 24 px
   ▌     6 ▌ right    degrees 90
   ▌ end                                    foot: 14 px
```

- The stripe continues as a rail down the left of the body to the foot, so the bracket reads as one shape.
- The foot is a short bar, 14 px tall, with `end` (or `until …` for `repeat`, as a slot) in Plex Mono 12, `muted`.
- `if` with `elseif` and `else` shows each branch as a divider row inside the bracket, 24 px tall, carrying its keyword and, for `elseif`, its condition slot.
- An empty body shows one placeholder row, "empty", in `muted`, which is a place to put a card (see [The insertion gap](#the-insertion-gap)).
- A compound card collapses with the ▸ at the left of its header (or ← on the keyboard and controller with the header selected and its body open); collapsed, the header shows the body's card count, "4 cards", in `muted`, and the foot is hidden.
  Collapsing is a view state, not saved in the program.

What each compound header shows:

| Code | Header |
| --- | --- |
| `for i = 1, 4 do` | for [i] = [1] … [4] |
| `for i = 10, 1, -1 do` | for [i] = [10] … [1] by [-1] |
| `for i, v in ipairs(list) do` | for each [i] [v] in [ipairs(list)] |
| `while x < 100 do` | while [x < 100] |
| `repeat … until done` | repeat, with until [done] on the foot |
| `if d > 50 then` | if [d > 50] |
| `function star(size, points)` | function star [size] [points] |
| `local function star(size)` | local function star [size] |

`for` shows `…` between start and limit because it is the one place a card uses a symbol the code does not: a comma there reads as two arguments.

### Simple cards

| Code | Card |
| --- | --- |
| `forward(100)` | forward [n 100] |
| `setpos(100, 50)` | setpos [x 100] [y 50] |
| `pencolor("red")` | pencolor [name "red" ●] |
| `pencolor(1, 0.5, 0)` | pencolor [r 1] [g 0.5] [b 0] |
| `local size = 100` | local [size] = [100] |
| `size = size + 10` | [size] = [size + 10] |
| `star(50, 5)` | star [size 50] [points 5], the names from the program's own definition |
| `print(x)` | print [x], a call to a function the deck knows nothing about, with unnamed slots |

The parameter names come from the catalog's `call` signatures (`forward(n)`, `left(degrees)`).
When a command has several signatures (`pencolor(r, g, b)` and `pencolor("name")`), the card takes the one whose arity and argument kinds match the call.
A call with more or fewer arguments than any signature still gets a card, with unnamed slots, and the argument check reports it when the program runs, as in text.

### Opaque cards

Anything without a rich block (a `goto`, a table constructor across lines, an expression statement the parser accepts but the deck does not model) is an opaque Lua card:

- The code itself, syntax highlighted as in the editor, in Plex Mono 14, as many rows as it has lines, up to 8; beyond that it shows the first 7 and "… 12 more lines".
- A small tag at the top right, "Lua", in `muted`.
- Double-click, Enter, or A opens it for editing (see [Editing text in place](#editing-text-in-place)).

An opaque card is not a second-class card: it moves, duplicates, deletes and nests like any other.

### States

| State | Look |
| --- | --- |
| Hovered | Border `accent_dim`; the handle shows |
| Selected | 2 px `accent` outline outside the border; the handle shows; the reference follows its command |
| Slot selected | The card selected, and the slot's pill outlined in 2 px `accent` |
| Error | `editor_error_bg` fill, a 2 px `error` stripe instead of its kind's, and the error message under the card (see [Errors](#errors)) |
| Running step | `accent_dim` fill at 35%, only with the execution trace on |
| Lifted | Drawn under the pointer with a 4 px soft shadow, at 90% opacity; its place in the deck shows the drop line instead |

## Slots

A slot is a pill for one argument, or one part of a header (a loop variable, a bound, a condition).
The pill is 26 px tall, radius 13, filled `background`, with the parameter name inside on the left in Plex Sans 12, `muted`, and the value on the right in Plex Mono 14 in its syntax color.
A slot with no parameter name shows just the value.

What a slot holds is read from the code, not stored:

| Holds | When the code is | Pill shows | Changes by |
| --- | --- | --- | --- |
| Number | A number literal, with or without a leading minus | `syn_number` value | Scrubbing, the right stick, typing |
| Color | A string literal naming a color, in an argument the catalog marks as a color name | The string and a 10 px swatch | The swatch picker, the right stick, typing |
| String | Any other string literal | `syn_string` value | Typing |
| Name | A single name | `syn_name` value | The names in scope, typing |
| Expression | Anything else (`size * 2`, `i % 2 == 0`, `ipairs(list)`) | The code, highlighted | Typing |

A learner can change what a slot holds: a number slot can become a name from the scope list, and a name slot can become a number again.
That is just a different text in the slot's range, so the slot's kind follows.

### Scrubbing numbers

- Dragging a number slot horizontally changes it, after Bret Victor's scrubbable numbers.
  The pointer becomes the horizontal-resize cursor over a number slot, to say so.
- The step is the number's own precision: 1 for `100`, 0.1 for `0.5`.
  Holding Shift scrubs ten times finer; holding Alt (Option), ten times coarser.
- Each 4 px of drag is one step, so the range of a drag grows with the window, not with the value.
- The program runs again on release, the same rule as the right stick's nudge (`turtle/nudge.lua`), so the two feel alike.
  Whether to run continuously while scrubbing, when a run is fast enough, is left to try once the deck exists; see [Open questions](#open-questions).
- One scrub is one undo step, in the nudge's undo group, so a held stick and a long drag both undo at once.
- A click without a drag (less than 3 px of movement) opens the slot for typing instead.

### The right stick

With a slot selected, the right stick works it exactly as it works a number or color token in the text view today: up and down nudge a number at a speed that grows with the deflection, and step a color name one at a time.
It is the same `nudge.lua` logic applied to the slot's range, so there is no second tuning to keep in step.
With no slot selected, the right stick pans the canvas, as now.

### Choosing a value

A or Enter on a selected slot opens a choice list beside it, drawn as a menu page (`shared/ui/menu_view.lua`) anchored to the slot rather than to the window's corner.
Its rows depend on what the slot holds:

- **Number:** "Type a number…", then the names in scope that hold numbers last time the program ran, if the trace knows, or all names in scope otherwise.
- **Color:** a swatch grid of the named colors from `colors.lua`, eight per row, navigated by the d-pad in two dimensions; the current color is outlined.
  The mouse gets the same grid by clicking the swatch.
- **Name:** the names in scope at that statement, innermost first (loop variables, then locals, then the function's parameters, then globals the program assigns), and "Type a name…".
- **Expression and string:** "Edit…", which opens the slot for typing.

The names in scope come from the parser, which knows the program's scopes; the list never offers a name that would not be visible at that statement.

"Type…" rows open the slot for typing with the keyboard, or the on-screen keyboard when no keyboard is attached.

### Editing text in place

Typing into a slot, or into an opaque card, opens a small editor over just that range: the shared editor view (`shared/editor/view.lua`) drawn inside the pill or the card, on a buffer that holds only that text.

- Enter (or A on the on-screen keyboard's Done) commits; Esc (or B) cancels and restores the text.
  For an opaque card, Enter inserts a line break and ⌘↵ commits, since its code may span lines.
- Clicking anywhere outside commits.
- Committing replaces the range's text in the program's buffer as one edit, one undo step.
- If the committed text no longer parses, it is kept as typed: the card that held it becomes an opaque card showing the parse error (see [Errors](#errors)), and fixing it there brings the rich card back.

A slot's editor grows to fit its text up to the card's width, and scrolls horizontally beyond that.

## Selecting and moving through the deck

There is always one selection: a card, a slot on a card, or a gap.

| Input | Keyboard | Controller | Mouse |
| --- | --- | --- | --- |
| Next or previous card | ↓ ↑ | d-pad down, up | Click a card |
| Next or previous slot on the card | → ← | d-pad right, left | Click a slot |
| Into a compound's body, or open it if collapsed | → past the last slot | d-pad right past the last slot | Click a body card |
| Collapse a compound, from its header | ← before the first slot | d-pad left before the first slot | Click ▸ |
| Out to the enclosing header | ⌥↑ | B (back), with no slot open | Click the header |
| Top or bottom of the deck | ⌘↑ ⌘↓ | — | Scroll |

↓ and ↑ walk the deck in reading order, through compound bodies, as the cursor walks lines in text: the next card is the one drawn below.
A foot is a stop too, because it is where a card goes to land after a loop rather than inside it.
Up and down repeat while held, at the reader's usual repeat rate.

### The insertion gap

A gap is a place between cards where a card can go, drawn only when it matters: while dragging, while the hand is open, and when it is the selection.
It is a 2 px `accent` line at the depth a card would land, with a 6 px dot at its left end.

Without the mouse, a card is played *after the selection*:

- After a simple card, at its depth.
- After a compound header, as the first card of its body.
- After a foot, after the whole compound, at the compound's depth.
- On an empty body's placeholder, as its only card.
- With no cards at all, as the first card.

To put a card before the first card, play it and move it up.
So no extra stops are needed between every pair of cards, and the d-pad steps stay one per card.

## Changing the deck

| Operation | Keyboard | Controller | Mouse |
| --- | --- | --- | --- |
| Play a card from the hand | Type to search, Enter | Open the menu, pick | Drag from the hand or the reference; click a hand card |
| Move a card up or down | ⌥⇧↑ ⌥⇧↓ | `leftshoulder+dpup`, `leftshoulder+dpdown` | Drag |
| Move into or out of the compound above | ⌥⇧→ ⌥⇧← | `leftshoulder+dpright`, `leftshoulder+dpleft` held with the card selected | Drag left or right while dropping |
| Delete a card | Delete or Backspace | `leftshoulder+b` | Drag onto the hand bar |
| Duplicate a card | ⌘D | `leftshoulder+y` | ⌥-drag |
| Wrap in a `for` loop | ⌘⇧F | `leftshoulder+a` | From the card's context menu |
| Unwrap a compound (keep its body) | ⌘⇧U | from the Edit menu page | From the card's context menu |
| Undo, redo | ⌘Z, ⌘⇧Z | X, `leftshoulder+x` | — |

The controller's chords are the ones the text view already uses for line operations, so the same buttons do the same things in both views: in the deck, "the line" is "the card", with its whole body for a compound.
They are the same function ids in `turtle/functions.lua` (`delete-line`, `duplicate-line`, `move-line-up`, `wrap-for`, …); the shell applies them to the card when the deck is shown.
Their labels in the mapping view become "Delete line or card", and so on.

Moving a card past a compound's header or foot moves it into or out of that body, one depth at a time, so ⌥⇧↓ repeated walks a card down through every place it could go.

A right click (or the context menu key) on a card opens a short menu page anchored to it: Duplicate, Delete, Wrap in a for loop, Unwrap, Edit as text, Copy as code.

Every one of these is one edit to the buffer and one undo step.
The text it writes is canonical (4-space indentation at its new depth, the catalog's spacing), and nothing outside the moved or changed range is touched, as the parent spec requires.

### Dragging

- Pressing on a card and moving 4 px lifts it, with its body if it is a compound.
  Pressing on a number slot scrubs instead, so the handle is the way to drag a card by a number.
- While lifted, the drop line shows where it would land: between the two cards nearest the pointer's y, at the depth chosen by the pointer's x, snapped to the depths that are legal there (no deeper than one level inside the card above, no shallower than the compound the gap is in, if it is the last place in it).
- Releasing over the deck drops it there.
- Releasing over the hand bar deletes it; the hand bar shows "Release to delete" in `error` while the card is over it.
- Esc while dragging, or releasing anywhere else, puts it back.
- Near the top or bottom edge of the deck, the deck scrolls while dragging, faster closer to the edge.

The virtual pointer drags the same way, with A as the press, since it is the mouse to the app.

## The hand

The hand is the cards a learner can play: every catalog command, and the Lua structures the catalog does not have.

### Its contents

The hand's sections are the menu's: Recent, Favorites, the catalog's sections in the reference's order, and one new section, **Structure**, defined in `shared/blocks/hand.lua`:

| Card | Inserts |
| --- | --- |
| repeat a number of times | `for i = 1, 4 do` … `end` |
| count with a step | `for i = 10, 1, -1 do` … `end` |
| for each in a list | `for i, v in ipairs(list) do` … `end` |
| while | `while true do` … `end` |
| repeat until | `repeat` … `until true` |
| if | `if true then` … `end` |
| if, else | `if true then` … `else` … `end` |
| a local value | `local size = 100` |
| set a value | `size = 100`, with the first name in scope instead of `size` when there is one |
| a function | `function shape(size)` … `end` |
| a comment | `-- ` |

Like the catalog's `insert`, every structure inserts code that runs as it is, so a learner holding a controller can play it and change its values without typing.
The program's own functions show as one more section, **Your functions**, one card per definition, calling it with each parameter set to 0 (or to the value of its first call, when there is one).

The Structure section also appears in the text view's menu, inserting the same templates at the caret, since nothing about it is deck-only.

### The hand bar

At the bottom of the deck, a 44 px bar holds the hand's most recent cards, as small one-row cards (name only, 28 px tall), newest first, as many as fit, and a **+** at the right that opens the whole hand.

- Clicking a card in the bar plays it after the selection.
- Dragging one into the deck plays it where it is dropped.
- With nothing played yet, the bar shows the welcome program's commands: `forward`, `right`, `left`, `for`.

### The whole hand

The whole hand is the command menu, the page stack the controller already uses (`turtle/menu_pages.lua`).
The **+**, the header's Commands button, and the controller's menu button all open it.
In the deck, its rows show as small cards with their stripes, and picking one plays it after the selection instead of inserting a line at the caret.
Rows can also be dragged straight into the deck with the mouse.

The reference dock is a second hand for the mouse: with the deck shown, its list rows drag into the deck, and its Insert button plays the selected command after the selection.

### Type to play

With a card selected and no slot open, typing a letter opens the whole hand on a search page with that letter in its field, as the reference's search does.
Enter plays the first match.
So a keyboard learner can build a whole program in the deck without the mouse: `f`, `o`, Enter plays `forward(100)`, → selects its slot, `5`, `0`, Enter sets it.

## Errors

The deck shows the same errors the editor does, in the same words, on the card that holds the line:

- **A runtime error** (from `turtle/errors.lua`) marks the innermost card whose range holds the error line, in the error state, with the message under it in Plex Sans 13, `error`, inside the card's rail.
  If the card is inside a collapsed compound, the compound opens.
- **A rejected call** (from `args.lua`) also outlines the offending slot in `error` when the check names the argument, and shows the usage examples under the card, as the editor's usage popup does.
  Each example is a small card; clicking one, or picking it with A, replaces the call with it.
- **A syntax error** stops the parser, so the deck shows rich cards for every statement before the error, then one opaque card holding the rest of the program from the statement that failed, in the error state, with the parser's message.
  Editing that card fixes the program; the rest comes back as rich cards once it parses.
  Since the text view lets a learner type anything, this is the case where switching to the deck mid-edit lands.

Errors clear on the next edit, as in the editor.

## With the execution trace

If the trace ships, the deck adds three things, all drawn from the trace's step records and nothing else:

- While the timeline plays or is scrubbed, the card of the step's innermost line takes the running-step look, and the deck scrolls to keep it in view.
- Hovering a card highlights every segment its statement drew and dims the rest of the canvas, as hovering a line does; hovering a compound's header counts its whole body.
- Clicking ink selects its card and opens any collapsed compound around it; a card inside a loop shows the pass in its header's right corner, "pass 7 of 36", in `muted`, while selected that way.

## The empty deck

A program with no statements shows one placeholder card in the middle of the deck: "Play a card from your hand", with the controller's menu button glyph when a controller is connected, and an arrow down to the hand bar.
The placeholder is the selection, so playing a card puts it there.

## The model behind the view

The view is these pieces, in `shared/blocks/`, all pure but the last two:

| File | Role |
| --- | --- |
| `../lua_syntax/parse.lua` | Lua 5.1 (with `goto`) → a tree whose nodes keep their source ranges; a syntax error keeps the statements before it |
| `deck.lua` | The parser's tree → a flat list of deck rows (`kind`, `family`, `depth`, source range, `line`, `parts`, `slots`, `after`, …), with header, divider, foot, placeholder, note, opaque and error rows, in drawing order; collapse state applied; `deck.text` rebuilds the program from the rows (the round trip) |
| `slots.lua` | A call's arguments → slots, using the catalog's `params`; a slot's kind from its parameter and its text |
| `edit.lua` | A deck operation (play, move, move to, shift in or out, delete, duplicate, wrap, unwrap, set, nudge or cycle a slot) on the buffer and the deck → the new buffer, as one edit of only the lines that change, and where the selection goes |
| `scope.lua` | The names in scope at a statement, for the choice list |
| `hand.lua` | The Structure section's templates and the Your functions section |
| `deck_view.lua` | The layout as a pure function, `layout(area, rows, state, measure) → rects`; `hit(lay, x, y) → { kind = "card" \| "slot" \| "handle" \| "collapse" \| "example" \| "hand" \| "plus" \| "bar" \| "deck", ... }`; `drop(lay, rows, x, y)`, the place a dragged card lands; then a draw over the same layout, as `menu_view.lua` does |
| `panel.lua` | The shell: selection, scroll, collapse, drag, a slot being typed in, the choice list and a card's menu; keys, mouse and controller functions in, edits of the editor's buffer out |

`turtle/cards.lua` gives the panel what it needs from the app (the catalog's signatures, the colors, the recent commands for the hand bar) and keeps the two settings, saved as `turtle-cards`.

The deck rows are a flat list for the same reason the menu's are: the d-pad walks a list, and the layout, hit testing and selection all index into it.
The tree stays behind the rows for edits; each row keeps its node's source range.

The shell's part stays small: `panel.lua` rebuilds the deck after each buffer change, holds the selection and the drag, routes input to `edit.lua` or the choice list, and applies the edits it returns through the editor, so the deck and the text share one undo history.
`turtle/app.lua` routes the editor's keys, typing and clicks to the panel while the cards show, and registers cards and slots as targets for the virtual pointer's magnetism; `turtle/controller.lua` sends the navigation and card functions and the right stick to it.

## Testing

- **Deck rows** by equality: a set of programs (every example, demo and lesson) → the expected rows, depth and ranges included.
- **Edits** by equality on text: a program, a deck operation and a selection → the new program text and selection; with a check that the text outside the operation's range is unchanged, byte for byte.
- **Layout and hit testing** by equality: rows and an area → rectangles; points → hits, including the drop depth under a dragged card.
- **Selection walks**: ↓ from the first card visits every row in reading order and ends at the last foot; ↑ walks it back.
- **Switching views**: caret → selection → caret returns to the same statement for every statement of every example.
- **The tour** (`--ui-tour`) gains steps that turn the setting on, switch to cards, play a card from the hand, scrub a slot, move a card into a loop, and switch back, each with its expectation, so the deck stays exercised in CI.
- **The success test from the parent spec**, scripted with input replay: completing the welcome program's square with the controller alone, and with the mouse alone.

### The welcome program with the controller alone

Starting from the welcome program in the deck, with the last `forward` selected:

1. Start opens the hand; the d-pad picks Movement, then `right(degrees)`; A plays `right(90)` after `forward`.
2. Start, Recent, `forward(100)`, A: the third side.
3. Start, Recent, `right(90)`, A; Start, Recent, `forward(100)`, A: the square is complete.
4. RT runs it.

Or the way the deck invites, which teaches a loop on the way:

1. `leftshoulder+b` deletes the last `forward`; the selection moves to `right(90)` above it.
2. Up to the first `forward`; `leftshoulder+a` wraps it in `for i = 1, 4 do` … `end`.
3. Down past the loop's foot to `right(90)`; `leftshoulder+dpup` moves it up into the loop, after `forward`.
4. RT runs it.

The replay test asserts the program text after each step, as well as the drawing at the end.

### What exists

- `test/blocks_test.lua`: the parser against LuaJIT over every program in the repository; the round trip; deck rows for the welcome program, compounds, slots, opaque cards, errors, trailing comments, collapse and the empty program; every edit by equality on text and selection, one undo step each; the deck way to the welcome square; scope; the hand; the view's layout, hits, drop places and scrolling.
- `test/controller_test.lua`: the menu's new rows and pages.
- The tour turns the setting on from the menu, walks and plays from the Structure section, shifts a card into a loop, nudges and undoes, runs, shows an error on its card, types into and scrubs a slot, opens a card's menu, drags a card, plays from the hand bar, picks from a color's swatches, and switches back with the caret on the selected card.

Not yet: the full selection-walk and switch-views checks over every example, and the input-replay test of the welcome program with the controller alone and with the mouse alone.

## Implementation notes

Where the implementation settled what this spec left open, or departed from it:

- **Moving code keeps its own text.**
  A moved, duplicated or wrapped card carries its lines as they are, re-indented to where it lands; nothing is re-printed from the tree.
- **Editing an opaque card** jumps to the text view with the caret on it (↵ or a double-click); the deck does not embed a text editor.
- **A color's choice list** is the colors in the stick's order, each row with its swatch; a number's or name's list is "Type…" and the names in scope.
- **Type to play** opens the reference with the typed text as its search; ↵ there plays the found command after the selected card and gives the keyboard back to the deck.
- **The hand bar** is the five recent commands (`forward`, `right` and `left` before there are any); the + opens the whole hand, which is the command menu with Structure and Your functions added.
- **A trailing comment** rides on its card; comments alone on their lines are note cards.
- **Several statements on one line** are separate cards; a card played after one goes on a new line.
- **Switching from text on a blank line** selects the innermost card around the caret's line, or the first card.
- **Desktop-only commands** get names and kinds for their slots (`turtle/desktop.lua`'s `PARAMS`), but are not in the hand.
- **Collapse state** is kept by each compound's position in the text, for the session only, so an edit above a collapsed compound can open it again.
- **One-line compounds**: a card played into an empty one-line body (`for i = 1, 4 do end`) goes on the line after it, outside the loop; the learner moves it in.
- **No gap selection.**
  The selection is always a card or a slot; "after the selection" covers every keyboard and controller placement, and the drop line shows gaps only while dragging.
- **Drop depth** is the nearest of the depths the rows offer at that height (each row's place after it, and the top), without the further snapping rules above.
- **Templates that run as they are**: `while false do`, and `for i, v in ipairs({ 10, 20, 30 }) do`, so playing one never hangs the program or calls an unknown name.
  The "set a value" card is left out until it can pick a name in scope, and the function card is `local function`.
- **Structure and Your functions** show in the menu whenever the experiment is on, in both views; in the text view they insert at the caret.
- **Not yet**: dragging menu rows or the reference's rows into the deck (picking one plays it after the selection), and the gutter's run-trace marks.
- **Controller defaults** added: `leftshoulder+dpright` moves a card into the block above, `leftshoulder+dpleft` out of its block, `leftshoulder+start` switches between cards and text.
  In the text view, the first two and Unwrap act on the statement at the caret, through the same edits.

## Nested blocks, if they come

Only if the deck leaves the mouse wanting (plan step 3 in the parent spec).
They would be a second view over the same rows and the same `edit.lua`: Scratch-style shapes with notches, a C-shaped mouth for each compound, and slots as rounded wells, drawn by a `blocks_view.lua` with its own layout and hit testing.
Selection, the hand, slots, errors and the trace work as in the deck; only the drawing and the drop targets differ.
Because the edits are shared, the only new tests would be layout and hit testing.

## Open questions

- Whether to run the program continuously while scrubbing, when the last run finished within a frame or two, or only on release as the right stick does now.
- Whether `if`'s condition and `while`'s deserve richer slots (a comparison with two sides and an operator) or stay expressions typed as text.
- Whether a card for a call should show its result when it returns one (`local d = distance(0, 0)`), which the trace's locals level could fill.
- Whether the hand bar should show Favorites instead of Recent when the learner has some.
- Whether collapse state should survive a restart, saved beside the program rather than in it.
