// storage.js
// localStorage wrappers that never throw. Storage can be unavailable
// (private browsing, blocked site data); preferences are a convenience,
// so every caller degrades to its default instead of failing.

export function load(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch {
        return fallback;
    }
}

export function save(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* preference only */ }
}

// A value saved with saveJSON. Anything unreadable, like a value never
// saved, is the fallback.
export function loadJSON(key, fallback = null) {
    try {
        return JSON.parse(load(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

export function saveJSON(key, value) {
    save(key, JSON.stringify(value));
}

export function remove(key) {
    try { localStorage.removeItem(key); } catch { /* preference only */ }
}
