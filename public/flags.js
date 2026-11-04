// flags.js
// Feature flags' pure core. public/flags.json names each flag and says
// whether it is on: true, false, or "staging", on everywhere but the
// production site (staging, and the dev server). A `?flags=` query can
// override them in one browser tab, as in `?flags=-share,lessons` (a
// leading `-` turns a flag off), except that nothing turns a "staging"
// flag on in production.
// No DOM, no fetch: app.js reads the file, the query and the hostname and
// hides what is off, and tools/flags.mjs edits the file.

// The production site's hostnames: the production routes in wrangler.jsonc,
// which test/flags_test.mjs keeps them equal to.
export const PRODUCTION_HOSTS = ['luaturtle.com', 'www.luaturtle.com'];

// The values a flag can have in the file.
export const STAGING = 'staging';
const isValue = (value) => typeof value === 'boolean' || value === STAGING;

// A flag is on unless the file or the query turns it off, so a missing or
// unreadable file leaves every feature on.
export function isOn(flags, name) {
    return flags[name] !== false;
}

// The file's entries that are flag values; anything else in it is ignored.
export function readFlags(file) {
    const flags = {};
    if (file && typeof file === 'object' && !Array.isArray(file)) {
        for (const [name, value] of Object.entries(file)) {
            if (isValue(value)) flags[name] = value;
        }
    }
    return flags;
}

export function isProduction(hostname) {
    return PRODUCTION_HOSTS.includes(String(hostname).toLowerCase());
}

// Whether each of the file's flags is on, at `hostname`, with a
// location.search's `flags=` overrides applied. Only flags the file names
// can be overridden, so a typo changes nothing; a "staging" flag stays off
// in production whatever the query says.
export function resolveFlags(file, search = '', hostname = '') {
    const production = isProduction(hostname);
    const values = readFlags(file);
    const flags = Object.fromEntries(Object.entries(values)
        .map(([name, value]) => [name, value === STAGING ? !production : value]));
    const query = new URLSearchParams(search).get('flags');
    if (!query) return flags;
    for (const item of query.split(',').map(s => s.trim())) {
        const off = item.startsWith('-');
        const name = off ? item.slice(1) : item;
        if (!(name in flags)) continue;
        flags[name] = !off && !(production && values[name] === STAGING);
    }
    return flags;
}

// The file with one flag set to `value` (true, false or "staging"), or an
// error naming the flags that exist.
export function setFlag(file, name, value) {
    const flags = readFlags(file);
    if (!(name in flags)) {
        return { error: `No flag named "${name}". Flags: ${Object.keys(flags).join(', ')}` };
    }
    return { flags: { ...flags, [name]: value } };
}

// One "name  on|off|staging" line per flag, names padded to line up.
export function formatFlags(flags) {
    const width = Math.max(0, ...Object.keys(flags).map(name => name.length));
    const label = (value) => (value === STAGING ? STAGING : value ? 'on' : 'off');
    return Object.entries(flags)
        .map(([name, value]) => `${name.padEnd(width)}  ${label(value)}`)
        .join('\n');
}
