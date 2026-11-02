// example-cards.js
// The cards the browsing pages (/library, /compsci, /creative) show for library
// examples: a preview video, the example's name and what it shows, and a
// button that runs it on the page's canvas.
//
// A card shows its poster, the finished drawing, loaded as it nears the
// view. Its video loads and plays from the start only while the mouse is
// over the card or the card has keyboard focus, one at a time, and never
// under reduced motion; when it stops, the card shows the finished drawing
// again (the video ends holding it). Cards are kept across renders under a
// key the page chooses, so re-rendering never reloads a video.

import { videoPath, posterPath } from './library.js';

const RUN_ICON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z" fill="currentColor" stroke="none"/></svg>';

// Cards inside `root`, the scrolling element they sit in. onRun(example) is
// called when a card's button or preview is clicked.
export function createCards({ root, onRun }) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const cards = new Map();   // key → its card
    let playing = null;        // the card whose preview is playing

    const nearView = new IntersectionObserver((entries) => {
        for (const { target, isIntersecting } of entries) {
            if (!isIntersecting) continue;
            target.querySelector('video').poster = posterPath(target.dataset.id);
            nearView.unobserve(target);
        }
    }, { root, rootMargin: '300px 0px' });

    function play(li) {
        if (playing === li || reducedMotion.matches) return;
        stop();
        playing = li;
        const video = li.querySelector('video');
        if (!video.src) video.src = videoPath(li.dataset.id);
        if (Number.isFinite(video.duration)) video.currentTime = 0;
        video.play().catch(() => { /* not allowed or interrupted: the poster stays */ });
    }

    function stop() {
        if (!playing) return;
        const video = playing.querySelector('video');
        playing = null;
        video.pause();
        // Before a frame has shown, the poster still does.
        if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 0.1);
    }

    reducedMotion.addEventListener('change', stop);

    function build(example) {
        const li = document.createElement('li');
        li.className = 'example-card';
        li.dataset.id = example.id;

        const preview = document.createElement('div');
        preview.className = 'example-card-preview';
        const video = document.createElement('video');
        Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none', disablePictureInPicture: true });
        video.setAttribute('aria-hidden', 'true');
        preview.append(video);

        const body = document.createElement('div');
        body.className = 'example-card-body';
        const name = document.createElement('h3');
        name.className = 'example-card-name';
        name.textContent = example.name;
        const about = document.createElement('p');
        about.className = 'example-card-about';
        about.textContent = example.about;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'example-card-run';
        button.innerHTML = `${RUN_ICON}<span>Run on canvas</span>`;
        button.setAttribute('aria-label', `Run ${example.name} on the canvas`);
        body.append(name, about, button);
        li.append(preview, body);

        button.addEventListener('click', () => onRun(example));
        // The preview is a larger target for the same thing.
        preview.addEventListener('click', () => onRun(example));
        // A touch has no hover: a tap runs the example instead.
        li.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') play(li); });
        // Keyboard focus only: a clicked button keeps its focus, but not :focus-visible.
        li.addEventListener('pointerleave', () => { if (playing === li && !li.querySelector(':focus-visible')) stop(); });
        li.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) play(li); });
        li.addEventListener('focusout', (e) => { if (playing === li && !li.contains(e.relatedTarget) && !li.matches(':hover')) stop(); });
        nearView.observe(li);
        return li;
    }

    return {
        // The card for `example` under `key`, made the first time.
        card(key, example) {
            if (!cards.has(key)) cards.set(key, build(example));
            return cards.get(key);
        },
        // Marks the cards of the example with this id (or none, for null).
        select(id) {
            for (const li of cards.values()) {
                const selected = id !== null && li.dataset.id === id;
                li.classList.toggle('selected', selected);
                li.querySelector('.example-card-run').setAttribute('aria-pressed', String(selected));
            }
        },
        // Stops the playing preview: its card may leave the page without a pointerleave.
        stop,
    };
}
