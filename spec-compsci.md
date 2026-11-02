# Spec: the computer science curriculum (`/compsci`)

Status: in progress, 2026-11-02: the page is built, with 18.06 filled in (plan step 2).
Sibling: [The library](architecture.md#the-library-library), whose examples, previews and tests this page reuses.

`/compsci` walks through the mathematics of an undergraduate computer science degree, course by course, in the order Scott H. Young took them in his [MIT Challenge](https://www.scotthyoung.com/blog/myprojects/mit-challenge-2/).
It teaches the concepts, their formulas and their applications, each shown by turtle programs a learner can run and change.
It does not teach the lectures: there is no lecture-by-lecture structure, no video, and no text, figure or problem taken from any course.

## Purpose

The library is a gallery: a learner browses what looks beautiful and finds the math behind it.
`/compsci` is the other direction: a learner who is following a computer science curriculum, or wants to, finds each idea they meet there in order, sees its equations, and watches it drawn.

## Principles

- **Concepts, not lectures.**
  An entry is an idea with a name, a few sentences, its key equations and its applications.
  Lectures, problem sets and exams decide only which ideas are in and in what order.
- **Our own words and our own equations.**
  Every summary, equation and program is written here.
  Sources are read to decide coverage and to check correctness, never copied.
  Ideas, formulas, facts and the order of a syllabus's topics are not anyone's expression, so no source's license binds this content; see [Sources and licensing](#sources-and-licensing).
- **The course order is kept.**
  Courses come in the MIT Challenge's order, and concepts within a course in the order the course teaches them.
- **Each idea lives once.**
  A concept belongs to the first course that teaches it; a later course that uses it lists it as revisited and links to it, rather than repeating it.
- **Every example is a library example.**
  Programs, previews and their tests are the library's own (`library/programs/`, `library/previews/`), so there is one pipeline and an example can appear on both pages.
- **Unfinished is fine, invisible gaps are not.**
  A concept may have no example yet, and its applications are filled in later; the page and the tests show what is missing rather than hiding it.

## Courses

The math and computer science subset of the MIT Challenge, in its order.
Physics, chemistry, biology, economics, 6.013 Electromagnetics and 24.244 Modal Logic are left out.

| # | Course | Topic order from | References |
|---|---|---|---|
| 1 | 18.01 Single Variable Calculus | OCW, Fall 2006 | OpenStax *Calculus* vols. 1–2 |
| 2 | 18.02 Multivariable Calculus | OCW, Fall 2007 | OpenStax *Calculus* vol. 3 |
| 3 | 6.01 Introduction to EECS I | OCW, 6.01SC Spring 2011 | Johnson; Grinstead & Snell; Erickson |
| 4 | 18.03 Differential Equations | OCW, Spring 2010 | Lebl |
| 5 | 6.02 Introduction to EECS II | Course site, Spring 2009 | Johnson; Bonaventure |
| 6 | 6.042J Mathematics for Computer Science | OCW, Spring 2010, archived | Lehman, Leighton & Meyer |
| 7 | 6.006 Introduction to Algorithms | OCW, Spring 2008 | Erickson |
| 8 | 18.06 Linear Algebra | OCW, Spring 2010 | Hefferon, *Linear Algebra* |
| 9 | 6.041 Probabilistic Systems Analysis | OCW, Spring 2006 | Grinstead & Snell |
| 10 | 6.002 Circuits and Electronics | OCW, Spring 2007 | Johnson |
| 11 | 6.046J Design and Analysis of Algorithms | OCW, Spring 2015 | Erickson |
| 12 | 6.034 Artificial Intelligence | OCW, Fall 2010 | Poole & Mackworth |
| 13 | 6.003 Signals and Systems | OCW, Spring 2010, archived | Baraniuk |
| 14 | 6.004 Computation Structures | OCW, Spring 2009 | Carpinelli |
| 15 | 24.241 Logic I | OCW, Fall 2009 | *forall x: Calgary* |
| 16 | 6.033 Computer System Engineering | OCW, Spring 2009, archived | Bonaventure (networking) |
| 17 | 24.242 Logic II | OCW, Spring 2004 | Zach, *Sets, Logic, Computation* and *Incompleteness and Computability* |
| 18 | 6.011 Communication, Control and Signal Processing | OCW, Spring 2010 | Baraniuk; Grinstead & Snell |
| 19 | 6.005 Elements of Software Construction | OCW, Fall 2008 | Wikipedia only |
| 20 | 6.801 Machine Vision | OCW, Fall 2004 | Torralba, Isola & Freeman |
| 21 | 6.837 Computer Graphics | OCW, Fall 2003, archived | *Computer Graphics and Multimedia* |
| 22 | Theory of Computation | Georgetown COSC 545, Spring 2012, archived | Hefferon, *Theory of Computation* |

Every topic order is the edition Scott took, except 6.046J: his Fall 2011 site needs an MIT login, so the Spring 2015 OCW edition stands in.
Wikipedia is a second check on every equation, in every course.

Five of those pages are gone from the live web and are read from the Wayback Machine:

| Course | Archived page |
|---|---|
| 6.042J | [Calendar, Spring 2010](https://web.archive.org/web/2012/http://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-042j-mathematics-for-computer-science-spring-2010/calendar/) |
| 6.003 | [Calendar, Spring 2010](https://web.archive.org/web/2012/http://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-003-signals-and-systems-spring-2010/calendar/) |
| 6.033 | [Lecture notes, Spring 2009](https://web.archive.org/web/2010/http://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-033-computer-system-engineering-spring-2009/lecture-notes/) |
| 6.837 | [Calendar, Fall 2003](https://web.archive.org/web/2010/http://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-837-computer-graphics-fall-2003/calendar/) |
| COSC 545 | [Course page, Spring 2012](https://web.archive.org/web/20140131080651/http://cs.georgetown.edu/~cnewport/teaching/cosc545-spring12/) |

6.02's Spring 2009 site is still live; its [calendar](http://web.mit.edu/6.02/www/s2009/calendar.html) lists the lectures in order.

Some courses have few formulas (6.005, 6.033).
Their concepts are still ideas with structure, such as state machines, invariants, queues, reliability and congestion control, and their programs draw diagrams, timelines and simulations instead of curves.

## Sources and licensing

Every source is used the same way: its topics and their order decide coverage, and its text confirms an equation or a definition.
Nothing is copied from any of them: no sentence, figure, worked example or problem.
Topic names and the order of topics are facts and are used as they are.
So a source's license binds nothing here; a permissively licensed reference is preferred where one exists, and the license is recorded so the page can credit each source properly.
Scott Young's own notes, exam answers and code are not used.

The sources, as checked on 2026-11-02:

| Source | License |
|---|---|
| MIT OpenCourseWare course pages | CC BY-NC-SA 4.0 |
| Lehman, Leighton & Meyer, *Mathematics for Computer Science*, 2017 | CC BY-SA 3.0 (earlier editions: all rights reserved) |
| Erickson, *Algorithms*, 2019 | CC BY 4.0 |
| Hefferon, *Linear Algebra* and *Theory of Computation* | CC BY-SA or GFDL |
| Lebl, *Notes on Diffy Qs* | CC BY-SA 4.0 or CC BY-NC-SA 4.0 |
| Grinstead & Snell, *Introduction to Probability* | GFDL 1.3 |
| Johnson, *Fundamentals of Electrical Engineering I* (OpenStax CNX) | CC BY (sources differ on 1.0 or 4.0) |
| Baraniuk et al., *Signals and Systems* (OpenStax CNX, on LibreTexts) | CC BY 3.0 |
| Bonaventure, *Computer Networking: Principles, Protocols and Practice* | CC BY 3.0 |
| Button, Magnus, Thomas-Bolduc & Zach, *forall x: Calgary* | CC BY 4.0 |
| Zach, *Sets, Logic, Computation* and *Incompleteness and Computability* (Open Logic Project) | CC BY 4.0 |
| *Computer Graphics and Multimedia*, Kennesaw State | CC BY 4.0 |
| OpenStax *Calculus* | CC BY-NC-SA 4.0 |
| Poole & Mackworth, *Artificial Intelligence: Foundations of Computational Agents*, 3rd ed. | CC BY-NC-SA 4.0 |
| Carpinelli, *An Animated Introduction to Digital Logic Design* | CC BY-NC-SA 4.0 |
| Torralba, Isola & Freeman, *Foundations of Computer Vision* | CC BY-NC-ND |
| Wikipedia | CC BY-SA 4.0 |

No permissively licensed book was found for 6.034 AI, 6.004 or 6.005; the AI and digital-logic references are non-commercial, and 6.005 rests on Wikipedia alone.
MIT's own 6.031 readings, 6.005's successor, state no license.

Every concept records the sources it was checked against, so the page can credit them and a later reader can recheck it.
Downloaded source material is never committed.

## The data

The curriculum is pure data under `public/compsci/`, like the library's catalog.

- **`courses.json` lists the courses** in order: `{id, number, name, about, syllabus, sources}`, where `id` is a slug such as `18-01`, `syllabus` is `{label, url}`, the page the topic order was read from, and `sources` names the rows of `sources.json` the course was built from.
- **`sources.json` lists the sources:** `{id, title, authors, license, url}`.
- **`courses/<id>.json` holds one course:** its units in order, each `{id, name, concepts}`, and its concepts in order within each unit.
  A course per file keeps diffs and reviews to one course at a time.
  A course not written yet has its file, holding `{"units": []}`, and the page says it is not written yet.

A concept is:

```json
{
  "id": "eigenvalues",
  "name": "Eigenvalues and eigenvectors",
  "summary": "A direction a matrix only stretches, and how much it stretches it.",
  "equations": [
    { "tex": "A\\mathbf{v} = \\lambda\\mathbf{v}", "says": "A moves v along its own line, scaled by λ." },
    { "tex": "\\det(A - \\lambda I) = 0", "says": "The λ that make this true are the eigenvalues." }
  ],
  "revisits": [],
  "examples": ["eigenvector-arrows"],
  "applications": [],
  "checked": ["hefferon-la", "wikipedia"]
}
```

- `id` is unique across the whole curriculum, so a link names a concept alone (`/compsci#eigenvalues`).
- `equations` are TeX, each with one plain sentence saying what it means.
- `revisits` names concepts from earlier courses that this one builds on, shown as links.
- `examples` names library examples, in the order they are shown.
- `applications` is left empty for now; the applications, real-world case studies and other context are filled in after the concepts.
  The shape of an application is decided then, not now.
- `checked` names rows of `sources.json`.

The library's `catalog.json` keeps listing every example, so its tests still cover every program.
An example made for `/compsci` lists no library concept unless it suits the gallery; the gallery shows only examples with at least one library concept.

## The page

`/compsci` is a third page, built like `/library` and, like it, linked from nowhere yet.

- **The sidebar** holds a search bar and the courses in order, each opening to its units.
- **The main column** shows a course as one scrolling page: each concept with its name, summary, equations, a "builds on" line for its revisits, and its examples as the library's cards, playing on hover and running on the page's canvas.
- **A concept with no example yet** says so in place of its cards.
- **Search** ranks a word in a concept's name above one in its summary, above one in the course's name, the way the library's search does.
- **The link** names the concept (`/compsci#eigenvalues`), or the course (`/compsci#18-06`).

Equations are rendered with KaTeX, vendored under `public/vendor/` as CodeMirror is.

The pieces follow the library's split:

- **`compsci.js` decides.** Pure functions of the courses: the course a page opens on, the concept or course a link names, a course's view, what a search finds, a concept's revisits resolved to their courses, and each course's coverage.
- **`compsci-page.js` is the shell.** It fetches the course files, renders what `compsci.js` returns, renders the equations, and runs examples.
- **The card and the canvas are shared with `/library`.** `example-cards.js` draws and plays the cards, `example-stage.js` runs an example on the canvas with its code beneath, and `browse.css` lays out both pages.

## Tests

- **`test/compsci_test.mjs`** covers `compsci.js` and checks the data:
  - courses are in the table's order;
  - ids are unique across the curriculum;
  - every `revisits` names a concept in an earlier course;
  - every `examples` names an example in the library's catalog;
  - every `checked` and `sources` names a source;
  - every equation's TeX renders with KaTeX without an error.
- **The programs** are already run by `test/library_test.lua`, and their previews checked by `test/library_test.mjs`, because every example is a library example.
- **A coverage report,** not a failing test, counts the concepts in each course that have no example yet, so the gaps are visible as the work goes on: `npm run coverage` (`tools/compsci-coverage.mjs`).

## Plan

1. **Sources.**
   Done 2026-11-02: every course has a topic order it can be read from, and a reference.
2. **The page, empty.**
   `compsci.js`, `compsci-page.js`, the shared card module, KaTeX, and the tests, with one course filled in.
   18.06 Linear Algebra is a good first course: many concepts that draw well, and a clear reference.
   Done 2026-11-02: 18.06 has 7 units and 35 concepts, 12 with examples, five of them new (`linear-combinations`, `linear-map-grid`, `eigenvector-arrows`, `least-squares-line`, `svd-circle`).
3. **The skeleton.**
   Every course's units and concepts, in order, with summaries, equations, revisits and checked sources, but no new examples.
   One course per change, reviewed one at a time.
4. **The examples.**
   Programs for the concepts, course by course in order, existing library examples first where one already fits.
5. **Applications and context,** after the concepts, in a shape decided then.

## Open questions

- **How many examples a concept wants.**
  One that shows the idea is the floor; whether to aim for more, from different angles as the Lessons do, can wait until a course is done and looked at.
- **Lessons or gallery.**
  A concept's examples could be walked through step by step, as the Lessons' are (`--:` comments), instead of shown as cards; start with cards, and decide after a course is done.
- **A feature flag.**
  `/compsci` is unlinked, as `/library` is; whether it also wants an entry in `flags.json` before it is linked is decided when it is.
