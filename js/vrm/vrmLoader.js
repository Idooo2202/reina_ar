import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — VRM & VRMA Loader
 * Perbaikan path parsing, toleransi fallback animasi GLB,
 * dan sinkronisasi nama file assets.
 * 🚀 GANTI: cache-busting sekarang versi manual (bukan Date.now()
 * yang selalu beda tiap reload) — biar Service Worker & cache
 * Vercel bisa kepake lagi buat kunjungan berulang.
 * ═══════════════════════════════════════════════════════════
 */

export class VRMLoader {
    constructor() {
        this.loader = new GLTFLoader();
        this.loader.register((parser) => new VRMLoaderPlugin(parser));
        this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser));

        this.basePath = '/assets/';

        // 🚀 Versi manual — NAIKIN angka ini tiap kali file di assets/ diganti/diupdate,
        // biar browser & Vercel tau harus ambil versi baru, bukan Date.now() yang
        // selalu beda tiap reload (itu bikin cache gak pernah kepake sama sekali).
        this.cacheBustVersion = '2'; // v2: setelah patch specVersion di file .vrma

        this.avatarFile = 'reina.vrm';

        // 🚀 Disesuaikan dengan nama file asli di folder assets
        this.animationFiles = [
            'idle.vrma',
            'talking.vrma',
            'angry.vrma',
            'sad.vrma',
            'welcome.vrma',
            'kiss.vrma',
            'sit.vrma',
            'yawn.vrma',
            'bashfull.vrma', // Diperbaiki: menggunakan 2 huruf 'l' sesuai folder assets
            'handraising.vrma'
        ];
    }

    buildAssetUrl(filename) {
        const encodedFilename = encodeURI(filename);
        return `${this.basePath}${encodedFilename}?v=${this.cacheBustVersion}`;
    }

    normalizeClipKey(filename) {
        return filename.replace('.vrma', '').toLowerCase().replace(/\s+/g, '_');
    }

    bindVRMAnimationClip(vrmAnimation, vrmInstance) {
        if (typeof vrmAnimation.createAnimationClip === 'function') {
            return vrmAnimation.createAnimationClip(vrmInstance);
        }
        return createVRMAnimationClip(vrmAnimation, vrmInstance);
    }

    async loadAll(onProgress) {
        console.log('[VRMLoader] Memulai proses muat aset...');
        const totalItems = this.animationFiles.length + 1;
        let loadedItems = 0;

        const tick = (label) => {
            loadedItems++;
            console.log(`[VRMLoader] Loaded: ${label} (${loadedItems}/${totalItems})`);
            if (onProgress) onProgress(loadedItems / totalItems);
        };

        try {
            const vrm = await this.loadVRM(this.avatarFile);
            tick(this.avatarFile);

            vrm.scene.traverse((obj) => {
                obj.frustumCulled = false;
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });
            vrm.scene.rotation.y = Math.PI;
            vrm.scene.updateMatrixWorld(true);

            const clips = new Map();

            const tasks = this.animationFiles.map((filename) =>
                (async () => {
                    try {
                        const clip = await this.loadVRMA(filename, vrm);
                        const key = this.normalizeClipKey(filename);
                        clip.name = key;
                        clips.set(key, clip);
                        tick(filename);
                    } catch (err) {
                        const url = this.buildAssetUrl(filename);
                        console.error(
                            `[VRMLoader] Failed to fetch ${filename} at ${url} — ${err.message}`
                        );
                        tick(filename);
                    }
                })()
            );

            await Promise.allSettled(tasks);

            if (!clips.has('idle')) {
                throw new Error("[VRMLoader] 'idle.vrma' wajib ada — inisialisasi avatar gagal.");
            }

            console.log(`[VRMLoader] Selesai: ${clips.size}/${this.animationFiles.length} animasi.`);
            return { vrm, clips };
        } catch (error) {
            console.error('[VRMLoader] FATAL:', error);
            throw error;
        }
    }

    async fetchAssetBuffer(filename, maxRetries = 3) {
        const url = this.buildAssetUrl(filename);
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Status ${response.status}`);
                }
                return { url, buffer: await response.arrayBuffer() };
            } catch (error) {
                lastError = error;
                console.warn(
                    `[VRMLoader] Percobaan ${attempt}/${maxRetries} gagal buat ${filename}: ${error.message}`
                );
                if (attempt < maxRetries) {
                    const delay = attempt * 800;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(
            `[VRMLoader] Failed to fetch ${filename} at ${url} — ${lastError?.message} (gagal setelah ${maxRetries}x percobaan)`
        );
    }

    async loadVRM(filename) {
        const { buffer } = await this.fetchAssetBuffer(filename);

        return new Promise((resolve, reject) => {
            try {
                this.loader.parse(
                    buffer,
                    this.basePath,
                    (gltf) => {
                        const vrm = gltf.userData.vrm;
                        if (!vrm) {
                            reject(new Error(`[VRMLoader] Bukan file VRM valid: ${filename}`));
                            return;
                        }
                        resolve(vrm);
                    },
                    (err) => reject(new Error(`[VRMLoader] Parse VRM gagal: ${err.message || err}`))
                );
            } catch (err) {
                reject(err);
            }
        });
    }

    async loadVRMA(filename, vrmInstance) {
        const { buffer } = await this.fetchAssetBuffer(filename);

        return new Promise((resolve, reject) => {
            try {
                this.loader.parse(
                    buffer,
                    this.basePath,
                    (gltf) => {
                        const vrmAnimation = gltf.userData.vrmAnimation;

                        // 1. Jika ini file VRMAnimation resmi (.vrma) — jalur normal, hasil paling akurat
                        if (vrmAnimation) {
                            const clip = this.bindVRMAnimationClip(
                                vrmAnimation,
                                vrmInstance
                            );
                            resolve(clip);
                            return;
                        }

                        // 2. Fallback: kalau plugin gak nemu vrmAnimation (mis. specVersion belum
                        //    dipatch), coba pakai gltf.animations mentah. CATATAN: ini gak di-retarget
                        //    ke skeleton, jadi berpotensi gak nempel ke bone dan avatar diem T-pose.
                        if (gltf.animations && gltf.animations.length > 0) {
                            console.warn(
                                `[VRMLoader] Fallback GLTF animation untuk ${filename} — ` +
                                `kalau avatar T-pose, jalanin patch_vrma_specversion.py dulu.`
                            );
                            resolve(gltf.animations[0]);
                            return;
                        }

                        reject(
                            new Error(
                                `[VRMLoader] Tidak ada VRMAnimation atau gltf.animations di ${filename}`
                            )
                        );
                    },
                    (err) =>
                        reject(
                            new Error(`[VRMLoader] Parse VRMA gagal (${filename}): ${err.message || err}`)
                        )
                );
            } catch (err) {
                reject(err);
            }
        });
    }
}