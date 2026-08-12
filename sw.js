/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — Service Worker
 * Network-first for local scripts/styles (Dev friendly),
 * Lazy-caches large VRM/VRMA assets after first download.
 * ═══════════════════════════════════════════════════════════
 */

// Naikkan versi cache untuk menghapus cache lama v6 otomatis
const CACHE_NAME = 'reina-ar-v7';

/** Aset statis utama untuk pre-cache saat install */
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
    // Langsung aktifkan Service Worker baru tanpa menunggu tab lama ditutup
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

/* ──────── ACTIVATE ──────── */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            // Hapus semua cache versi lama (misal: reina-ar-v6)
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

    /* Biarkan request non-GET (seperti POST ke API) lewat langsung */
    if (event.request.method !== 'GET') return;

    /* ── 1. Network-only: Gemini API ── */
    if (url.hostname === 'generativelanguage.googleapis.com') {
        event.respondWith(fetch(event.request));
        return;
    }

    /* ── 2. Stale-while-revalidate: Library CDN (Three.js, Fonts) ── */
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

    const pathname = url.pathname.toLowerCase();

    /* ── 3. Cache-First: Aset Model 3D & Animasi (.vrm, .vrma, .glb) ── */
    if (
        pathname.endsWith('.vrm') ||
        pathname.endsWith('.vrma') ||
        pathname.endsWith('.glb')
    ) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;

                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    /* ── 4. Network-First: File Kode Local (.js, .css, .html) ── */
    // Di sini kuncinya: Minta ke server/localhost dulu agar perubahan kode selalu terbaca!
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Jika offline atau jaringan gagal, baru gunakan cache
                return caches.match(event.request);
            })
    );
});