// compsci.js
// The /compsci page's decisions, as pure functions over the curriculum
// (compsci/): which course and concept a link names, what a course's page
// shows, what a search finds, and how much of each course has examples.
// compsci-page.js is the shell that renders what these return.
// test/compsci_test.mjs covers them. spec-compsci.md describes the data.
//
// A course is its entry in courses.json, {id, number, name, about,
// syllabus: {label, url}, sources: [source id]}, joined to its file
// courses/<id>.json, {units: [{id, name, concepts}]}. A concept is {id,
// name, summary, equations: [{tex, says}], revisits: [concept id],
// examples: [library example id], applications, checked: [source id]}.

import { normalize, tokens } from './library.js';

// Where a course's file lives, relative to the page.
export function coursePath(id) { return `compsci/courses/${id}.json`; }

// The courses in order, each with the units its file holds (none for a
// course whose file is missing: not written yet).
export function joinCourses(meta, files) {
    return meta.map((course) => ({ ...course, units: files[course.id]?.units ?? [] }));
}

// Every concept in curriculum order, as {concept, unit, course}.
export function allConcepts(courses) {
    return courses.flatMap((course) =>
        course.units.flatMap((unit) => unit.concepts.map((concept) => ({ concept, unit, course }))));
}

export function conceptCount(course) {
    return course.units.reduce((n, unit) => n + unit.concepts.length, 0);
}

// The course a page opens on: the first with concepts, or else the first.
export function defaultCourse(courses) {
    return courses.find((course) => conceptCount(course) > 0) ?? courses[0] ?? null;
}

// What a location hash names: a course (#18-06) or a concept
// (#eigenvalues), as {course, concept}, concept null for a course; or null.
export function targetFromHash(courses, hash) {
    let id;
    try {
        id = decodeURIComponent(String(hash).replace(/^#/, ''));
    } catch {
        return null;
    }
    if (!id) return null;
    const course = courses.find((c) => c.id === id);
    if (course) return { course, concept: null };
    const found = allConcepts(courses).find((entry) => entry.concept.id === id);
    return found ? { course: found.course, concept: found.concept } : null;
}

// A concept as the page shows it: its examples from the library's catalog,
// the earlier concepts it builds on with their courses, and the sources it
// was checked against. Ids that name nothing are left out; the tests catch
// them.
export function conceptEntry(courses, catalog, sources, { concept, unit, course }) {
    const examplesById = new Map(catalog.examples.map((example) => [example.id, example]));
    const sourcesById = new Map(sources.map((source) => [source.id, source]));
    const concepts = new Map(allConcepts(courses).map((entry) => [entry.concept.id, entry]));
    return {
        concept,
        unit,
        course,
        examples: concept.examples.map((id) => examplesById.get(id)).filter(Boolean),
        revisits: concept.revisits.map((id) => concepts.get(id)).filter(Boolean)
            .map((entry) => ({ concept: entry.concept, course: entry.course })),
        checked: concept.checked.map((id) => sourcesById.get(id)).filter(Boolean),
    };
}

// What the page shows for a course: its units in order, each with its
// concepts as conceptEntry gives them.
export function courseView(courses, catalog, sources, course) {
    return {
        course,
        sources: course.sources.map((id) => sources.find((source) => source.id === id)).filter(Boolean),
        units: course.units.map((unit) => ({
            unit,
            concepts: unit.concepts.map((concept) => conceptEntry(courses, catalog, sources, { concept, unit, course })),
        })),
    };
}

// How well a concept matches every word: 0 if some word is missing,
// otherwise higher the more of them hit its name, then its summary and
// equations, then its course.
export function matchScore({ concept, course }, words) {
    const name = normalize(concept.name);
    const body = normalize([concept.summary, ...concept.equations.map((e) => e.says)].join(' '));
    const where = normalize(`${course.number} ${course.name} ${concept.id}`);
    let score = 0;
    for (const word of words) {
        if (name.includes(word)) score += name.split(/\s+/).some((w) => w.startsWith(word)) ? 4 : 3;
        else if (body.includes(word)) score += 2;
        else if (where.includes(word)) score += 1;
        else return 0;
    }
    return score;
}

// The concepts a search finds, best first, ties in curriculum order, as
// conceptEntry gives them; none for an empty query.
export function searchView(courses, catalog, sources, query) {
    const words = tokens(query);
    if (!words.length) return [];
    return allConcepts(courses)
        .map((entry, order) => ({ entry, order, score: matchScore(entry, words) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((hit) => conceptEntry(courses, catalog, sources, hit.entry));
}

// For each course, how many concepts it has and how many have no example
// yet: the gaps tools/compsci-coverage.mjs reports.
export function coverage(courses) {
    return courses.map((course) => {
        const concepts = course.units.flatMap((unit) => unit.concepts);
        return {
            id: course.id,
            number: course.number,
            name: course.name,
            concepts: concepts.length,
            withoutExamples: concepts.filter((concept) => concept.examples.length === 0).map((concept) => concept.id),
        };
    });
}
