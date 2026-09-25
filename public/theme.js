// theme.js
// Day/night color theme. Owns the <html data-theme> attribute, the saved
// preference, the header toggle, and the browser's theme-color meta tag.
//
// Loaded as a classic, render-blocking script in <head> (not a module like
// the rest of the app) so the theme is applied before first paint; a
// deferred module would flash the wrong palette on every load. That is also
// why it reads localStorage directly instead of importing storage.js.
//
// With no saved choice the theme follows the OS setting, live. Clicking the
// toggle saves an explicit choice, which then wins over the OS.
// The palettes themselves live in styles.css under [data-theme].

(() => {
    const KEY    = 'luaturtle-theme';
    const root   = document.documentElement;
    const system = matchMedia('(prefers-color-scheme: light)');

    function saved() {
        try {
            const value = localStorage.getItem(KEY);
            return value === 'day' || value === 'night' ? value : null;
        } catch {
            return null;
        }
    }

    function save(theme) {
        try { localStorage.setItem(KEY, theme); } catch { /* preference only */ }
    }

    const current = () => root.dataset.theme;

    function syncControls() {
        const night  = current() === 'night';
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.setAttribute('aria-checked', String(night));
            toggle.title = night ? 'Switch to day mode' : 'Switch to night mode';
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = getComputedStyle(root).getPropertyValue('--surface').trim();
    }

    // Snap every color at once; only the toggle's thumb animates. Otherwise
    // elements with color transitions lag behind those without.
    function apply(theme, { animate = false } = {}) {
        if (theme === current()) return;
        if (animate) root.classList.add('theme-switching');
        root.dataset.theme = theme;
        syncControls();
        if (animate) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                root.classList.remove('theme-switching');
            }));
        }
    }

    apply(saved() || (system.matches ? 'day' : 'night'));

    system.addEventListener('change', (e) => {
        if (!saved()) apply(e.matches ? 'day' : 'night', { animate: true });
    });

    document.addEventListener('DOMContentLoaded', () => {
        syncControls();
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const next = current() === 'night' ? 'day' : 'night';
            save(next);
            apply(next, { animate: true });
        });
    });
})();
