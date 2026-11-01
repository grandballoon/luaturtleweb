// library.js
// The /library page's decisions, as pure functions over the catalog
// (library/catalog.json): which examples a search finds, how the gallery
// groups them, and which example a link names. library-page.js is the
// shell that renders what these return. test/library_test.mjs covers them.
//
// The catalog is {concepts: [{id, name, about}], examples: [{id, name,
// about, concepts: [concept id]}]}: concepts and examples are many to many,
// so an example shows under every concept it lists.

// Lowercase and without accents, so "Lissajous" finds "lissajous" and
// "Sierpiński" finds "sierpinski".
export function normalize(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function tokens(query) {
    return normalize(query).split(/[\s,]+/).filter(Boolean);
}

// How well an example matches every token: 0 if some token is missing,
// otherwise higher the more of them hit its name, then its concepts.
export function matchScore(example, conceptsById, words) {
    const name = normalize(example.name);
    const concepts = normalize(example.concepts.map((id) => conceptsById.get(id)?.name ?? id).join(' '));
    const rest = normalize(`${example.id} ${example.about}`);
    let score = 0;
    for (const word of words) {
        if (name.includes(word)) score += name.split(/\s+/).some((w) => w.startsWith(word)) ? 4 : 3;
        else if (concepts.includes(word)) score += 2;
        else if (rest.includes(word)) score += 1;
        else return 0;
    }
    return score;
}

// What the gallery shows for a query and a selected concept (an id, or null
// for all of them), as {sections: [{id, title, about, examples}], count}.
// count is how many different examples are shown.
// - Nothing searched: a section per concept, in catalog order, each with
//   every example that lists it; just the selected concept's, if one is.
// - A search: one section of results, best first, ties in catalog order,
//   within the selected concept if one is.
export function libraryView(catalog, { query = '', concept = null } = {}) {
    const conceptsById = new Map(catalog.concepts.map((c) => [c.id, c]));
    const inConcept = (example) => concept === null || example.concepts.includes(concept);
    const words = tokens(query);

    if (words.length) {
        const found = catalog.examples
            .filter(inConcept)
            .map((example, order) => ({ example, order, score: matchScore(example, conceptsById, words) }))
            .filter((hit) => hit.score > 0)
            .sort((a, b) => b.score - a.score || a.order - b.order)
            .map((hit) => hit.example);
        const within = concept === null ? '' : ` in ${conceptsById.get(concept)?.name ?? concept}`;
        return {
            sections: found.length ? [{ id: 'results', title: `Results${within}`, about: '', examples: found }] : [],
            count: found.length,
        };
    }

    const sections = catalog.concepts
        .filter((c) => concept === null || c.id === concept)
        .map((c) => ({
            id: c.id,
            title: c.name,
            about: c.about,
            examples: catalog.examples.filter((example) => example.concepts.includes(c.id)),
        }))
        .filter((section) => section.examples.length);
    const shown = new Set(sections.flatMap((section) => section.examples.map((example) => example.id)));
    return { sections, count: shown.size };
}

// How many examples list each concept, by concept id.
export function conceptCounts(catalog) {
    const counts = Object.fromEntries(catalog.concepts.map((c) => [c.id, 0]));
    for (const example of catalog.examples) {
        for (const id of example.concepts) if (id in counts) counts[id]++;
    }
    return counts;
}

// The example a location hash (#rose-curve) names, or null.
export function exampleFromHash(catalog, hash) {
    let id;
    try {
        id = decodeURIComponent(String(hash).replace(/^#/, ''));
    } catch {
        return null;
    }
    return catalog.examples.find((example) => example.id === id) ?? null;
}

// Where an example's program and its preview live, relative to the page.
export function programPath(id) { return `library/programs/${id}.lua`; }
export function videoPath(id)   { return `library/previews/${id}.mp4`; }
export function posterPath(id)  { return `library/previews/${id}.webp`; }
