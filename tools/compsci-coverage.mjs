// tools/compsci-coverage.mjs
// Reports how much of the /compsci curriculum is filled in: for each
// course, its concepts and those without an example, a metaphor or an
// application yet. A report, not a test: a concept may wait for them
// (spec-compsci.md).
//
// Run from the repo root:  npm run coverage

import { readFile } from 'node:fs/promises';
import { coursePath, joinCourses, coverage } from '../public/compsci.js';

const PUBLIC = new URL('../public/', import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, PUBLIC), 'utf8'));

const meta = await json('compsci/courses.json');
const files = Object.fromEntries(await Promise.all(meta.map(async (c) => [c.id, await json(coursePath(c.id))])));
const rows = coverage(joinCourses(meta, files));

for (const row of rows) {
    const label = `${row.number} ${row.name}`.padEnd(54);
    if (row.concepts === 0) {
        console.log(`${label} not written yet`);
        continue;
    }
    const shown = row.concepts - row.withoutExamples.length;
    console.log(`${label} ${String(shown).padStart(3)} of ${String(row.concepts).padEnd(3)} concepts have an example`);
    if (row.withoutExamples.length) console.log(`    without an example: ${row.withoutExamples.join(', ')}`);
    if (row.withoutMetaphors.length) console.log(`    without a metaphor: ${row.withoutMetaphors.join(', ')}`);
    if (row.withoutApplications.length) console.log(`    without an application: ${row.withoutApplications.join(', ')}`);
}
