// creative.js
// The /creative page's decisions, as pure functions over its works
// (creative/works.json): what a link names, each work as the page shows it,
// whether a work's code may be ported, what a search finds, and which works
// have no turtle version yet. creative-page.js is the shell that renders
// what these return. test/creative_test.mjs covers them. spec-creative.md
// describes the data.
//
// The works are {groups: [{id, name, about, works}]}. A work is {id, name,
// artist, year, context, url, code: {label, url} | null, license, picture,
// math, examples: [library example id], relates: {library: [library
// concept id], compsci: [curriculum concept id]}}.

import { normalize, tokens } from './library.js';
import { allConcepts } from './compsci.js';

// The licenses a work's code may carry: how the page names each, and
// whether it lets us port the code (otherwise our version is written from
// the math alone).
export const LICENSES = {
    'mit':                 { name: 'MIT',                 port: true },
    'bsd-3-clause':        { name: 'BSD-3-Clause',        port: true },
    'apache-2.0':          { name: 'Apache-2.0',          port: true },
    'unlicense':           { name: 'Unlicense',           port: true },
    'lgpl-2.1':            { name: 'LGPL-2.1',            port: false },
    'cc-by-nc-sa-3.0':     { name: 'CC BY-NC-SA 3.0',     port: false },
    'cc-by-nc-sa-4.0':     { name: 'CC BY-NC-SA 4.0',     port: false },
    'all-rights-reserved': { name: 'All rights reserved', port: false },
    'none-stated':         { name: 'No license stated',   port: false },
    'not-public':          { name: 'Code not public',     port: false },
};

// Every work in page order, as {work, group}.
export function allWorks(data) {
    return data.groups.flatMap((group) => group.works.map((work) => ({ work, group })));
}

// What a location hash names: a group (#patterns) or a work (#substrate),
// as {group, work}, work null for a group; or null.
export function targetFromHash(data, hash) {
    let id;
    try {
        id = decodeURIComponent(String(hash).replace(/^#/, ''));
    } catch {
        return null;
    }
    if (!id) return null;
    const group = data.groups.find((g) => g.id === id);
    if (group) return { group, work: null };
    return allWorks(data).find((entry) => entry.work.id === id) ?? null;
}

// A work as the page shows it: its license by name and whether it may be
// ported, its turtle versions from the library's catalog, and the concepts
// it draws on, in the library and in the curriculum (each with its course).
// Ids that name nothing are left out; the tests catch them.
export function workEntry(catalog, courses, { work, group }) {
    const examplesById = new Map(catalog.examples.map((example) => [example.id, example]));
    const libraryById = new Map(catalog.concepts.map((concept) => [concept.id, concept]));
    const compsciById = new Map(allConcepts(courses).map((entry) => [entry.concept.id, entry]));
    return {
        work,
        group,
        license: LICENSES[work.license] ?? { name: work.license, port: false },
        examples: work.examples.map((id) => examplesById.get(id)).filter(Boolean),
        library: work.relates.library.map((id) => libraryById.get(id)).filter(Boolean),
        compsci: work.relates.compsci.map((id) => compsciById.get(id)).filter(Boolean)
            .map((entry) => ({ concept: entry.concept, course: entry.course })),
    };
}

// What the page shows: every group in order, each with its works as
// workEntry gives them.
export function pageView(data, catalog, courses) {
    return data.groups.map((group) => ({
        group,
        works: group.works.map((work) => workEntry(catalog, courses, { work, group })),
    }));
}

// How well a work matches every word: 0 if some word is missing,
// otherwise higher the more of them hit its name, then its artist, then
// its context, picture, math and group.
export function matchScore({ work, group }, words) {
    const name = normalize(work.name);
    const artist = normalize(work.artist);
    const body = normalize([work.context, work.picture, work.math, group.name, work.id].join(' '));
    let score = 0;
    for (const word of words) {
        if (name.includes(word)) score += name.split(/\s+/).some((w) => w.startsWith(word)) ? 4 : 3;
        else if (artist.includes(word)) score += 2;
        else if (body.includes(word)) score += 1;
        else return 0;
    }
    return score;
}

// The works a search finds, best first, ties in page order, as workEntry
// gives them; none for an empty query.
export function searchView(data, catalog, courses, query) {
    const words = tokens(query);
    if (!words.length) return [];
    return allWorks(data)
        .map((entry, order) => ({ entry, order, score: matchScore(entry, words) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map((hit) => workEntry(catalog, courses, hit.entry));
}

// How many works there are and which have no turtle version yet: the gaps
// tools/compsci-coverage.mjs reports.
export function coverage(data) {
    const works = allWorks(data).map((entry) => entry.work);
    return {
        works: works.length,
        withoutExamples: works.filter((work) => work.examples.length === 0).map((work) => work.id),
    };
}
