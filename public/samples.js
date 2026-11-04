// samples.js
// The sample programs the transcription panel offers, as pure functions:
// every example in the Lessons (turtle/lessons.lua, as lessons.js's pages)
// and every program in the Library (library/catalog.json), in groups, and
// what a search finds among them. No DOM, no fetch; transcribe-panel.js is
// the shell. test/transcribe_test.mjs covers them.
//
// A sample is {id, group, title, detail, code?}: a lesson's program comes
// with the lessons, so it has its code; a library program is fetched when
// it is chosen, from programPath(libraryId).

import { normalize, tokens } from './library.js';

// The samples, in groups: the Lessons, chapter by chapter, then the
// Library, in catalog order. A group is {id, title, samples}; a group with
// no samples (the lessons not loaded yet) is left out.
export function sampleGroups(pages, catalog) {
    const groups = [];
    for (const page of pages) {
        const id = `lessons/${page.chapter.index}`;
        let group = groups[groups.length - 1];
        if (!group || group.id !== id) {
            group = { id, title: `Lessons · ${page.chapter.title}`, samples: [] };
            groups.push(group);
        }
        group.samples.push({
            id: `lesson:${page.id}`,
            group: group.title,
            title: page.title,
            detail: page.lesson.title,
            code: page.code,
        });
    }
    const library = (catalog?.examples ?? []).map((example) => ({
        id: `library:${example.id}`,
        group: 'Library',
        title: example.name,
        detail: example.about,
        libraryId: example.id,
    }));
    if (library.length) groups.push({ id: 'library', title: 'Library', samples: library });
    return groups;
}

// The groups narrowed to the samples whose title, detail or group has every
// word of `query`; groups left empty are dropped.
export function searchSamples(groups, query) {
    const words = tokens(query);
    if (!words.length) return groups;
    return groups
        .map((group) => ({
            ...group,
            samples: group.samples.filter((sample) => {
                const text = normalize(`${sample.title} ${sample.detail} ${sample.group}`);
                return words.every((word) => text.includes(word));
            }),
        }))
        .filter((group) => group.samples.length);
}

// The sample with this id, or null.
export function findSample(groups, id) {
    for (const group of groups) {
        const sample = group.samples.find((s) => s.id === id);
        if (sample) return sample;
    }
    return null;
}
