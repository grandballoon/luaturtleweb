# Spec: blocks and cards

Status: plan steps 1 and 2 implemented in `../love2d_turtle` (branch `blocks-deck`), behind a setting; not yet tried with learners, 2026-10-29.
Parent: [spec-love-port.md](spec-love-port.md), which lists this as an experiment that can start from phase 2 on.
Companion: the execution trace in that same spec, which this view hooks into if both ship.
UI: [spec-blocks-ui.md](spec-blocks-ui.md), what the deck looks like and how mouse, keyboard and controller work it.

## Purpose

A card- or block-based view is the third way to write a program, alongside typing and the controller.
It is an experiment: the design keeps it cheap to try and cheap to drop.

## Where it stands

The deck of cards exists on desktop, behind the menu's "Cards view (experiment)" setting; the web has nothing of it.
In `../love2d_turtle`:

- `shared/lua_syntax/parse.lua`, a pure recursive-descent Lua 5.1 parser (with `goto`) over the editor's tokenizer.
  It accepts and rejects exactly what LuaJIT does over every program in the repository (259 files), the lessons, and a list of tricky cases.
- The round trip holds: every program's deck covers its text exactly once, in order (`test/blocks_test.lua`).
- `shared/blocks/` (`deck.lua`, `slots.lua`, `edit.lua`, `scope.lua`, `hand.lua`, `deck_view.lua`, `panel.lua`) and `turtle/cards.lua`, as [spec-blocks-ui.md](spec-blocks-ui.md) describes.
- The catalog's entries now carry `params` (a name and a kind for each argument), which name and type the slots; the desktop-only commands carry theirs in `turtle/desktop.lua`.

Still to do: trying it with learners against the success criteria below, and deciding on the open questions.

## Design

### The text stays the source of truth

Blocks are a view of the program's syntax tree, and every block edit is a text edit made through the buffer's operations.
So undo, files, share links, error lines and keyboard editing all keep working unchanged, and a learner can switch between text and blocks at any moment.
The opposite design (blocks as the source, generating text) would fork every one of those features.

### A Lua parser in Lua (pure)

A small recursive-descent parser over the editor's tokenizer, producing a tree in which every node keeps its source range.
Existing pure-Lua parsers mostly depend on LPeg, a C library LÖVE does not ship, so it is written here.
It parses full Lua 5.1 syntax, but only a subset gets rich blocks.
The tokenizer and parser live in `shared/lua_syntax/`, since the editor, the blocks and the trace's line display all use them.

### Rich blocks and opaque cards

Rich blocks cover turtle command calls (one per catalog entry, with a slot per parameter named from its signature), numeric and generic `for`, `while`, `repeat`, `if`, `local` assignment, and function definitions and calls.
Anything else becomes an opaque Lua card showing its code, editable as text.
So no program is unrepresentable, and nothing is lost by opening the block view.

### Edits touch only their own range

Moving a block or filling a slot rewrites just that node's text, in canonical formatting.
Untouched code keeps its exact text and comments.
A test round-trips every example, demo and sketch (text → tree → text) and requires an identical result.

### Slots

Numbers scrub by dragging horizontally (Bret Victor's scrubbable numbers) or with the controller's stick.
Colors pick from the named-color palette.
Variable slots offer the names in scope, which the parser knows.

### The palette

The palette is the command catalog, the same single source as the reference, the controller menu and the mapping view.

## Two presentations over the same model

- **A deck of cards.**
  One card per statement in a vertical column, nesting shown by indentation, with a hand of cards to play from.
  A deck is a list, so it fits the controller (the menu's page-stack navigation: pick a card, place it) as well as the mouse.
  It also suits the geometry library, where a `Construction` is already an ordered list of steps.
- **Nested blocks**, in the style of Scratch or Blockly.
  Statements snap inside loops and functions, dragged with the mouse.

The deck comes first; nested blocks follow only if the deck leaves the mouse wanting.

## With the execution trace

If the trace ships, a card highlights while its steps play, and clicking a drawn segment selects its card.
Hovering a card highlights every segment its statement drew and dims the rest.

## Plan

1. **Spike: the parser and the round-trip test** over every example and demo.
   This answers the riskiest question, whether text → tree → text can be exact, and decides whether the experiment continues.
   Done: it is exact.
2. **The deck-of-cards view**, behind a setting, with mouse and controller input.
   Done, on desktop.
3. **Nested blocks**, only if the deck leaves the mouse wanting.

## Success criteria

The experiment succeeds if a learner can build the welcome program with the mouse alone and with the controller alone, faster or with fewer errors than typing, and the round-trip test holds.
It runs behind a setting until then.

## Open questions

- Whether blocks, if they ship, cover the geometry library too, where a construction's ordered steps map naturally onto a deck of cards.
- Whether the web app gets the view as well, or it stays desktop-only.
