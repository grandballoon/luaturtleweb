// tools/flags.mjs
// Lists and flips the feature flags in public/flags.json (see
// public/flags.js). The site is static, so a change goes live on the next
// deploy, and in the dev server on the next page load.
//
// Run from anywhere:
//   node tools/flags.mjs list
//   node tools/flags.mjs on <name>
//   node tools/flags.mjs off <name>

import { readFileSync, writeFileSync } from 'node:fs';
import { formatFlags, readFlags, setFlag } from '../public/flags.js';

const FILE = new URL('../public/flags.json', import.meta.url);
const USAGE = 'Usage: node tools/flags.mjs list | on <name> | off <name>';

const [command, name] = process.argv.slice(2);
const file = JSON.parse(readFileSync(FILE, 'utf8'));

if (command === 'list' && !name) {
    console.log(formatFlags(readFlags(file)));
} else if ((command === 'on' || command === 'off') && name) {
    const { flags, error } = setFlag(file, name, command === 'on');
    if (error) {
        console.error(error);
        process.exit(1);
    }
    writeFileSync(FILE, JSON.stringify(flags, null, 2) + '\n');
    console.log(formatFlags(flags));
} else {
    console.error(USAGE);
    process.exit(1);
}
