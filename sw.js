/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Service Worker
 * Cache-first for local statics, network-first for CDN/API,
 * lazy-caches large VRM/VRMA assets after first download.
 * ═══════════════════════════════════════════════════════════
 */

const CACHE_NAME = 'reina-ar-v6';

/** Core static assets to pre-cache on install */
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/main.js',
    './js/ar/xrManager.js',
    './js/vrm/vrmLoader.js',
    './js/vrm/animationManager.js',
    './js/speech/speechController.js',
    './js/llm/apiService.js',
    './js/llm/tagParser.js',
    './js/events/motorEvent.js',
    './manifest.json'
];

/* ──────── INSTALL ──────── */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

/* ──────── ACTIVATE ──────── */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

/* ──────── FETCH ──────── */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    /* Skip non-GET */
    if (event.request.method !== 'GET') return;

    /* ── Network-only: Gemini API calls ── */
    if (url.hostname === 'generativelanguage.googleapis.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    /* ── Stale-while-revalidate: CDN resources (Three.js, VRM libs, Fonts) ── */
    if (
        url.hostname === 'cdn.jsdelivr.net' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com'
    ) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                const networkFetch = fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => cached);

                return cached || networkFetch;
            })
        );
        return;
    }

    /* ── Cache-first: Local assets + lazy-cache VRM/VRMA ── */
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                if (!response.ok) return response;

                /* Lazily cache large model/animation files after first load */
                const pathname = url.pathname.toLowerCase();
                if (
                    pathname.endsWith('.vrm') ||
                    pathname.endsWith('.vrma') ||
                    pathname.endsWith('.glb')
                ) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }

                return response;
            });
        })
    );
});
