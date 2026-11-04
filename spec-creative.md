# Spec: creative coding (`/creative`)

Status: in progress, 2026-11-02: the page is built, with 33 reference works and no turtle versions yet (plan step 1).
Siblings: [The library](architecture.md#the-library-library) and [the computer science curriculum](spec-compsci.md), whose examples, previews and tests this page reuses.

`/creative` shows the math the other pages teach the way artists draw it.
`/library` and `/compsci` are educational: most of their examples are curves on graph paper, explained.
`/creative` starts from beautiful work in creative coding, such as flow fields, Truchet tiles, Substrate, Schotter, Fourier epicycles and differential growth, credits each piece to its artist, names the math in the picture and in the code, and shows our own turtle versions of it.

## Purpose

A learner who likes how something looks finds out what it is made of.
A learner who knows the math finds out what it can be made into.
The page is the third way into the same ideas, beside the gallery (`/library`) and the curriculum (`/compsci`), and is kept apart from both: its order is by kind of art, not by concept or course.

## Principles

- **Credit first.**
  Every work names its artist, its year (left empty when no source gives one), the context it was made in (an exhibition, a book, an essay, a demoparty), and links to the artist's own page.
- **License decides what we may do.**
  Code under a permissive license (MIT, BSD, Apache, the Unlicense) may be ported, with credit.
  Anything else (non-commercial, all rights reserved, no license stated, not public) is inspiration only: our version is written from the math, never from the code.
  The page says which, so a reader knows what they are looking at.
- **The math, twice.**
  Each work says the math a viewer sees in the picture, and the math the code computes to make it.
- **Our versions are turtle programs.**
  A turtle version is a library example (`library/programs/`, `library/previews/`), so it has one pipeline, one set of tests, and can appear on all three pages.
  It is not a copy: it is an idea of the original's, redrawn in turtle terms, credited to it.
- **Unfinished is fine, invisible gaps are not.**
  A work without a turtle version says so, and the coverage report lists it.

## The data

`public/creative/works.json` holds the works, in groups, in order:

```json
{
  "groups": [
    {
      "id": "generative-art",
      "name": "Generative art",
      "about": "One sentence on what the group holds.",
      "works": [
        {
          "id": "flow-fields",
          "name": "Flow Fields",
          "artist": "Tyler Hobbs",
          "year": "2020",
          "context": "Technique essay on his blog; Fidenza, a 2021 Art Blocks series, is built on it.",
          "url": "https://www.tylerxhobbs.com/words/flow-fields",
          "code": null,
          "license": "not-public",
          "picture": "Thick curves flowing side by side without touching.",
          "math": "A grid of angles from noise; each step moves by (cos a, sin a).",
          "examples": [],
          "relates": { "library": ["trigonometry"], "compsci": [] }
        }
      ]
    }
  ]
}
```

- `id` is unique across the page, so a link names a work alone (`/creative#flow-fields`), or a group (`/creative#generative-art`).
- `code` is `{label, url}` for the source, or null when there is none to link.
- `license` is one of the ids `creative.js` knows: `mit`, `bsd-3-clause`, `apache-2.0`, `unlicense`, `lgpl-2.1`, `cc-by-nc-sa-3.0`, `cc-by-nc-sa-4.0`, `all-rights-reserved`, `none-stated`, `not-public`.
  `creative.js` decides from it whether the code may be ported.
- `picture` and `math` are a sentence or two each: the math in the picture and the math in the code.
- `examples` names library examples, our turtle versions, in the order shown.
- `relates` names the concepts it draws on, in `/library`'s catalog and in `/compsci`'s curriculum.
  These are the links the cross-page index (below) will be built from.

The research behind the works, with what is still unverified, is the "Creative coding references" tab of the Knowledge base doc, under luaturtleweb.

## The page

`/creative` is a fourth page, built like `/compsci` and, like it, linked from nowhere yet.

- **The sidebar** holds a search bar and the groups, each a jump to its place in the main column.
- **The main column** shows every group, each work with its name, artist, year and context, the math in the picture and in the code, its links (the original, and the code with its license and whether it may be ported), the concepts it draws on, and its turtle versions as the library's cards.
- **A work with no turtle version yet** says so in place of its cards.
- **Search** ranks a word in a work's name above one in its artist, above one in its context or math, the way the other pages' searches do.
- **The link** names a work (`/creative#substrate`) or a group (`/creative#generative-art`).

The pieces follow the other pages' split:

- **`creative.js` decides.** Pure functions of the works: what a link names, each work as the page shows it, whether its code may be ported, what a search finds, and coverage.
- **`creative-page.js` is the shell.** It fetches the works, the library's catalog and the curriculum, renders what `creative.js` returns, and runs examples.
- **The card and the canvas are shared** with `/library` and `/compsci`: `example-cards.js`, `example-stage.js` and `browse.css`.

## Tests

- **`test/creative_test.mjs`** covers `creative.js` and checks the data:
  - ids are unique across groups and works;
  - every work has its name, artist, context, url, picture and math, and its year as text;
  - every `license` is one `creative.js` knows;
  - every `examples` names an example in the library's catalog;
  - every `relates` names a concept in the library's catalog or in the curriculum.
- **A coverage report,** not a failing test, lists the works with no turtle version yet: `npm run coverage` prints it after the curriculum's.

## Plan

1. **The page, with the references.**
   Done 2026-11-02: 33 works in four groups, none with a turtle version yet.
2. **Turtle versions.**
   Flow fields first, since a turtle following a field is turtle graphics already; then Truchet tiles, Schotter, Fourier epicycles, Substrate and differential growth.
   Each is a library example; ported only where the license allows, otherwise written from the math.
3. **A cross-page index.**
   One topic list across `/library`, `/compsci` and `/creative`, and any page added later, so a learning path can be planned for one person: from a picture they like to the math under it, or from a course to the art it makes.
   - It is built from what the pages already record: library examples' `concepts`, curriculum concepts' `examples` and `revisits`, and works' `examples` and `relates`.
     No page's data is copied into it.
   - A topic links to its entries on every page, so each page needs a link to a single entry: `/compsci` and `/creative` have them; `/library` links to an example but not yet to a concept.
   - A learning path is an ordered list of topics, or of entries across pages, which the index can check and draw.
   - What a topic is decides most of this: the library's 16 concepts, the curriculum's concepts, or a smaller shared vocabulary the others map onto.
     That is decided when this step starts, not now.

## Open questions

- **Linked from where.** Like `/library` and `/compsci`, the page is unlinked; it is linked once it has turtle versions to show.
- **Images of the originals.** The page shows no pictures of the works it credits, since their images are the artists'; whether to ask permission for thumbnails can wait.
