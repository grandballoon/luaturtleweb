// flags.js
// Feature flags' pure core. public/flags.json names each flag and says
// whether it is on; a `?flags=` query can override them in one browser
// tab, as in `?flags=-share,lessons` (a leading `-` turns a flag off).
// No DOM, no fetch: app.js reads the file and the query and hides what is
// off, and tools/flags.mjs edits the file.

// A flag is on unless the file or the query turns it off, so a missing or
// unreadable file leaves every feature on.
export function isOn(flags, name) {
    return flags[name] !== false;
}

// The file's boolean entries; anything else in it is ignored.
export function readFlags(file) {
    const flags = {};
    if (file && typeof file === 'object' && !Array.isArray(file)) {
        for (const [name, value] of Object.entries(file)) {
            if (typeof value === 'boolean') flags[name] = value;
        }
    }
    return flags;
}

// The file's flags with a location.search's `flags=` overrides applied.
// Only flags the file names can be overridden, so a typo changes nothing.
export function resolveFlags(file, search = '') {
    const flags = readFlags(file);
    const query = new URLSearchParams(search).get('flags');
    if (!query) return flags;
    for (const item of query.split(',').map(s => s.trim())) {
        const off = item.startsWith('-');
        const name = off ? item.slice(1) : item;
        if (name in flags) flags[name] = !off;
    }
    return flags;
}

// The file with one flag set, or an error naming the flags that exist.
export function setFlag(file, name, on) {
    const flags = readFlags(file);
    if (!(name in flags)) {
        return { error: `No flag named "${name}". Flags: ${Object.keys(flags).join(', ')}` };
    }
    return { flags: { ...flags, [name]: on } };
}

// One "name  on|off" line per flag, names padded to line up.
export function formatFlags(flags) {
    const width = Math.max(0, ...Object.keys(flags).map(name => name.length));
    return Object.entries(flags)
        .map(([name, on]) => `${name.padEnd(width)}  ${on ? 'on' : 'off'}`)
        .join('\n');
}
