import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

/**
 * ═══════════════════════════════════════════════════════════
 * REINA MOBILE AR — VRM & VRMA Loader
 * 🚀 FIX AKAR MASALAH T-POSE: property yang bener itu
 * "userData.vrmAnimations" (JAMAK, array) — bukan
 * "userData.vrmAnimation" (tunggal) yang dipakai sejak awal.
 * Dikonfirmasi dari source code resmi pixiv/three-vrm.
 * ═══════════════════════════════════════════════════════════
 */

export class VRMLoader {
    constructor() {
        // Loader terpisah buat avatar vs animasi (best practice dari contoh resmi)
        this.loaderVRM = new GLTFLoader();
        this.loaderVRM.register((parser) => new VRMLoaderPlugin(parser));

        this.loaderVRMA = new GLTFLoader();
        this.loaderVRMA.register((parser) => new VRMAnimationLoaderPlugin(parser));

        this.basePath = '/assets/';

        // Versi manual — NAIKIN angka ini tiap kali file di assets/ diganti/diupdate
        this.cacheBustVersion = '4'; // v4: fix akar masalah userData.vrmAnimations

        this.avatarFile = 'reina.vrm';

        this.animationFiles = [
            'idle.vrma',
            'talking.vrma',
            'angry.vrma',
            'sad.vrma',
            'welcome.vrma',
            'kiss.vrma',
            'sit.vrma',
            'yawn.vrma',
            'bashfull.vrma',
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
                this.loaderVRM.parse(
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
                this.loaderVRMA.parse(
                    buffer,
                    this.basePath,
                    (gltf) => {
                        // 🚀 FIX AKAR MASALAH: "vrmAnimations" (JAMAK, array) — bukan
                        // "vrmAnimation" (tunggal) yang dipakai sejak awal. Ini penyebab
                        // T-pose selama ini, bukan soal specVersion/extensionsRequired/versi library.
                        const vrmAnimations = gltf.userData.vrmAnimations;
                        const vrmAnimation = (vrmAnimations && vrmAnimations.length > 0)
                            ? vrmAnimations[0]
                            : null;

                        if (vrmAnimation) {
                            const clip = this.bindVRMAnimationClip(vrmAnimation, vrmInstance);
                            resolve(clip);
                            return;
                        }

                        // Fallback (safety net) — seharusnya udah gak pernah kepake lagi
                        if (gltf.animations && gltf.animations.length > 0) {
                            console.warn(
                                `[VRMLoader] Fallback GLTF animation untuk ${filename} — ` +
                                `userData.vrmAnimations kosong, ini seharusnya gak kejadian lagi.`
                            );
                            resolve(gltf.animations[0]);
                            return;
                        }

                        reject(
                            new Error(
                                `[VRMLoader] Tidak ada vrmAnimations atau gltf.animations di ${filename}`
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